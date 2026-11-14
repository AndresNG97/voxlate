/**
 * Puerto: modelo que estima, trozo a trozo, la probabilidad de que haya voz.
 * Adaptadores: adapters/silero/silero-vad.ts (Silero VAD v5 en ONNX, en el offscreen document)
 *              adapters/chrome/runtime-voice-detector.ts (proxy desde un content script)
 */
export interface VoiceProbabilities {
  /** Instante (ms de vídeo) del primer trozo. */
  startMs: number;
  /** Probabilidad de voz (0-1) de cada trozo consecutivo. */
  probabilities: number[];
}

export interface VoiceDetectorPort {
  /** Muestras por segundo que espera el modelo (Silero: 16 000). */
  readonly sampleRate: number;
  /** Duración de cada trozo analizado en ms (Silero a 16 kHz: 32 ms). */
  readonly frameMs: number;
  /**
   * Analiza audio mono a `sampleRate` que empieza en `startMs` (ms de vídeo).
   * Las muestras que no llenan un trozo se guardan para la siguiente llamada,
   * así que el primer trozo devuelto puede empezar un poco antes de `startMs`.
   * Si el audio no sigue al anterior (salto en el vídeo), reinicia su estado.
   */
  analyze(samples: Float32Array, startMs: number): Promise<VoiceProbabilities>;
}
