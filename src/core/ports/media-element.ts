/**
 * Puerto: el vídeo que se está viendo.
 * Adaptador: adapters/dom/html-media-element.ts (HTMLVideoElement)
 */
export type MediaEvent = 'play' | 'pause' | 'seeking' | 'seeked' | 'volumechange' | 'ratechange';

export interface MediaElementPort {
  readonly currentTimeMs: number;
  readonly paused: boolean;
  volume: number;
  playbackRate: number;
  /** Devuelve una función para darse de baja. */
  on(event: MediaEvent, cb: () => void): () => void;
  /**
   * Llama a `cb` en cada frame mientras se reproduce (y unas 4 veces por
   * segundo con la pestaña en segundo plano), además de al pausar y al saltar.
   */
  onTick(cb: () => void): () => void;
}
