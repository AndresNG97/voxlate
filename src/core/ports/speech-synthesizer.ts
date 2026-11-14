/**
 * Puerto: texto a voz (doblaje).
 * Adaptadores: adapters/chrome/chrome-tts.ts (chrome.tts, en el background)
 *              adapters/chrome/runtime-speech.ts (proxy desde un content script)
 * Más adelante: Piper/Kokoro en WASM, ElevenLabs (modo premium)…
 */
export interface SpeakRequest {
  text: string;
  lang: string;
  /** '' = la mejor voz disponible para `lang`. */
  voiceName: string;
  rate: number;
  /** true = ponerla en cola detrás de la que suena; false = cortar y hablar ya. */
  enqueue: boolean;
}

export interface SpeakResult {
  ok: boolean;
  /** 'end' | 'interrupted' | 'cancelled' | 'error' | 'no-voice' */
  event: string;
  error?: string;
  /** Lo que ha tardado desde que empezó a sonar (para calibrar la voz). */
  durationMs?: number;
}

export interface SpeechSynthesizerPort {
  /** Resuelve cuando la frase termina o se corta. */
  speak(req: SpeakRequest): Promise<SpeakResult>;
  stop(): void;
  pause(): void;
  resume(): void;
}
