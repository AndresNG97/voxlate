/**
 * Caso de uso: modo audio. Escucha una fuente de audio, la transcribe en
 * streaming y traduce las frases finales.
 *
 *   AudioSourcePort → SpeechRecognizerPort → TranslatorPort → onCaption
 */
import type { AudioSourcePort } from '../ports/audio-source';
import type { RecognitionSession, SpeechRecognizerPort } from '../ports/speech-recognizer';
import type { TranslatorPort } from '../ports/translator';

export type LiveStatus = 'idle' | 'connecting' | 'listening' | 'error';

export interface LiveCaption {
  original: string;
  translated: string;
  isFinal: boolean;
}

export interface LiveTranscriptionDeps {
  recognizer: SpeechRecognizerPort;
  translator: TranslatorPort;
  onCaption: (caption: LiveCaption) => void;
  onStatus: (status: LiveStatus, error?: string) => void;
}

export class LiveTranscription {
  private session: RecognitionSession | null = null;
  private audio: AudioSourcePort | null = null;

  constructor(private readonly deps: LiveTranscriptionDeps) {}

  async start(audio: AudioSourcePort, from: string, to: string) {
    await this.stop();
    const { recognizer, translator, onCaption, onStatus } = this.deps;
    onStatus('connecting');
    this.audio = audio;

    let translatedLine = '';
    this.session = await recognizer.connect({
      language: from,
      onOpen: () => onStatus('listening'),
      onClose: () => this.session && onStatus('idle'),
      onError: (e) => onStatus('error', e.message),
      onTranscript: async ({ text, isFinal }) => {
        if (!isFinal) {
          // Parcial: mostramos el original provisional sin traducir (evita parpadeo).
          onCaption({ original: text, translated: translatedLine, isFinal: false });
          return;
        }
        try {
          [translatedLine = ''] = await translator.translate([text], from, to);
        } catch (e) {
          // Sin traductor en este contexto → al menos mostramos el original.
          console.warn('[voxlate] translate', e);
          translatedLine = '';
        }
        onCaption({ original: text, translated: translatedLine, isFinal: true });
      },
    });

    await audio.start((chunk) => this.session?.sendAudio(chunk));
  }

  async stop() {
    const session = this.session;
    this.session = null;
    session?.close();
    await this.audio?.stop();
    this.audio = null;
  }
}
