/**
 * Offscreen document (raíz de composición). Lo comparten:
 * - Modo audio: TabAudioCapture → Deepgram → traductor de Chrome → background → overlay
 * - Voz neuronal: Piper genera y reproduce el audio del doblaje (mensajes neural:*)
 */
import { ChromeTranslator } from '@/adapters/chrome/chrome-translator';
import { sendRuntime, type RuntimeMessage } from '@/adapters/chrome/messages';
import { TabAudioCapture } from '@/adapters/chrome/tab-audio-capture';
import { deepgramRecognizer } from '@/adapters/deepgram/deepgram-recognizer';
import { PiperSynthesizer } from '@/adapters/piper/piper-synthesizer';
import { LiveTranscription } from '@/core/application/live-transcription';

// ------------------------------------------------------------- modo audio
let currentTab = -1;

const live = new LiveTranscription({
  recognizer: deepgramRecognizer,
  translator: new ChromeTranslator(),
  onStatus: (status, error) => sendRuntime({ type: 'live:status', status, tabId: currentTab, error }),
  onCaption: ({ original, translated, isFinal }) =>
    sendRuntime({ type: 'live:transcript', tabId: currentTab, original, translated, isFinal }),
});

// ------------------------------------------------------------ voz neuronal
// Archivos que añade wxt.config.ts (hook build:publicAssets) en /vendor.
const vendor = (path: string) => new URL(`/vendor/${path}`, location.origin).href;
const piper = new PiperSynthesizer(
  {
    onnxWasm: vendor('ort/'),
    piperWasm: vendor('piper/piper_phonemize.wasm'),
    piperData: vendor('piper/piper_phonemize.data'),
  },
  (fraction) => sendRuntime({ type: 'neural:progress', fraction }),
);

browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as RuntimeMessage;
  switch (msg.type) {
    case 'offscreen:ping':
      sendResponse(true);
      return;
    case 'offscreen:start':
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
      return;
    case 'offscreen:stop':
      void live.stop();
      return;

    case 'neural:prepare':
      piper.prepare(msg.req).then(sendResponse, (e: unknown) =>
        sendResponse({ error: e instanceof Error ? e.message : String(e) }),
      );
      return true;
    case 'neural:speak':
      piper.speak(msg.req).then(sendResponse);
      return true;
    case 'neural:stop':
      piper.stop();
      return;
    case 'neural:pause':
      piper.pause();
      return;
    case 'neural:resume':
      piper.resume();
      return;
  }
});
