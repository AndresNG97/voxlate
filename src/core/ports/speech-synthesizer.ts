/**
 * Puerto: texto a voz (doblaje).
 * Adaptadores: adapters/chrome/chrome-tts.ts (chrome.tts, voces del sistema)
 *              adapters/piper/piper-synthesizer.ts (voz neuronal local, genera el audio por adelantado)
 *              adapters/chrome/runtime-speech.ts (proxies desde un content script)
 * Más adelante: Kokoro, ElevenLabs (modo premium)…
 */
export interface SpeakRequest {
  /** Si se preparó antes con prepare(), el id de ese audio (se reutiliza tal cual). */
  id?: string;
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

export interface PrepareRequest {
  id: string;
  text: string;
  lang: string;
  voiceName: string;
  /**
   * Duración deseada a velocidad 1 (ms): lo que tarda la persona en decir la
   * frase. Las voces que puedan generan el audio ya a ese ritmo, de forma
   * natural, en vez de estirarlo o encogerlo después.
   */
  targetMs?: number;
}

export interface PreparedSpeech {
  id: string;
  /** Duración exacta a velocidad 1. */
  durationMs: number;
  /**
   * Lo que duraría a su ritmo natural, si la voz la generó más lenta o más
   * rápida (Piper). Sirve para que la velocidad que se OYE respete el mínimo.
   */
  naturalMs?: number;
}

export interface SpeechSynthesizerPort {
  /** Resuelve cuando la frase termina o se corta. */
  speak(req: SpeakRequest): Promise<SpeakResult>;
  stop(): void;
  pause(): void;
  resume(): void;
  /**
   * Opcional: genera el audio por adelantado y devuelve su duración exacta.
   * Solo lo tienen las voces que producen audio (Piper), no chrome.tts.
   */
  prepare?(req: PrepareRequest): Promise<PreparedSpeech>;
  /**
   * Opcional: cambia la velocidad de la frase que está sonando, sin cortarla
   * (para ir a la par del hablante). chrome.tts no puede; Piper sí.
   */
  setRate?(rate: number): void;
}
