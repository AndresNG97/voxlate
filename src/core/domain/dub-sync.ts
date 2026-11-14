/**
 * Fórmula del "modo sincronización": reparte el ajuste necesario entre la
 * velocidad de la voz y la del vídeo para que cada frase doblada quepa en su
 * hueco sin que la voz suene acelerada.
 *
 * Notación
 *   L   caracteres a leer
 *   c   caracteres por segundo de la voz a velocidad 1 (se calibra en marcha)
 *   W   segundos de vídeo disponibles para la frase (hasta que empieza la siguiente)
 *   r0  velocidad base de la voz (la que elige el usuario)
 *   v0  velocidad del vídeo que tiene puesta el usuario (normalmente 1)
 *
 * Tiempo que tarda la voz:          Tv = L / (c · r)
 * Tiempo real que dura el hueco:    Th = W / v
 * Condición para que quepa:         Tv ≤ Th   ⇔   r / v ≥ L / (c · W)
 *
 * Estiramiento necesario partiendo de (r0, v0):
 *
 *        s = (L / (c · r0)) / (W / v0) = L · v0 / (c · r0 · W)
 *
 *   s ≤ 1 → ya cabe: r = r0, v = v0.
 *   s > 1 → se reparte de forma geométrica con un peso α (parte de la voz):
 *
 *        r = r0 · s^α        v = v0 / s^(1−α)        ⇒   r / v = s · r0 / v0  ✓
 *
 *   Con α = 0,5 los dos cambian en la misma proporción (√s cada uno), que es
 *   lo que se percibe como "equilibrado". Después se aplican los límites:
 *   la voz como mucho r0 · maxVoiceBoost y el vídeo como poco v0 · minVideoFactor.
 *   Si uno toca su límite, el otro absorbe el resto. Si tocan los dos, la frase
 *   no cabe (fits = false) y el doblador deja que se encole con la siguiente.
 */

export interface SyncInput {
  /** L: caracteres a leer. */
  chars: number;
  /** W: segundos de vídeo disponibles para la frase. */
  windowSec: number;
  /** c: caracteres por segundo de la voz a velocidad 1. */
  charsPerSec: number;
  /** r0: velocidad base de la voz. */
  baseVoiceRate: number;
  /** v0: velocidad del vídeo puesta por el usuario. */
  baseVideoRate: number;
}

export interface SyncLimits {
  /** Máximo que puede acelerarse la voz respecto a r0 (1,2 = +20%). */
  maxVoiceBoost: number;
  /** Mínimo al que puede bajar el vídeo respecto a v0 (0,7 = 70%). */
  minVideoFactor: number;
  /** α: parte del ajuste que se lleva la voz (0 = todo el vídeo, 1 = todo la voz). */
  voiceShare: number;
}

export interface SyncResult {
  voiceRate: number;
  videoRate: number;
  /** s: estiramiento que hacía falta (1 = cabía sin tocar nada). */
  stretch: number;
  /** false si ni con los dos límites al máximo cabe la frase. */
  fits: boolean;
}

export const SYNC_LIMITS: SyncLimits = {
  maxVoiceBoost: 1.2,
  minVideoFactor: 0.7,
  voiceShare: 0.5,
};

/** Valor inicial de c para voces del sistema en español; luego se calibra. */
export const DEFAULT_CHARS_PER_SEC = 14;

/** Hueco mínimo que consideramos, para no dividir entre ~0. */
const MIN_WINDOW_SEC = 0.4;

export function solveSync(input: SyncInput, limits: SyncLimits = SYNC_LIMITS): SyncResult {
  const { chars, charsPerSec: c, baseVoiceRate: r0, baseVideoRate: v0 } = input;
  const W = Math.max(MIN_WINDOW_SEC, input.windowSec);
  const s = (chars * v0) / (c * r0 * W);

  if (!(s > 1)) return { voiceRate: r0, videoRate: v0, stretch: Math.max(0, s), fits: true };

  const maxVideoSlow = 1 / limits.minVideoFactor;
  let voiceF = Math.pow(s, limits.voiceShare);
  let videoF = Math.pow(s, 1 - limits.voiceShare);

  if (voiceF > limits.maxVoiceBoost) {
    voiceF = limits.maxVoiceBoost;
    videoF = s / voiceF;
  }
  if (videoF > maxVideoSlow) {
    videoF = maxVideoSlow;
    voiceF = Math.min(limits.maxVoiceBoost, s / videoF);
  }

  return {
    voiceRate: r0 * voiceF,
    videoRate: v0 / videoF,
    stretch: s,
    fits: voiceF * videoF >= s - 1e-9,
  };
}

/**
 * Modo manual: velocidades fijas. Devuelve cuánto tiempo extra tiene la voz
 * frente a hablar a velocidad 1 con el vídeo a velocidad normal
 * (p. ej. vídeo al 85% y voz a 1× → la voz tiene un 18% más de tiempo).
 */
export function manualHeadroom(voiceRate: number, videoFactor: number): number {
  return voiceRate / videoFactor - 1;
}
