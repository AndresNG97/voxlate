/**
 * Línea de tiempo de voz: guarda, para cada trozo de audio, la probabilidad de
 * que haya alguien hablando (la da un modelo de detección de voz, p. ej. Silero
 * VAD) y la convierte en tramos con voz.
 *
 * Por qué un modelo y no la energía del sonido: lo medimos con una charla TED y
 * un detector por energía confunde las risas, los aplausos y la música con voz.
 * Un modelo entrenado distingue el habla de esos sonidos.
 *
 * De probabilidades a tramos (histéresis, como hace Silero en su utils_vad):
 * - un tramo empieza cuando la probabilidad supera START_PROB,
 * - continúa mientras no baje de END_PROB (evita parpadeos a mitad de palabra),
 * - se unen huecos de silencio más cortos que MERGE_GAP_MS (respiraciones),
 * - y se descartan tramos más cortos que MIN_VOICE_MS (chasquidos).
 *
 * Puro: no sabe de ONNX, WebCodecs ni YouTube.
 */
import type { VoiceInterval } from './timing';

const START_PROB = 0.5;
const END_PROB = 0.35;
const MERGE_GAP_MS = 150;
const MIN_VOICE_MS = 120;
/** Se olvida lo que queda a más de esto del último audio recibido. */
const KEEP_MS = 10 * 60 * 1000;

export class SpeechTimeline {
  /** Probabilidad de voz por trozo; clave = índice del trozo (ms / frameMs). */
  private readonly probs = new Map<number, number>();
  private latestMs = 0;

  /** @param frameMs duración de cada trozo analizado (Silero a 16 kHz: 512 muestras = 32 ms). */
  constructor(private readonly frameMs = 32) {}

  /** Añade probabilidades de trozos consecutivos que empiezan en `startMs` (ms de vídeo). */
  add(startMs: number, probabilities: ArrayLike<number>) {
    for (let i = 0; i < probabilities.length; i++) {
      this.probs.set(Math.round((startMs + i * this.frameMs) / this.frameMs), probabilities[i]!);
    }
    this.latestMs = Math.max(this.latestMs, startMs + probabilities.length * this.frameMs);
    this.prune();
  }

  /** Cuánto audio hay analizado (ms). */
  coveredMs(): number {
    return this.probs.size * this.frameMs;
  }

  clear() {
    this.probs.clear();
    this.latestMs = 0;
  }

  /** Tramos con voz entre `fromMs` y `toMs`. Solo donde hay audio analizado. */
  intervals(fromMs: number, toMs: number): VoiceInterval[] {
    const first = Math.floor(fromMs / this.frameMs);
    const last = Math.ceil(toMs / this.frameMs);
    const out: VoiceInterval[] = [];
    let cur: VoiceInterval | null = null;
    let inVoice = false;
    for (let f = first; f <= last; f++) {
      const p = this.probs.get(f);
      if (p === undefined) {
        inVoice = false; // sin datos: no inventamos voz
        continue;
      }
      inVoice = inVoice ? p >= END_PROB : p >= START_PROB;
      if (!inVoice) continue;
      const t = f * this.frameMs;
      if (cur && t - cur.end <= MERGE_GAP_MS) cur.end = t + this.frameMs;
      else {
        cur = { start: t, end: t + this.frameMs };
        out.push(cur);
      }
    }
    return out.filter((v) => v.end - v.start >= MIN_VOICE_MS);
  }

  private prune() {
    if (this.probs.size < 25_000) return;
    const keepFrom = Math.floor((this.latestMs - KEEP_MS) / this.frameMs);
    const keepTo = Math.ceil((this.latestMs + KEEP_MS) / this.frameMs);
    for (const f of this.probs.keys()) if (f < keepFrom || f > keepTo) this.probs.delete(f);
  }
}
