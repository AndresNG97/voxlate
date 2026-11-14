/**
 * Puerto: tramos del vídeo en los que habla alguien, detectados en el audio real.
 * Implementación: core/domain/voice-activity.ts (SpeechTimeline), alimentada por el
 * audio de YouTube (adapters/youtube/audio-tap.ts) analizado con Silero (adapters/silero).
 */
import type { VoiceInterval } from '../domain/timing';

export interface VoiceActivityPort {
  /** Tramos con voz entre `fromMs` y `toMs` (ms de vídeo). Vacío si aún no se ha analizado esa zona. */
  intervals(fromMs: number, toMs: number): VoiceInterval[];
}
