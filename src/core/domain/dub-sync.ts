/**
 * Sincronización del doblaje (isocronía): la voz traducida debe empezar cuando
 * empieza a hablar la persona del vídeo y terminar cuando ella termina, para
 * que se sienta que dicen lo mismo a la vez. Si la persona calla, la voz calla.
 *
 * Principio: la voz nunca suena por debajo de 0,9× (más lenta resulta molesta).
 * Lo que falte o sobre lo absorbe el VÍDEO, que se adapta al doblaje.
 *
 * Notación
 *   D   duración de la frase traducida a velocidad 1 (exacta con Piper, estimada con la voz del sistema)
 *   W   tiempo real que queda hasta que la persona deja de hablar
 *         W = (speechEnd − ahora) / v0      (v0 = velocidad del vídeo puesta por el usuario)
 *   r0  velocidad base de la voz (la que elige el usuario)
 *
 * 1) Al empezar la frase — planSegment():
 *
 *      velocidad necesaria   r* = D / W         (a esa velocidad acaba justo a tiempo)
 *
 *    - r* en [rMín, rMáx]  → la voz va a r*, el vídeo a su velocidad.
 *    - r* > rMáx (traducción MÁS LARGA) → voz al máximo y el vídeo se RALENTIZA:
 *        f = r* / rMáx   →   vídeo = v0 / f      (sin bajar de v0·minVideo)
 *    - r* < rMín (traducción MÁS CORTA) → voz al mínimo (0,9×) y el vídeo se
 *      ACELERA para que la persona acabe a la vez que el doblaje:
 *        f = rMín / r*   →   vídeo = v0 · f      (sin pasar de v0·maxVideo)
 *
 *    rMín = r0·0,9 por defecto. Si la voz ya se generó más lenta de lo natural
 *    (Piper puede hacerlo), ese estiramiento cuenta: rMín sube en la misma
 *    proporción, para que la velocidad que se OYE no baje nunca de 0,9×.
 *
 * 2) Mientras suena — correctRate():
 *    Unas 4 veces por segundo se recalcula con lo que falta de verdad:
 *        r = (D − ya leído) / (tiempo real hasta speechEnd)
 *    y se aplica con un cambio suave (máx. ±MAX_STEP por corrección), siempre
 *    dentro de [rMín, rMáx].
 */

export interface SyncLimits {
  /** Lo más lenta que puede SONAR la voz, respecto a r0 (0,9 = 90 %). */
  minVoice: number;
  /** Lo más rápida que puede ir la voz, respecto a r0. */
  maxVoice: number;
  /** Traducción más larga: el vídeo puede bajar hasta v0 · minVideo. */
  minVideo: number;
  /** Traducción más corta: el vídeo puede subir hasta v0 · maxVideo. */
  maxVideo: number;
}

export const SYNC_LIMITS: SyncLimits = {
  minVoice: 0.9,
  maxVoice: 1.25,
  minVideo: 0.8,
  maxVideo: 1.15,
};

/** Valor inicial de caracteres/segundo para estimar D con la voz del sistema; luego se calibra. */
export const DEFAULT_CHARS_PER_SEC = 16;

/** Ventana mínima que consideramos, para no dividir entre ~0. */
const MIN_WINDOW_MS = 300;
/** Cambio máximo de velocidad en cada corrección continua (6 %). */
const MAX_STEP = 0.06;

export interface SegmentPlanInput {
  /** D: duración de la frase traducida a velocidad 1 (ms). */
  speechMs: number;
  /** W: tiempo real hasta que la persona deja de hablar (ms). */
  windowMs: number;
  /** r0 */
  baseVoiceRate: number;
  /** v0 */
  baseVideoRate: number;
  /**
   * Cuánto más larga es la frase generada que su ritmo natural (Piper puede
   * generarla más lenta). 1 = ritmo natural. Sube el mínimo de reproducción.
   */
  generatedStretch?: number;
}

export interface SegmentPlan {
  voiceRate: number;
  videoRate: number;
  /** r* / r0: cuánto habría que estirar (1 = cabía tal cual). */
  stretch: number;
  /** false si ni con la voz y el vídeo en sus límites cabe exacto. */
  fits: boolean;
}

/** Velocidad mínima de reproducción para que la voz no SUENE por debajo de minVoice. */
function minPlaybackRate(baseVoiceRate: number, generatedStretch = 1, limits: SyncLimits = SYNC_LIMITS): number {
  return baseVoiceRate * limits.minVoice * Math.max(1, generatedStretch);
}

export function planSegment(i: SegmentPlanInput, limits: SyncLimits = SYNC_LIMITS): SegmentPlan {
  const { baseVoiceRate: r0, baseVideoRate: v0 } = i;
  const needed = i.speechMs / Math.max(MIN_WINDOW_MS, i.windowMs);
  const rMax = r0 * limits.maxVoice;
  const rMin = Math.min(rMax, minPlaybackRate(r0, i.generatedStretch, limits));
  const stretch = needed / r0;

  if (needed > rMax) {
    // Traducción más larga: voz al máximo y el vídeo se ralentiza lo justo.
    const slow = Math.min(needed / rMax, 1 / limits.minVideo);
    return { voiceRate: rMax, videoRate: v0 / slow, stretch, fits: needed / rMax <= 1 / limits.minVideo + 1e-9 };
  }
  if (needed < rMin) {
    // Traducción más corta: la voz no baja de su mínimo; el vídeo se acelera.
    const fast = Math.min(rMin / needed, limits.maxVideo);
    return { voiceRate: rMin, videoRate: v0 * fast, stretch, fits: rMin / needed <= limits.maxVideo + 1e-9 };
  }
  return { voiceRate: needed, videoRate: v0, stretch, fits: true };
}

export interface CorrectionInput {
  /** Audio que falta por leer, medido a velocidad 1 (ms). */
  remainingSpeechMs: number;
  /** Tiempo real que queda hasta que la persona deja de hablar (ms). */
  remainingWindowMs: number;
  currentRate: number;
  baseVoiceRate: number;
  /** Ver SegmentPlanInput.generatedStretch. */
  generatedStretch?: number;
}

/** Nueva velocidad de la voz para acabar con el hablante, cambiando poco a poco. */
export function correctRate(i: CorrectionInput, limits: SyncLimits = SYNC_LIMITS): number {
  const rMax = i.baseVoiceRate * limits.maxVoice;
  const rMin = Math.min(rMax, minPlaybackRate(i.baseVoiceRate, i.generatedStretch, limits));
  const target =
    i.remainingWindowMs <= MIN_WINDOW_MS ? rMax : clamp(i.remainingSpeechMs / i.remainingWindowMs, rMin, rMax);
  return clamp(clamp(target, i.currentRate * (1 - MAX_STEP), i.currentRate * (1 + MAX_STEP)), rMin, rMax);
}

/**
 * Modo manual: velocidades fijas. Devuelve cuánto más texto cabe por frase
 * frente a voz a 1× con el vídeo a velocidad normal
 * (p. ej. vídeo al 85 % y voz a 1× → cabe un 18 % más).
 */
export function manualHeadroom(voiceRate: number, videoFactor: number): number {
  return voiceRate / videoFactor - 1;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
