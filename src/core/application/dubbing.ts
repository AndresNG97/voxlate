/**
 * Caso de uso: doblar un vídeo leyendo en voz alta la frase traducida activa.
 *
 * Dos modos:
 * - Sincronización (automático): para cada frase calcula con solveSync()
 *   cuánto acelerar la voz y cuánto ralentizar el vídeo para que quepa.
 *   Cuando la voz termina, el vídeo vuelve a su velocidad.
 * - Manual: voz y vídeo a las velocidades fijas que elige el usuario.
 *
 * En los dos:
 * - Si la voz se queda atrás, como mucho deja una frase en cola; si va más
 *   retrasada, corta y salta a la frase actual para no desincronizarse.
 * - Baja el volumen del audio original mientras está activo.
 * - Respeta los cambios de volumen y velocidad que haga el usuario.
 * - current() dice qué frase está sonando, para que los subtítulos la
 *   mantengan en pantalla mientras se lee.
 *
 * No sabe nada de Chrome ni de YouTube: habla con SpeechSynthesizerPort y MediaElementPort.
 */
import { DEFAULT_CHARS_PER_SEC, solveSync } from '../domain/dub-sync';
import type { MediaElementPort } from '../ports/media-element';
import type { SpeakResult, SpeechSynthesizerPort } from '../ports/speech-synthesizer';

export interface DubCue {
  /** Identificador estable de la frase (cambia cuando empieza otra). */
  key: string;
  /** Texto traducido, el que se lee. */
  text: string;
  /** Texto original, para mostrarlo mientras suena. */
  original: string;
  start: number;
  end: number;
  /** Inicio de la frase siguiente (ms), para aprovechar el silencio entre frases. */
  nextStart?: number;
}

export interface DubOptions {
  lang: string;
  voiceName: string;
  /** Velocidad de la voz (base en sincronización, fija en manual). */
  rate: number;
  /** Volumen del original mientras se dobla, en % (0-100). */
  originalVolume: number;
  /** true = modo sincronización; false = manual. */
  sync: boolean;
  /** Modo manual: velocidad del vídeo como factor (0,85 = 85%). */
  videoRate: number;
}

/** Como mucho, cuánto puede alargarse una frase dentro del silencio que la sigue. */
const MAX_GAP_MS = 2000;

/**
 * c calibrado por voz (caracteres por segundo a velocidad 1). Vive fuera del
 * servicio para no perder la calibración al cambiar de vídeo.
 */
export class VoiceCalibration {
  private readonly cps = new Map<string, number>();

  get(voice: string): number {
    return this.cps.get(voice) ?? DEFAULT_CHARS_PER_SEC;
  }

  /** Media móvil con lo que ha tardado de verdad una frase. */
  record(voice: string, chars: number, rate: number, durationMs: number) {
    if (chars < 12 || durationMs < 400) return; // frases muy cortas: medida poco fiable
    const measured = chars / ((durationMs / 1000) * rate);
    if (!Number.isFinite(measured)) return;
    this.cps.set(voice, clamp(this.get(voice) * 0.7 + measured * 0.3, 6, 30));
  }
}

export interface DubbingDeps {
  speech: SpeechSynthesizerPort;
  media: MediaElementPort;
  calibration: VoiceCalibration;
  options: () => DubOptions;
  onError: (message: string) => void;
}

export class DubbingService {
  private enabled = false;
  private lastKey = '';
  /** Frases enviadas que no han terminado: [0] es la que suena, [1] la de la cola. */
  private queue: DubCue[] = [];
  /** Se incrementa al cortar; las respuestas de generaciones viejas se ignoran. */
  private gen = 0;
  /** Date.now() estimado en el que termina todo lo encolado. */
  private speechEndsAt = 0;
  /** Volumen y velocidad que hemos puesto nosotros, para distinguirlos de los del usuario. */
  private ownVolume: number | null = null;
  private userVolume: number;
  private ownRate: number | null = null;
  private userRate: number;
  private lastError = '';
  private readonly unsubscribe: (() => void)[];

  constructor(private readonly deps: DubbingDeps) {
    this.userVolume = deps.media.volume;
    this.userRate = deps.media.playbackRate;
    this.unsubscribe = [
      deps.media.on('volumechange', this.onVolumeChange),
      deps.media.on('ratechange', this.onRateChange),
    ];
  }

  /** Para la voz, devuelve volumen y velocidad originales y se da de baja. */
  dispose() {
    this.stop();
    this.restoreVolume();
    this.restoreRate();
    this.unsubscribe.forEach((off) => off());
  }

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    this.lastError = '';
    if (on) {
      this.lastKey = '';
      this.applySettings();
    } else {
      this.stop();
      this.restoreVolume();
      this.restoreRate();
    }
  }

  /** Vuelve a aplicar volumen y velocidad (al cambiar los ajustes). */
  applySettings() {
    if (!this.enabled) return;
    const o = this.deps.options();
    this.setVolume((this.userVolume * o.originalVolume) / 100);
    if (!o.sync) this.setRate(this.userRate * o.videoRate);
    else if (!this.queue.length) this.restoreRate();
  }

  /** La frase que está sonando ahora mismo, o null. */
  current(): DubCue | null {
    return this.enabled ? (this.queue[0] ?? null) : null;
  }

  /** Llamar en cada tick con la frase traducida activa según el tiempo del vídeo. */
  tick(ms: number, cue: DubCue | null) {
    if (!this.enabled || this.deps.media.paused || !cue || cue.key === this.lastKey) return;
    if (!cue.text) return; // la traducción aún no ha llegado: lo intentamos en el siguiente tick
    const elapsed = ms - cue.start;
    // Llegó tarde (seek, traducción lenta): mejor saltarla que hablar a destiempo.
    if (elapsed > 1500 && elapsed > (cue.end - cue.start) / 2) {
      this.lastKey = cue.key;
      return;
    }
    this.speak(cue);
  }

  /** Corta la voz y olvida la última frase (seek, cambio de idioma o de pista). */
  reset() {
    this.stop();
    this.lastKey = '';
    if (this.enabled && this.deps.options().sync) this.restoreRate();
  }

  pause() {
    if (this.enabled) this.deps.speech.pause();
  }

  resume() {
    if (this.enabled) this.deps.speech.resume();
  }

  // ------------------------------------------------------------------ voz

  private voiceKey(o: DubOptions) {
    return `${o.lang}|${o.voiceName}`;
  }

  private speak(cue: DubCue) {
    this.lastKey = cue.key;
    const o = this.deps.options();

    // Si la voz va muy atrasada, cortamos y empezamos por la frase actual.
    if (this.queue.length >= 2) this.stop();
    const queued = this.queue.length > 0;
    const now = Date.now();
    const c = this.deps.calibration.get(this.voiceKey(o));

    let voiceRate = o.rate;
    if (o.sync) {
      // Hueco: hasta que empieza la siguiente frase (aprovecha el silencio), con tope.
      const windowEnd = Math.min(cue.nextStart ?? Infinity, cue.end + MAX_GAP_MS);
      // Lo que aún le queda a la frase anterior se come parte del hueco
      // (segundos reales → segundos de vídeo a la velocidad del usuario).
      const lagSec = queued ? Math.max(0, this.speechEndsAt - now) / 1000 : 0;
      const result = solveSync({
        chars: cue.text.length,
        windowSec: (windowEnd - cue.start) / 1000 - lagSec * this.userRate,
        charsPerSec: c,
        baseVoiceRate: o.rate,
        baseVideoRate: this.userRate,
      });
      voiceRate = result.voiceRate;
      this.setRate(result.videoRate);
    }

    const speechMs = (cue.text.length / (c * voiceRate)) * 1000;
    this.speechEndsAt = Math.max(now, this.speechEndsAt) + speechMs;

    const gen = this.gen;
    this.queue.push(cue);
    // Red de seguridad por si no llega la respuesta (p. ej. se reinicia el service worker).
    const timeoutMs = Math.max(8000, this.speechEndsAt - now + speechMs + 4000);
    withTimeout(
      this.deps.speech.speak({ text: cue.text, lang: o.lang, voiceName: o.voiceName, rate: voiceRate, enqueue: queued }),
      timeoutMs,
    )
      .then((res) => this.onSpoken(res, o, cue, voiceRate))
      .catch(() => {})
      .finally(() => {
        if (gen !== this.gen) return;
        this.queue.shift();
        if (!this.queue.length) {
          this.speechEndsAt = Date.now();
          // Sincronización: la voz ha terminado → el vídeo vuelve a su velocidad.
          if (this.enabled && this.deps.options().sync) this.restoreRate();
        }
      });
  }

  private onSpoken(res: SpeakResult | undefined, o: DubOptions, cue: DubCue, rate: number) {
    if (!res) return;
    if (res.ok && res.durationMs) this.deps.calibration.record(this.voiceKey(o), cue.text.length, rate, res.durationMs);
    if (!res.ok && res.event !== 'interrupted' && res.event !== 'cancelled') {
      this.reportError(res.event === 'no-voice' ? `No hay ninguna voz instalada para "${o.lang}".` : (res.error ?? res.event));
    }
  }

  private stop() {
    this.gen++;
    if (this.queue.length) this.deps.speech.stop();
    this.queue = [];
    this.speechEndsAt = 0;
  }

  // ------------------------------------------------- volumen y velocidad

  private setVolume(volume: number) {
    this.ownVolume = clamp(volume, 0, 1);
    this.deps.media.volume = this.ownVolume;
  }

  private restoreVolume() {
    if (this.ownVolume === null) return;
    this.ownVolume = null;
    this.deps.media.volume = this.userVolume;
  }

  private setRate(rate: number) {
    const r = Math.round(clamp(rate, 0.25, 4) * 100) / 100;
    if (r === this.userRate) return this.restoreRate();
    this.ownRate = r;
    if (this.deps.media.playbackRate !== r) this.deps.media.playbackRate = r;
  }

  private restoreRate() {
    if (this.ownRate === null) return;
    this.ownRate = null;
    this.deps.media.playbackRate = this.userRate;
  }

  private onVolumeChange = () => {
    const v = this.deps.media.volume;
    if (this.ownVolume === null || Math.abs(v - this.ownVolume) < 0.005) return; // es nuestro cambio
    // El usuario ha movido el volumen: lo tomamos como nuevo volumen base.
    this.userVolume = v;
    this.applySettings();
  };

  private onRateChange = () => {
    const r = this.deps.media.playbackRate;
    if (this.ownRate !== null && Math.abs(r - this.ownRate) < 0.005) return; // nuestro
    if (this.ownRate === null && r === this.userRate) return; // restauración nuestra
    // El usuario ha cambiado la velocidad: nueva velocidad base.
    this.ownRate = null;
    this.userRate = r;
    this.applySettings();
  };

  private reportError(message: string) {
    if (message === this.lastError) return;
    this.lastError = message;
    this.deps.onError(message);
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}
