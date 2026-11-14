/**
 * Puerto: voz a texto en streaming (modo audio).
 * Adaptadores: adapters/deepgram/deepgram-recognizer.ts
 * Más adelante: reconocimiento local de Chrome, Whisper/Moonshine en WebGPU…
 */
export interface TranscriptEvent {
  text: string;
  /** true = el proveedor ya no va a cambiar este trozo. Solo traducimos finales. */
  isFinal: boolean;
}

export interface RecognitionSession {
  /** PCM16 mono 16 kHz little-endian. */
  sendAudio(chunk: ArrayBuffer): void;
  close(): void;
}

export interface SpeechRecognizerPort {
  connect(opts: {
    language: string;
    onTranscript: (e: TranscriptEvent) => void;
    onError: (err: Error) => void;
    onOpen: () => void;
    onClose: () => void;
  }): Promise<RecognitionSession>;
}
