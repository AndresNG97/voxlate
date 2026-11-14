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
import { findCueIndex, firstCueAfter, type Cue } from '../domain/cue';
import { subtitleStyleOf, type Settings } from '../domain/settings';
import { composeLines } from '../domain/subtitles';
import type { MediaElementPort } from '../ports/media-element';
import type { SubtitleViewPort } from '../ports/subtitle-view';
import type { TranslatorPort } from '../ports/translator';
import type { DubbingService, DubCue } from './dubbing';

export interface CaptionTrack {
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
  /** ¿Están visibles los controles del reproductor? (para apartar los subtítulos) */
  controlsVisible?: () => boolean;
}

const BATCH_SIZE = 6;

export class CaptionSession {
  private track: CaptionTrack | null = null;
  /** Traducciones por índice de frase (traductor local). */
  private readonly translations = new Map<number, string>();
  /** Pista ya traducida por la plataforma (plan B). */
  private platformTranslated: Cue[] | null = null;
  private pumpToken = 0;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly unsubscribe: (() => void)[];

  constructor(private readonly deps: CaptionSessionDeps) {
    const { media, dubbing } = deps;
    this.unsubscribe = [
      media.onTick(() => this.render()),
      media.on('play', () => dubbing.resume()),
      media.on('pause', () => dubbing.pause()),
      media.on('seeking', () => dubbing.reset()),
      media.on('seeked', () => void this.pump()),
    ];
    deps.view.setStyle(subtitleStyleOf(deps.settings()));
    dubbing.setEnabled(deps.settings().dub);
  }

  dispose() {
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
    if (prev.dubVoice !== next.dubVoice) dubbing.reset();
    if (prev.targetLang !== next.targetLang || prev.engine !== next.engine) void this.restart();
    this.render();
  }

  // ------------------------------------------------------------ render

  render() {
    const { media, view, dubbing, settings, controlsVisible } = this.deps;
    const ms = media.currentTimeMs;
    const active = this.activeCue(ms);
    dubbing.tick(ms, active);

    // Con doblaje, manda la frase que suena: se queda en pantalla mientras se lee.
    const shown = dubbing.current() ?? active;
    view.show(composeLines(shown?.original ?? '', shown?.text ?? '', settings()));
    view.setControlsVisible(!!controlsVisible?.() || media.paused);
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
    const { settings, translator, dubbing } = this.deps;
    this.translations.clear();
    this.platformTranslated = null;
    this.pumpToken++;
    dubbing.reset();
    this.status(null);
    const track = this.track;
    const s = settings();
    if (!track?.cues.length || track.lang === s.targetLang) return this.render();

    if (s.engine === 'youtube') return this.usePlatformTranslation();

    const state = await translator.availability(track.lang, s.targetLang);
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

  /** Traduce desde la posición actual hacia delante; se reinicia al saltar. */
  private async pump() {
    const token = ++this.pumpToken;
    const track = this.track;
    if (!track || this.platformTranslated) return;
    const { media, translator, settings } = this.deps;
    let i = firstCueAfter(track.cues, media.currentTimeMs);
    while (token === this.pumpToken && i < track.cues.length) {
      const batch: number[] = [];
      for (; i < track.cues.length && batch.length < BATCH_SIZE; i++) if (!this.translations.has(i)) batch.push(i);
      if (!batch.length) continue;
      try {
        const out = await translator.translate(
          batch.map((j) => track.cues[j]!.text),
          track.lang,
          settings().targetLang,
        );
        if (token !== this.pumpToken) return;
        batch.forEach((j, k) => this.translations.set(j, out[k] ?? ''));
        this.render();
      } catch (e) {
        console.warn('[voxlate] translate', e);
        return;
      }
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
