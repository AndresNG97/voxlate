/**
 * Adaptador de VoiceDetectorPort para content scripts: el modelo (Silero) corre
 * en el offscreen document, así que se le manda el audio por chrome.runtime.
 */
import type { VoiceDetectorPort, VoiceProbabilities } from '@/core/ports/voice-detector';
import { t } from '@/i18n';
import type { RuntimeMessage } from './messages';
import { encodePcm } from './pcm-codec';

export class RuntimeVoiceDetector implements VoiceDetectorPort {
  readonly sampleRate = 16_000;
  readonly frameMs = 32;

  async analyze(samples: Float32Array, startMs: number): Promise<VoiceProbabilities> {
    const ready = await browser.runtime.sendMessage({ type: 'neural:ensure' } satisfies RuntimeMessage);
    if (ready !== true) throw new Error(t.errors.vadStart);
    const res = (await browser.runtime.sendMessage({
      type: 'vad:analyze',
      target: 'offscreen',
      startMs,
      pcm: encodePcm(samples),
    } satisfies RuntimeMessage)) as VoiceProbabilities | { error: string } | undefined;
    if (!res) throw new Error(t.errors.vadNoResponse);
    if ('error' in res) throw new Error(res.error);
    return res;
  }
}
