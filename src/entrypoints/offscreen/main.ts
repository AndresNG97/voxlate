/**
 * Offscreen document (raíz de composición). Lo comparten:
 * - Modo audio (solo con WXT_LIVE_MODE=true): TabAudioCapture → Deepgram → traductor → overlay
 * - Voz neuronal: Piper genera y reproduce el audio del doblaje (mensajes neural:*)
 * - Detector de voz: Silero VAD analiza el audio de YouTube (mensajes vad:*)
 */
import { ChromeTranslator } from '@/adapters/chrome/chrome-translator';
import { sendRuntime, type RuntimeMessage } from '@/adapters/chrome/messages';
import { decodePcm } from '@/adapters/chrome/pcm-codec';
import { PiperSynthesizer } from '@/adapters/piper/piper-synthesizer';
import { SileroVad } from '@/adapters/silero/silero-vad';
import type { LiveTranscription } from '@/core/application/live-transcription';

// ------------------------------------------------------------- modo audio
let currentTab = -1;
let live: Promise<LiveTranscription> | null = null;

/**
 * El modo audio y Deepgram se cargan solo si se compila con WXT_LIVE_MODE=true.
 * Si no, __LIVE_MODE__ es false y este bloque (con sus imports) se elimina de la build.
 */
function liveTranscription(): Promise<LiveTranscription> {
  if (__LIVE_MODE__) {
    live ??= Promise.all([
      import('@/core/application/live-transcription'),
      import('@/adapters/deepgram/deepgram-recognizer'),
    ]).then(
      ([{ LiveTranscription }, { deepgramRecognizer }]) =>
        new LiveTranscription({
          recognizer: deepgramRecognizer,
          translator: new ChromeTranslator(),
          onStatus: (status, error) => sendRuntime({ type: 'live:status', status, tabId: currentTab, error }),
          onCaption: ({ original, translated, isFinal }) =>
            sendRuntime({ type: 'live:transcript', tabId: currentTab, original, translated, isFinal }),
        }),
    );
    return live;
  }
  return Promise.reject(new Error('El modo audio no está incluido en esta versión.'));
}

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

// --------------------------------------------- detector de voz (sincronía de precisión)
const silero = new SileroVad({ modelUrl: vendor('silero/silero_vad_v5.onnx'), onnxWasm: vendor('ort/') });

browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as RuntimeMessage;
  switch (msg.type) {
    case 'offscreen:ping':
      sendResponse(true);
      return;
    case 'offscreen:start':
      if (!__LIVE_MODE__) return;
      currentTab = msg.tabId;
      liveTranscription()
        .then(async (t) => {
          const { TabAudioCapture } = await import('@/adapters/chrome/tab-audio-capture');
          await t.start(new TabAudioCapture(msg.streamId), msg.from, msg.to).catch((e: unknown) => {
            void t.stop();
            throw e;
          });
        })
        .catch((e: unknown) =>
          sendRuntime({
            type: 'live:status',
            status: 'error',
            tabId: currentTab,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      return;
    case 'offscreen:stop':
      void live?.then((t) => t.stop());
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
    case 'vad:analyze':
      silero.analyze(decodePcm(msg.pcm), msg.startMs).then(sendResponse, (e: unknown) =>
        sendResponse({ error: e instanceof Error ? e.message : String(e) }),
      );
      return true;
    case 'neural:set-rate':
      piper.setRate(msg.rate);
      return;
    case 'neural:resume':
      piper.resume();
      return;
  }
});
