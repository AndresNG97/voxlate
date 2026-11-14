/**
 * Adaptador de SpeechSynthesizerPort sobre chrome.tts (voces del sistema).
 * Solo funciona en contextos de extensión (background, popup); los content
 * scripts usan RuntimeSpeechSynthesizer, que reenvía aquí.
 */
import type { SpeakRequest, SpeakResult, SpeechSynthesizerPort } from '@/core/ports/speech-synthesizer';
import type { RuntimeMessage } from './messages';
import { pickVoice } from './tts-voices';

const FINAL_EVENTS = new Set(['end', 'interrupted', 'cancelled', 'error']);

export class ChromeTtsSynthesizer implements SpeechSynthesizerPort {
  async speak(req: SpeakRequest): Promise<SpeakResult> {
    const voiceName = await pickVoice(req.lang, req.voiceName);
    if (!voiceName) return { ok: false, event: 'no-voice' };
    return new Promise((resolve) => {
      let settled = false;
      /** Cuándo empezó a sonar de verdad (si la voz emite 'start'), para calibrar. */
      let startedAt = 0;
      const finish = (r: SpeakResult) => {
        if (!settled) {
          settled = true;
          resolve(r);
        }
      };
      browser.tts
        .speak(req.text, {
          voiceName,
          rate: req.rate,
          enqueue: req.enqueue,
          onEvent(e) {
            if (e.type === 'start') startedAt = Date.now();
            if (!FINAL_EVENTS.has(e.type)) return;
            const durationMs = e.type === 'end' && startedAt ? Date.now() - startedAt : undefined;
            finish({ ok: e.type === 'end', event: e.type, error: e.errorMessage, durationMs });
          },
        })
        ?.catch((err: unknown) => finish({ ok: false, event: 'error', error: String(err) }));
    });
  }

  stop() {
    browser.tts.stop();
  }

  pause() {
    browser.tts.pause();
  }

  resume() {
    browser.tts.resume();
  }
}

/**
 * Atiende en el background los mensajes tts:* que mandan los content scripts.
 * Devuelve true si el mensaje era suyo (y la respuesta es asíncrona).
 */
export function handleTtsMessage(
  synth: SpeechSynthesizerPort,
  msg: RuntimeMessage,
  sendResponse: (r: SpeakResult) => void,
): boolean | undefined {
  switch (msg.type) {
    case 'tts:speak': {
      const { type: _type, ...req } = msg;
      synth.speak(req).then(sendResponse);
      return true;
    }
    case 'tts:stop':
      synth.stop();
      return false;
    case 'tts:pause':
      synth.pause();
      return false;
    case 'tts:resume':
      synth.resume();
      return false;
  }
  return undefined;
}
