/**
 * Caso de uso: traducir y mostrar una pista de subtítulos sincronizada con un vídeo.
 *
 * - Traduce por delante del punto de reproducción, en lotes; al saltar vuelve
 *   a priorizar desde ahí.
 * - Si el traductor local no está disponible, usa la pista ya traducida que
 *   ofrezca la plataforma (en YouTube, &tlang=).
 * - Con el doblaje activo, mantiene en pantalla la frase que está sonando
 *   (original + traducción) hasta que la voz termina.
 *
 * Una sesión por vídeo. No sabe nada de YouTube: recibe la pista ya parseada.
 */
import { cuesFingerprint, findCueIndex, firstCueAfter, translationOrder, type Cue } from '../domain/cue';
import { subtitleStyleOf, type Settings } from '../domain/settings';
import { composeLines } from '../domain/subtitles';
import type { MediaElementPort } from '../ports/media-element';
import type { SubtitleViewPort } from '../ports/subtitle-view';
import type { TranslationCachePort } from '../ports/translation-cache';
import type { TranslatorPort } from '../ports/translator';
import type { DubbingService, DubCue } from './dubbing';

export interface CaptionTrack {
  /** Identificador estable de la pista (vídeo + idioma + tipo), para la caché. */
  id?: string;
  cues: Cue[];
  /** Idioma real de la pista (base, p. ej. 'en'). */
  lang: string;
  /** Pista ya traducida por la plataforma, como plan B. */
  fetchTranslated?: (targetLang: string) => Promise<Cue[]>;
}

export interface CaptionSessionDeps {
  translator: TranslatorPort;
  view: SubtitleViewPort;
  media: MediaElementPort;
  dubbing: DubbingService;
  settings: () => Settings;
  /** Traducciones guardadas de vídeos ya vistos. */
  cache?: TranslationCachePort;
  /** ¿Están visibles los controles del reproductor? (para apartar los subtítulos) */
  controlsVisible?: () => boolean;
}

const BATCH_SIZE = 6;
/** Cada cuántos lotes se guarda el progreso (además de al terminar y al salir). */
const SAVE_EVERY_BATCHES = 10;
/** Cuánto vídeo por delante se prepara el audio del doblaje. */
const PRELOAD_AHEAD_MS = 90_000;
/** Como mucho, cada cuánto se recalcula qué preparar. */
const PRELOAD_EVERY_MS = 1000;

export class CaptionSession {
  private track: CaptionTrack | null = null;
  /** Traducciones por índice de frase (traductor local). */
  private readonly translations = new Map<number, string>();
  /** Pista ya traducida por la plataforma (plan B). */
  private platformTranslated: Cue[] | null = null;
  private pumpToken = 0;
  /** Clave de caché de la pista e idioma actuales (null = sin caché). */
  private cacheKey: string | null = null;
  /** Hay traducciones nuevas sin guardar. */
  private dirty = false;
  private lastPreloadAt = 0;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly unsubscribe: (() => void)[];

  constructor(private readonly deps: CaptionSessionDeps) {
    const { media, dubbing } = deps;
    this.unsubscribe = [
      media.onTick(() => this.render()),
      media.on('play', () => dubbing.resume()),
      media.on('pause', () => dubbing.pause()),
      media.on('seeking', () => dubbing.reset()),
      media.on('seeked', () => {
        this.lastPreloadAt = 0; // prioriza enseguida la nueva zona
        void this.pump();
      }),
    ];
    deps.view.setStyle(subtitleStyleOf(deps.settings()));
    dubbing.setEnabled(deps.settings().dub);
  }

  dispose() {
    void this.saveCache();
    this.pumpToken++;
    clearTimeout(this.statusTimer);
    this.unsubscribe.forEach((off) => off());
    this.deps.dubbing.dispose();
    this.deps.view.destroy();
  }

  /** Nueva pista de subtítulos para este vídeo. */
  load(track: CaptionTrack) {
    this.track = track;
    void this.restart();
    this.render();
  }

  /** Mensaje temporal o fijo sobre el vídeo. */
  status(message: string | null, autoHideMs?: number) {
    clearTimeout(this.statusTimer);
    this.deps.view.setStatus(message);
    if (message && autoHideMs) this.statusTimer = setTimeout(() => this.deps.view.setStatus(null), autoHideMs);
  }

  /** Reacciona a un cambio de ajustes que no obliga a recrear la sesión. */
  onSettingsChanged(prev: Settings, next: Settings) {
    const { view, dubbing } = this.deps;
    view.setStyle(subtitleStyleOf(next));
    dubbing.setEnabled(next.dub);
    if (
      prev.dubOriginalVolume !== next.dubOriginalVolume ||
      prev.dubSync !== next.dubSync ||
      prev.dubVideoRate !== next.dubVideoRate
    )
      dubbing.applySettings();
    if (prev.dubVoice !== next.dubVoice || prev.neuralVoice !== next.neuralVoice) dubbing.reset();
    if (prev.targetLang !== next.targetLang || prev.engine !== next.engine) void this.restart();
    this.render();
  }

  // ------------------------------------------------------------ render

  render() {
    const { media, view, dubbing, settings, controlsVisible } = this.deps;
    const ms = media.currentTimeMs;
    const active = this.activeCue(ms);
    dubbing.tick(ms, active);
    this.preloadUpcoming(ms);

    // Con doblaje, manda la frase que suena: se queda en pantalla mientras se lee.
    const shown = dubbing.current() ?? active;
    view.show(composeLines(shown?.original ?? '', shown?.text ?? '', settings()));
    view.setControlsVisible(!!controlsVisible?.() || media.paused);
  }

  /** Pide al doblaje que prepare el audio de las frases traducidas que vienen. */
  private preloadUpcoming(ms: number) {
    if (!this.deps.settings().dub) return;
    const now = Date.now();
    if (now - this.lastPreloadAt < PRELOAD_EVERY_MS) return;
    this.lastPreloadAt = now;

    const upcoming: DubCue[] = [];
    const list = this.platformTranslated ?? this.track?.cues ?? [];
    for (let i = firstCueAfter(list, ms); i < list.length && list[i]!.start < ms + PRELOAD_AHEAD_MS; i++) {
      const cue = list[i]!;
      const text = this.platformTranslated ? cue.text : this.translations.get(i);
      if (text) upcoming.push({ key: `${i}`, text, original: '', start: cue.start, end: cue.end });
    }
    this.deps.dubbing.preload(upcoming);
  }

  /** La frase activa según el tiempo del vídeo, con su traducción (si ya la hay). */
  private activeCue(ms: number): DubCue | null {
    const cues = this.track?.cues ?? [];
    const i = findCueIndex(cues, ms);
    const original = i >= 0 ? cues[i]!.text : '';

    if (this.platformTranslated) {
      const list = this.platformTranslated;
      const j = findCueIndex(list, ms);
      if (j < 0) return i >= 0 ? { key: `o${i}`, text: '', original, start: cues[i]!.start, end: cues[i]!.end } : null;
      return { key: `p${j}`, ...list[j]!, original, nextStart: list[j + 1]?.start };
    }
    if (i < 0) return null;
    const cue = cues[i]!;
    return {
      key: `c${i}`,
      text: this.translations.get(i) ?? '',
      original,
      start: cue.start,
      end: cue.end,
      nextStart: cues[i + 1]?.start,
    };
  }

  // -------------------------------------------------------- traducción

  private async restart() {
    const { settings, translator, dubbing, cache } = this.deps;
    // Lo traducido para el idioma anterior se guarda antes de empezar de cero.
    void this.saveCache();
    this.translations.clear();
    this.platformTranslated = null;
    const token = ++this.pumpToken;
    dubbing.reset();
    this.status(null);
    const track = this.track;
    const s = settings();
    this.cacheKey = null;
    if (!track?.cues.length || track.lang === s.targetLang) return this.render();

    if (s.engine === 'youtube') return this.usePlatformTranslation();

    // ¿Ya vimos este vídeo? Recuperamos lo traducido y solo falta el resto.
    if (track.id && cache) {
      const key = `${track.id}|${cuesFingerprint(track.cues)}|${track.lang}>${s.targetLang}`;
      const saved = await cache.load(key).catch(() => null);
      if (token !== this.pumpToken) return;
      this.cacheKey = key;
      if (saved?.length === track.cues.length) {
        saved.forEach((t, i) => t != null && this.translations.set(i, t));
        this.render();
      }
      if (this.translations.size === track.cues.length) return; // vídeo entero ya traducido
    }

    const state = await translator.availability(track.lang, s.targetLang);
    if (token !== this.pumpToken) return;
    if (state === 'available') return this.pump();

    if (state === 'downloadable' || state === 'downloading') {
      this.deps.view.setStatus(`Falta el traductor ${track.lang} → ${s.targetLang} (se descarga una vez)`, {
        label: 'Descargar',
        onClick: async () => {
          this.status('Descargando modelo… 0%');
          try {
            // El clic da la "activación de usuario" que Chrome exige para descargar el modelo.
            await translator.prepare(track.lang, s.targetLang, (f) =>
              this.status(`Descargando modelo… ${Math.round(f * 100)}%`),
            );
            this.status(null);
            void this.pump();
          } catch {
            void this.usePlatformTranslation('No se pudo descargar el modelo; uso la traducción de YouTube.');
          }
        },
      });
      return;
    }

    // 'unavailable' | 'unsupported' (Chrome antiguo, móvil, hardware insuficiente…)
    return this.usePlatformTranslation('Traductor de Chrome no disponible; uso la traducción de YouTube.');
  }

  /**
   * Traduce la pista entera: desde la posición actual hasta el final y luego
   * lo anterior. Al saltar se reinicia desde el nuevo punto (lo ya traducido se
   * conserva). Va guardando el progreso en la caché.
   */
  private async pump() {
    const token = ++this.pumpToken;
    const track = this.track;
    if (!track || this.platformTranslated) return;
    const { media, translator, settings } = this.deps;
    const order = translationOrder(track.cues.length, firstCueAfter(track.cues, media.currentTimeMs));
    let batchesSinceSave = 0;
    let k = 0;
    while (token === this.pumpToken && k < order.length) {
      const batch: number[] = [];
      for (; k < order.length && batch.length < BATCH_SIZE; k++) {
        const i = order[k]!;
        if (!this.translations.has(i)) batch.push(i);
      }
      if (!batch.length) continue;
      try {
        const out = await translator.translate(
          batch.map((j) => track.cues[j]!.text),
          track.lang,
          settings().targetLang,
        );
        if (token !== this.pumpToken) return;
        batch.forEach((j, n) => this.translations.set(j, out[n] ?? ''));
        this.dirty = true;
        this.render();
        if (++batchesSinceSave >= SAVE_EVERY_BATCHES) {
          batchesSinceSave = 0;
          void this.saveCache();
        }
      } catch (e) {
        console.warn('[voxlate] translate', e);
        break;
      }
    }
    if (token === this.pumpToken) void this.saveCache();
  }

  /** Guarda lo traducido hasta ahora (la foto se toma en el momento de llamar). */
  private async saveCache() {
    const { cache } = this.deps;
    const key = this.cacheKey;
    const total = this.track?.cues.length ?? 0;
    if (!cache || !key || !this.dirty || !total) return;
    const snapshot = Array.from({ length: total }, (_, i) => this.translations.get(i) ?? null);
    this.dirty = false;
    try {
      await cache.save(key, snapshot);
    } catch (e) {
      this.dirty = true;
      console.warn('[voxlate] cache', e);
    }
  }

  private async usePlatformTranslation(reason?: string) {
    const fetchTranslated = this.track?.fetchTranslated;
    if (!fetchTranslated) {
      this.status('No se pudo traducir este vídeo.');
      return;
    }
    try {
      this.platformTranslated = await fetchTranslated(this.deps.settings().targetLang);
      this.status(reason ?? null, 5000);
      this.render();
    } catch (e) {
      this.status('No se pudo traducir este vídeo.');
      console.warn('[voxlate] platform translation', e);
    }
  }
}
