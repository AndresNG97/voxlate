/**
 * Detector de voz (VAD) por energía en la banda de la voz humana.
 *
 * Recibe audio decodificado con su instante (ms de vídeo), lo filtra a
 * 300-3400 Hz (donde está la voz; deja fuera graves de música y siseos),
 * mide la energía cada 20 ms y decide qué tramos tienen voz con un umbral
 * relativo al propio vídeo: suelo de ruido (percentil 10) y nivel de voz
 * (percentil 90) de los ~60 s de alrededor. Se unen huecos cortos (respiraciones)
 * y se descartan chasquidos.
 *
 * Validado con un vídeo real: los finales de voz que da coinciden con los de los
 * subtítulos automáticos con ~150 ms de diferencia mediana cuando hay pausas
 * claras. Límite: por energía no distingue a la persona de risas, aplausos o
 * música (lo comprobamos con una charla TED). Para eso haría falta un modelo de
 * voz (p. ej. Silero VAD) detrás de esta misma interfaz.
 *
 * Puro: no sabe nada de WebCodecs ni de YouTube. Ver adapters/youtube/audio-tap.ts.
 */
import type { VoiceInterval } from './timing';

const FRAME_MS = 20;
/** Ventana de alrededor para calcular el umbral (frames de 20 ms). */
const THRESHOLD_WINDOW_FRAMES = 3000; // 60 s
/** Posición del umbral entre el suelo de ruido y el nivel de voz. */
const THRESHOLD_POSITION = 0.35;
/** Si apenas hay diferencia entre silencio y voz, no nos fiamos (música continua…). */
const MIN_DYNAMIC_RANGE_DB = 10;
/** Huecos de silencio más cortos que esto no cortan el tramo (respiraciones, consonantes). */
const MERGE_GAP_MS = 180;
/** Tramos de voz más cortos que esto se descartan (golpes, chasquidos). */
const MIN_VOICE_MS = 120;
/** Se olvida el audio que queda a más de esto del último recibido. */
const KEEP_MS = 10 * 60 * 1000;

/** Filtro biquad (RBJ) de segundo orden, con estado. */
class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private readonly a1: number;
  private readonly a2: number;

  constructor(type: 'highpass' | 'lowpass', freq: number, sampleRate: number) {
    const w = (2 * Math.PI * freq) / sampleRate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
    const a0 = 1 + alpha;
    const b1 = type === 'lowpass' ? 1 - cos : -(1 + cos);
    const b0 = type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b0 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

export class VoiceActivityDetector {
  /** Energía (dB) por frame de 20 ms; clave = índice de frame (ms / 20). */
  private readonly frames = new Map<number, number>();
  private readonly hp: Biquad;
  private readonly lp: Biquad;
  private nextExpectedMs = -1;
  private latestMs = 0;
  /** Muestras sobrantes del último bloque que no llenaban un frame. */
  private carry: { startMs: number; energy: number; count: number } | null = null;

  constructor(private readonly sampleRate: number) {
    this.hp = new Biquad('highpass', 300, sampleRate);
    this.lp = new Biquad('lowpass', 3400, sampleRate);
  }

  /** Añade audio mono decodificado que empieza en `startMs` (ms de vídeo). */
  push(samples: Float32Array, startMs: number) {
    // Salto (seek o hueco): reiniciamos los filtros para no arrastrar estado.
    if (Math.abs(startMs - this.nextExpectedMs) > 5) {
      this.hp.reset();
      this.lp.reset();
      this.carry = null;
    }
    const perFrame = (this.sampleRate * FRAME_MS) / 1000;
    let acc = this.carry ?? { startMs, energy: 0, count: 0 };
    for (let i = 0; i < samples.length; i++) {
      const y = this.lp.process(this.hp.process(samples[i]!));
      acc.energy += y * y;
      acc.count++;
      if (acc.count >= perFrame) {
        this.frames.set(Math.round(acc.startMs / FRAME_MS), 10 * Math.log10(acc.energy / acc.count + 1e-12));
        acc = { startMs: acc.startMs + FRAME_MS, energy: 0, count: 0 };
      }
    }
    // Lo que no llenó un frame sigue en el siguiente bloque (si viene seguido).
    this.carry = acc;
    this.nextExpectedMs = startMs + (samples.length / this.sampleRate) * 1000;
    this.latestMs = Math.max(this.latestMs, this.nextExpectedMs);
    this.prune();
  }

  /** ¿Tenemos audio analizado de este instante? */
  covers(ms: number): boolean {
    return this.frames.has(Math.round(ms / FRAME_MS));
  }

  /** Tramos con voz entre `fromMs` y `toMs` (solo donde hay audio analizado). */
  intervals(fromMs: number, toMs: number): VoiceInterval[] {
    const first = Math.floor(fromMs / FRAME_MS);
    const last = Math.ceil(toMs / FRAME_MS);
    const threshold = this.thresholdAround(Math.round((first + last) / 2));
    if (threshold === null) return [];

    const out: VoiceInterval[] = [];
    let cur: VoiceInterval | null = null;
    for (let f = first; f <= last; f++) {
      const db = this.frames.get(f);
      if (db === undefined || db <= threshold) continue;
      const t = f * FRAME_MS;
      if (cur && t - cur.end <= MERGE_GAP_MS) cur.end = t + FRAME_MS;
      else {
        cur = { start: t, end: t + FRAME_MS };
        out.push(cur);
      }
    }
    return out.filter((v) => v.end - v.start >= MIN_VOICE_MS);
  }

  /** Umbral de voz para la zona: entre suelo de ruido (p10) y nivel de voz (p90). */
  private thresholdAround(center: number): number | null {
    const values: number[] = [];
    const half = THRESHOLD_WINDOW_FRAMES / 2;
    for (let f = center - half; f <= center + half; f++) {
      const db = this.frames.get(f);
      if (db !== undefined && db > -100) values.push(db);
    }
    if (values.length < 250) return null; // menos de 5 s de audio: no hay base para decidir
    values.sort((a, b) => a - b);
    const floor = values[Math.floor(values.length * 0.1)]!;
    const peak = values[Math.floor(values.length * 0.9)]!;
    if (peak - floor < MIN_DYNAMIC_RANGE_DB) return null;
    return floor + (peak - floor) * THRESHOLD_POSITION;
  }

  private prune() {
    if (this.frames.size < 40_000) return;
    const keepFrom = Math.floor((this.latestMs - KEEP_MS) / FRAME_MS);
    const keepTo = Math.ceil((this.latestMs + KEEP_MS) / FRAME_MS);
    for (const f of this.frames.keys()) if (f < keepFrom || f > keepTo) this.frames.delete(f);
  }
}
