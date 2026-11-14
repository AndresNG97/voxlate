/**
 * Adaptador de SpeechSynthesizerPort para content scripts: no tienen acceso a
 * chrome.tts, así que reenvían cada petición al background (ChromeTtsSynthesizer).
 */
import type { SpeakRequest, SpeakResult, SpeechSynthesizerPort } from '@/core/ports/speech-synthesizer';
import { sendRuntime, type RuntimeMessage } from './messages';

export class RuntimeSpeechSynthesizer implements SpeechSynthesizerPort {
  speak(req: SpeakRequest): Promise<SpeakResult> {
    return browser.runtime.sendMessage({ type: 'tts:speak', ...req } satisfies RuntimeMessage) as Promise<SpeakResult>;
  }

  stop() {
    sendRuntime({ type: 'tts:stop' });
  }

  pause() {
    sendRuntime({ type: 'tts:pause' });
  }

  resume() {
    sendRuntime({ type: 'tts:resume' });
  }
}
