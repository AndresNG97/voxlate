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
import type { VoiceActivityPort } from '../ports/voice-activity';
import { refineWithVoice } from '../domain/timing';
import type { TranslatorPort } from '../ports/translator';
import { t } from '../../i18n';
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

export interface CaptionSessionSnapshot {
  /** Frases de la pista cargada (0 = aún no hay subtítulos). */
  cues: number;
  /** Frases ya traducidas. */
  translated: number;
  /** Motor que se está usando de verdad (el de YouTube puede entrar como plan B). */
  engine: 'chrome' | 'youtube' | null;
  /** Frases con tiempos de palabras (precisos); el resto, tiempos del bloque. */
  timedByWords: number;
}

export interface CaptionSessionDeps {
  translator: TranslatorPort;
  view: SubtitleViewPort;
  media: MediaElementPort;
  dubbing: DubbingService;
  settings: () => Settings;
  /** Traducciones guardadas de vídeos ya vistos. */
  cache?: TranslationCachePort;
  /** Tramos de voz detectados en el audio real (opción de precisión). */
  voice?: VoiceActivityPort;
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

/** Foto de lo que está haciendo la sesión (para la pestaña Estado del popup). */
  snapshot(): CaptionSessionSnapshot {
    const cues = this.track?.cues ?? [];
    return {
      cues: cues.length,
      translated: this.platformTranslated ? this.platformTranslated.length : this.translations.size,
      engine: !cues.length ? null : this.platformTranslated ? 'youtube' : 'chrome',
      timedByWords: cues.filter((c) => c.timing === 'words').length,
    };
  }

  /** ¿Ya tenemos una pista de subtítulos cargada para este vídeo? */
  hasTrack(): boolean {
    return !!this.track?.cues.length;
  }

  /**
   * Nueva pista de subtítulos para este vídeo. Si es la misma pista con los
   * mismos textos y solo cambian los tiempos (p. ej. al llegar los automáticos
   * para sincronizar), se actualizan los tiempos sin volver a traducir.
   */
  load(track: CaptionTrack) {
    const prev = this.track;
    if (prev && prev.id === track.id && sameTexts(prev.cues, track.cues)) {
      this.track = track;
      this.render();
      return;
    }
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
      if (!text) continue;
      const nextStart = list[i + 1]?.start;
      upcoming.push({ ...this.timed(cue, nextStart), key: `${this.platformTranslated ? 'p' : 'c'}${i}`, text, original: '', nextStart });
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
      if (j < 0) return i >= 0 ? { ...cues[i]!, key: `o${i}`, text: '', original } : null;
      const nextStart = list[j + 1]?.start;
      return { ...this.timed(list[j]!, nextStart), key: `p${j}`, original, nextStart };
    }
    if (i < 0) return null;
    // Tiempos de la frase original (afinados si se puede); el texto, su traducción.
    const nextStart = cues[i + 1]?.start;
    return { ...this.timed(cues[i]!, nextStart), key: `c${i}`, text: this.translations.get(i) ?? '', original, nextStart };
  }

  /**
   * Con la opción de precisión, ajusta inicio y fin del habla de la frase a
   * los tramos de voz detectados en el audio real. Si esa zona aún no se ha
   * analizado, la deja como está.
   */
  private timed<T extends Cue>(cue: T, nextStart?: number): T {
    const { voice, settings } = this.deps;
    if (!voice || !settings().audioPrecision) return cue;
    const intervals = voice.intervals(cue.start - 1500, cue.end + 1500);
    return intervals.length ? (refineWithVoice(cue, intervals, nextStart) as T) : cue;
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
      this.deps.view.setStatus(t.page.missingModel(track.lang, s.targetLang), {
        label: t.page.download,
        onClick: async () => {
          this.status(t.page.downloadingModel(0));
          try {
            // El clic da la "activación de usuario" que Chrome exige para descargar el modelo.
            await translator.prepare(track.lang, s.targetLang, (f) =>
              this.status(t.page.downloadingModel(Math.round(f * 100))),
            );
            this.status(null);
            void this.pump();
          } catch {
            void this.usePlatformTranslation(t.page.modelDownloadFailed);
          }
        },
      });
      return;
    }

    // 'unavailable' | 'unsupported' (Chrome antiguo, móvil, hardware insuficiente…)
    return this.usePlatformTranslation(t.page.chromeUnavailable);
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
      this.status(t.page.translateFailed);
      return;
    }
    try {
      this.platformTranslated = await fetchTranslated(this.deps.settings().targetLang);
      this.status(reason ?? null, 5000);
      this.render();
    } catch (e) {
      this.status(t.page.translateFailed);
      console.warn('[voxlate] platform translation', e);
    }
  }
}

function sameTexts(a: Cue[], b: Cue[]): boolean {
  return a.length === b.length && a.every((c, i) => c.text === b[i]!.text);
}
