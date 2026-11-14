/**
 * Puerto: fuente de audio en PCM16 mono 16 kHz (modo audio).
 * Adaptador: adapters/chrome/tab-audio-capture.ts (tabCapture + AudioWorklet)
 */
export interface AudioSourcePort {
  start(onChunk: (chunk: ArrayBuffer) => void): Promise<void>;
  stop(): Promise<void>;
}
