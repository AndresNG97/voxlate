/**
 * Caso de uso: doblar un vídeo leyendo en voz alta la frase traducida activa,
 * a la par que la persona que habla (isocronía, ver domain/dub-sync.ts).
 *
 * Es un planificador que se ejecuta en cada tick del vídeo:
 * - Arranca cada frase cuando la persona empieza a decirla.
 * - Elige la velocidad para que la voz acabe cuando la persona acaba: acelera
 *   si la traducción es más larga y frena si es más corta (sin parones).
 * - Mientras suena, corrige la velocidad unas 4 veces por segundo para ir a la
 *   par del vídeo (si la voz lo permite: Piper sí, chrome.tts no).
 * - Si una frase se alarga, la siguiente empieza al acabar ésta y recupera el
 *   retraso acelerando; si el retraso es grande, corta y salta a la actual.
 * - Ralentiza el vídeo solo como último recurso, y lo devuelve a su velocidad
 *   en cuanto la voz termina.
 * - Baja el volumen del original y respeta los cambios del usuario.
 * - current() dice qué frase está sonando, para mantenerla en pantalla.
 * - preload() prepara por adelantado el audio de las frases que vienen
 *   (voces que lo permiten), y así se conoce su duración exacta.
 *
 * No sabe nada de Chrome ni de YouTube: habla con SpeechSynthesizerPort y MediaElementPort.
 */
import { correctRate, DEFAULT_CHARS_PER_SEC, planSegment } from '../domain/dub-sync';
import type { MediaElementPort } from '../ports/media-element';
import type { SpeakResult, SpeechSynthesizerPort } from '../ports/speech-synthesizer';

export interface DubCue {
  /** Identificador estable de la frase. */
  key: string;
  /** Texto traducido, el que se lee. */
  text: string;
  /** Texto original, para mostrarlo mientras suena. */
  original: string;
  start: number;
  end: number;
  /** Cuándo empieza a hablar la persona (ms de vídeo). Si falta, `start`. */
  speechStart?: number;
  /** Cuándo deja de hablar la persona (ms de vídeo). Si falta, `end`. */
  speechEnd?: number;
  /** Inicio de la frase siguiente (ms de vídeo): la voz nunca debe pisarla. */
  nextStart?: number;
}

export interface DubOptions {
  lang: string;
  voiceName: string;
  /** Velocidad de la voz (base en sincronización, fija en manual). */
  rate: number;
  /** Volumen del original mientras se dobla, en % (0-100). */
  originalVolume: number;
  /** true = sincronización automática; false = manual. */
  sync: boolean;
  /** Modo manual: velocidad del vídeo como factor (0,85 = 85%). */
  videoRate: number;
}

/** Cada cuánto se corrige la velocidad de la frase que suena. */
const CORRECT_EVERY_MS = 250;
/** Si a la frase que suena le queda más que esto cuando ya toca otra, se corta. */
const MAX_LAG_MS = 1800;
/** Una frase que ya va por más de la mitad (y de esto) se salta en vez de leerla tarde. */
const TOO_LATE_MS = 1500;
/** Arrancamos la voz un pelín antes para compensar lo que tarda en empezar a sonar. */
const START_LEAD_MS = 60;
/** Retraso de arranque que se considera "a tiempo". */
const LATE_GRACE_MS = 250;
/** Sin frase siguiente conocida, cuánto puede alargarse la voz tras callar la persona. */
const MAX_SPILL_MS = 1500;

/**
 * Caracteres por segundo de cada voz a velocidad 1 (para estimar D con voces
 * que no preparan el audio). Vive fuera del servicio para no perderlo al cambiar de vídeo.
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
    // Peso alto a lo medido: en 3-4 frases ya se ajusta a la voz real.
    this.cps.set(voice, clamp(this.get(voice) * 0.5 + measured * 0.5, 6, 30));
  }
}

export interface DubbingDeps {
  speech: SpeechSynthesizerPort;
  media: MediaElementPort;
  calibration: VoiceCalibration;
  options: () => DubOptions;
  onError: (message: string) => void;
  /** Una línea por frase con lo que se decidió (para diagnosticar la sincronización). */
  onDebug?: (line: string) => void;
}

/** La frase que está sonando y cuánto lleva leído. */
interface Playing {
  cue: DubCue;
  gen: number;
  /** D: duración a velocidad 1 (exacta o estimada). */
  speechMs: number;
  /** Audio ya leído, medido a velocidad 1. */
  playedMs: number;
  rate: number;
  lastUpdate: number;
  lastCorrection: number;
  /** Momento (ms de vídeo) en que queremos que la voz acabe. */
  deadline: number;
  startedAt: number;
  /** Cuánto más largo que su ritmo natural se generó el audio (1 = natural). */
  stretch: number;
}

export class DubbingService {
  private enabled = false;
  private paused = false;
  /** Última frase arrancada (o descartada por llegar tarde). */
  private lastKey = '';
  private playing: Playing | null = null;
  /** Se incrementa al cortar; las respuestas de generaciones viejas se ignoran. */
  private gen = 0;
  /** Volumen y velocidad que hemos puesto nosotros, para distinguirlos de los del usuario. */
  private ownVolume: number | null = null;
  private userVolume: number;
  private ownRate: number | null = null;
  private userRate: number;
  private lastError = '';
  private readonly unsubscribe: (() => void)[];
  /** Duración exacta (a velocidad 1) de los audios ya preparados, por id. */
  private readonly durations = new Map<string, number>();
  /** Cuánto más largo que su ritmo natural se generó cada audio (1 = natural). */
  private readonly stretches = new Map<string, number>();
  /** Frases que queremos tener preparadas, por orden de prioridad. */
  private wanted: DubCue[] = [];
  private preloading = false;
  /** Frase que está esperando a su audio (para avisarlo una sola vez en el registro). */
  private waitingKey = '';
  /**
   * Tiempo que tarda la voz en generar 1 ms de audio. Empieza pesimista (incluye
   * cargar el modelo) y se ajusta con lo medido. < 1 = va más rápido que el vídeo.
   */
  private renderRatio = 1;
  private renderSamples = 0;
  private warnedSlow = false;

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
      this.warmUp();
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
    if (!o.sync) this.setVideoRate(this.userRate * o.videoRate);
    else if (!this.playing) this.restoreRate();
  }

  /** La frase que está sonando ahora mismo, o null. */
  current(): DubCue | null {
    return this.enabled ? (this.playing?.cue ?? null) : null;
  }

  /**
   * Llamar en cada tick con la frase activa según el tiempo del vídeo (con su
   * traducción, si ya la hay).
   */
  tick(ms: number, cue: DubCue | null) {
    if (!this.enabled || this.deps.media.paused) return;
    const now = Date.now();

    if (this.playing) {
      this.advance(now);
      if (cue && cue.key !== this.playing.cue.key && cue.key !== this.lastKey && cue.text) {
        // Ya habla la persona la frase siguiente y la voz sigue con la anterior.
        const remainingMs = (this.playing.speechMs - this.playing.playedMs) / this.playing.rate;
        if (remainingMs > MAX_LAG_MS) {
          this.stop(); // demasiado retraso: saltamos a la frase actual
        } else {
          this.correct(now, ms, true); // que termine cuanto antes; la siguiente arrancará al acabar
          return;
        }
      } else {
        this.correct(now, ms, false);
        return;
      }
    }

    if (!cue || cue.key === this.lastKey || !cue.text) return;
    // El subtítulo puede aparecer antes de que la persona hable: esperamos a que hable.
    const from = speechStart(cue);
    if (ms < from - START_LEAD_MS) return;
    const elapsed = ms - from;
    const length = speechEnd(cue) - from;
    // Llegó tarde (seek, traducción lenta): mejor saltarla que hablar a destiempo.
    if (elapsed > TOO_LATE_MS && elapsed > length / 2) {
      this.lastKey = cue.key;
      return;
    }
    this.start(cue, ms, now);
  }

  /** Corta la voz y olvida la última frase (seek, cambio de idioma o de pista). */
  reset() {
    this.stop();
    this.lastKey = '';
    if (this.enabled && this.deps.options().sync) this.restoreRate();
  }

  /**
   * Pide tener preparadas estas frases (las próximas, en orden). Sustituye a
   * la lista anterior, así tras un salto se prioriza la nueva zona.
   */
  preload(cues: DubCue[]) {
    if (!this.enabled || !this.deps.speech.prepare) return;
    const o = this.deps.options();
    this.wanted = cues.filter((c) => c.text && !this.durations.has(this.clipId(o, c.text)));
    void this.runPreload();
  }

  pause() {
    if (!this.enabled) return;
    this.advance(Date.now());
    this.paused = true;
    this.deps.speech.pause();
  }

  resume() {
    if (!this.enabled) return;
    this.paused = false;
    if (this.playing) this.playing.lastUpdate = Date.now();
    this.deps.speech.resume();
  }

  // ------------------------------------------------------------------ voz

  private start(cue: DubCue, ms: number, now: number) {
    const o = this.deps.options();
    const id = this.clipId(o, cue.text);
    const exactMs = this.durations.get(id);

    // Con voces que preparan el audio, no arrancamos sin él: esperamos a que
    // esté (lo pedimos el primero) y arrancamos con la ventana que quede.
    if (this.deps.speech.prepare && exactMs === undefined) {
      if (this.waitingKey !== cue.key) {
        this.waitingKey = cue.key;
        this.deps.onDebug?.(`${cue.key} esperando a que se prepare su audio (llega tarde)`);
      }
      if (this.wanted[0]?.key !== cue.key && !this.wontMakeIt(cue)) this.wanted.unshift(cue);
      void this.runPreload();
      return;
    }

    const speechMs = exactMs ?? (cue.text.length / this.deps.calibration.get(this.voiceKey(o))) * 1000;

    // Objetivo: acabar cuando acaba la persona. Si arrancamos tarde (el audio no
    // estaba listo o la frase anterior se alargó), NO corremos para recuperar:
    // retrasamos el final lo mismo que el retraso, sin pisar la frase siguiente.
    const lateMs = Math.max(0, ms - speechStart(cue));
    let deadline = speechEnd(cue);
    if (lateMs > LATE_GRACE_MS) {
      const limit = cue.nextStart ?? deadline + MAX_SPILL_MS;
      deadline = Math.max(deadline, Math.min(deadline + lateMs, limit));
    }

    let voiceRate = o.rate;
    let videoRate = this.userRate;
    if (o.sync) {
      const plan = planSegment({
        speechMs,
        windowMs: (deadline - ms) / this.userRate,
        baseVoiceRate: o.rate,
        baseVideoRate: this.userRate,
        generatedStretch: this.stretches.get(id),
      });
      voiceRate = plan.voiceRate;
      videoRate = plan.videoRate;
      this.setVideoRate(videoRate);
    }

    const gen = ++this.gen;
    this.lastKey = cue.key;
    this.playing = {
      cue,
      gen,
      speechMs,
      playedMs: 0,
      rate: voiceRate,
      lastUpdate: now,
      lastCorrection: now,
      deadline,
      startedAt: now,
      stretch: this.stretches.get(id) ?? 1,
    };
    this.deps.onDebug?.(
      `${cue.key} «${cue.text.slice(0, 40)}» · persona ${Math.round(speechEnd(cue) - speechStart(cue))} ms · ` +
        `voz ${Math.round(speechMs)} ms${exactMs === undefined ? ' (estimada)' : ''} · ` +
        `arranca ${lateMs > LATE_GRACE_MS ? `TARDE +${Math.round(lateMs)}` : `+${Math.round(lateMs)}`} ms · ` +
        `voz ×${voiceRate.toFixed(2)} · vídeo ${Math.round((videoRate / this.userRate) * 100)}%`,
    );

    // Red de seguridad por si no llega la respuesta (p. ej. se reinicia el service worker).
    const timeoutMs = (speechMs / voiceRate) * 2 + 4000;
    withTimeout(
      this.deps.speech.speak({
        id: this.deps.speech.prepare ? id : undefined,
        text: cue.text,
        lang: o.lang,
        voiceName: o.voiceName,
        rate: voiceRate,
        enqueue: false,
      }),
      timeoutMs,
    )
      .then((res) => this.onSpoken(res, o, cue, voiceRate, now))
      .catch((e: unknown) => this.reportError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (this.playing?.gen !== gen) return;
        const endDelta = this.deps.media.currentTimeMs - speechEnd(cue);
        this.deps.onDebug?.(
          `${cue.key} terminó ${endDelta >= 0 ? `${Math.round(endDelta)} ms después` : `${Math.round(-endDelta)} ms antes`} que la persona`,
        );
        this.playing = null;
        // Sincronización: la voz ha terminado → el vídeo vuelve a su velocidad.
        if (this.enabled && this.deps.options().sync) this.restoreRate();
      });
  }

  /** Acumula lo leído desde la última vez (a la velocidad que iba). */
  private advance(now: number) {
    const p = this.playing;
    if (!p || this.paused) return;
    p.playedMs = Math.min(p.speechMs, p.playedMs + (now - p.lastUpdate) * p.rate);
    p.lastUpdate = now;
  }

  /**
   * Corrección continua: ajusta la velocidad para acabar con el hablante.
   * `hurry` = ya toca la siguiente frase: el objetivo es acabar ya.
   */
  private correct(now: number, ms: number, hurry: boolean) {
    const p = this.playing;
    const { speech, media } = this.deps;
    if (!p || !speech.setRate || now - p.lastCorrection < CORRECT_EVERY_MS) return;
    const o = this.deps.options();
    if (!o.sync) return;
    p.lastCorrection = now;
    const videoRate = media.playbackRate || 1;
    const next = correctRate({
      remainingSpeechMs: p.speechMs - p.playedMs,
      remainingWindowMs: hurry ? 0 : (p.deadline - ms) / videoRate,
      currentRate: p.rate,
      baseVoiceRate: o.rate,
      generatedStretch: p.stretch,
    });
    if (Math.abs(next - p.rate) / p.rate < 0.015) return; // cambios imperceptibles: no molestamos
    this.advance(now);
    p.rate = next;
    speech.setRate(next);
  }

  private onSpoken(res: SpeakResult | undefined, o: DubOptions, cue: DubCue, rate: number, startedAt: number) {
    if (!res) return;
    // Voces sin audio preparado (sistema): aprendemos lo rápido que hablan de verdad.
    // Si la voz no avisa de cuándo empezó, medimos desde que la pedimos.
    if (res.ok && !this.deps.speech.prepare) {
      const durationMs = res.durationMs ?? Date.now() - startedAt;
      this.deps.calibration.record(this.voiceKey(o), cue.text.length, rate, durationMs);
    }
    if (!res.ok && res.event !== 'interrupted' && res.event !== 'cancelled') {
      this.reportError(res.event === 'no-voice' ? `No hay ninguna voz instalada para "${o.lang}".` : (res.error ?? res.event));
    }
  }

  private stop() {
    this.gen++;
    if (this.playing) this.deps.speech.stop();
    this.playing = null;
  }

  // ------------------------------------------------------------ precarga

  private voiceKey(o: DubOptions) {
    return `${o.lang}|${o.voiceName}`;
  }

  /** Id del audio de una frase con la voz actual (lo comparten preload y speak). */
  private clipId(o: DubOptions, text: string) {
    return `${o.voiceName}|${text}`;
  }

  /**
   * ¿Llegará tarde esta frase aunque empecemos a prepararla ya? Estima cuándo
   * estaría lista (duración estimada × lo que tarda en generar) y aplica la
   * misma regla que al arrancar: más de la mitad y más de TOO_LATE_MS → se salta.
   */
  private wontMakeIt(cue: DubCue): boolean {
    const o = this.deps.options();
    const estSpeechMs = (cue.text.length / this.deps.calibration.get(this.voiceKey(o))) * 1000;
    const readyAt = this.deps.media.currentTimeMs + estSpeechMs * this.renderRatio * (this.deps.media.playbackRate || 1);
    const late = readyAt - cue.start;
    return late > TOO_LATE_MS && late > (speechEnd(cue) - cue.start) / 2;
  }

  /**
   * Si el equipo genera la voz más despacio de lo que se habla, no hay forma de
   * llegar a todas las frases: lo avisamos una vez (tras unas cuantas medidas).
   */
  private checkRenderSpeed() {
    this.renderSamples++;
    if (this.warnedSlow || this.renderSamples < 5 || this.renderRatio < 0.95) return;
    this.warnedSlow = true;
    this.deps.onError(
      'tu equipo genera la voz neuronal más despacio que el vídeo y se saltarán frases. Prueba la voz del sistema (pestaña Voz).',
    );
  }

  /** Carga el modelo de voz en cuanto se activa el doblaje, para no perder las primeras frases. */
  private warmUp() {
    const prepare = this.deps.speech.prepare;
    if (!prepare) return;
    const o = this.deps.options();
    prepare.call(this.deps.speech, { id: '__warmup__', text: 'Hola.', lang: o.lang, voiceName: o.voiceName }).catch(() => {});
  }

  private async runPreload() {
    const prepare = this.deps.speech.prepare?.bind(this.deps.speech);
    if (this.preloading || !prepare) return;
    this.preloading = true;
    try {
      while (this.enabled) {
        const cue = this.wanted.shift();
        if (!cue) break;
        const o = this.deps.options();
        const id = this.clipId(o, cue.text);
        if (this.durations.has(id)) continue;
        // Si no va a estar a tiempo, ni lo intentamos: preparamos la siguiente a la que sí llegamos.
        if (this.wontMakeIt(cue)) continue;
        const t0 = Date.now();
        const res = await prepare({
          id,
          text: cue.text,
          lang: o.lang,
          voiceName: o.voiceName,
          // En sincronización, que la voz se genere ya con la duración de lo que habla la persona.
          targetMs: o.sync ? ((speechEnd(cue) - cue.start) / this.userRate) * o.rate : undefined,
        });
        this.durations.set(res.id, res.durationMs);
        if (res.naturalMs) this.stretches.set(res.id, res.durationMs / res.naturalMs);
        // Cuánto tarda en generar respecto a lo que dura el audio (media móvil).
        const ratio = (Date.now() - t0) / Math.max(1, res.durationMs);
        if (Number.isFinite(ratio)) this.renderRatio = this.renderRatio * 0.6 + ratio * 0.4;
        this.checkRenderSpeed();
      }
    } catch (e) {
      this.reportError(e instanceof Error ? e.message : String(e));
    } finally {
      this.preloading = false;
    }
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

  private setVideoRate(rate: number) {
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

function speechStart(cue: Pick<DubCue, 'start' | 'speechStart'>): number {
  return cue.speechStart ?? cue.start;
}

function speechEnd(cue: Pick<DubCue, 'end' | 'speechEnd'>): number {
  return cue.speechEnd ?? cue.end;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}
