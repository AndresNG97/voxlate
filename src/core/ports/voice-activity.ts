/**
 * Puerto: tramos del vídeo en los que habla alguien, detectados en el audio real.
 * Adaptador: adapters/youtube/voice-activity-store.ts (lo alimenta el audio-tap de YouTube)
 */
import type { VoiceInterval } from '../domain/timing';

export interface VoiceActivityPort {
  /** Tramos con voz entre `fromMs` y `toMs` (ms de vídeo). Vacío si aún no se ha analizado esa zona. */
  intervals(fromMs: number, toMs: number): VoiceInterval[];
}
