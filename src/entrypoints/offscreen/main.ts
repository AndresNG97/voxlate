/**
 * Offscreen document (raíz de composición del modo audio). Vive mientras dura:
 *   TabAudioCapture → Deepgram → traductor de Chrome → background → overlay
 */
import { ChromeTranslator } from '@/adapters/chrome/chrome-translator';
import { sendRuntime, type RuntimeMessage } from '@/adapters/chrome/messages';
import { TabAudioCapture } from '@/adapters/chrome/tab-audio-capture';
import { deepgramRecognizer } from '@/adapters/deepgram/deepgram-recognizer';
import { LiveTranscription } from '@/core/application/live-transcription';

let currentTab = -1;

const live = new LiveTranscription({
  recognizer: deepgramRecognizer,
  translator: new ChromeTranslator(),
  onStatus: (status, error) => sendRuntime({ type: 'live:status', status, tabId: currentTab, error }),
  onCaption: ({ original, translated, isFinal }) =>
    sendRuntime({ type: 'live:transcript', tabId: currentTab, original, translated, isFinal }),
});

browser.runtime.onMessage.addListener((raw) => {
  const msg = raw as RuntimeMessage;
  if (msg.type === 'offscreen:start') {
    currentTab = msg.tabId;
    live.start(new TabAudioCapture(msg.streamId), msg.from, msg.to).catch((e: unknown) => {
      sendRuntime({
        type: 'live:status',
        status: 'error',
        tabId: currentTab,
        error: e instanceof Error ? e.message : String(e),
      });
      void live.stop();
    });
  } else if (msg.type === 'offscreen:stop') {
    void live.stop();
  }
});
