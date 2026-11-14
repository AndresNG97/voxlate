/**
 * Service worker (raíz de composición).
 * - Modo audio: LiveController orquesta el offscreen document y el overlay.
 * - Doblaje con voz del sistema: atiende los tts:* de los content scripts con chrome.tts.
 * - Doblaje con voz neuronal: crea el offscreen document cuando se lo piden (neural:ensure);
 *   el resto de mensajes neural:* los atiende directamente el offscreen.
 */
import { ChromeTtsSynthesizer, handleTtsMessage } from '@/adapters/chrome/chrome-tts';
import { LiveController } from '@/adapters/chrome/live-controller';
import type { RuntimeMessage } from '@/adapters/chrome/messages';
import { ensureOffscreen } from '@/adapters/chrome/offscreen-host';
import { ChromeSettingsStore } from '@/adapters/chrome/settings-storage';

export default defineBackground(() => {
  const live = new LiveController(new ChromeSettingsStore());
  const tts = new ChromeTtsSynthesizer();

  browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as RuntimeMessage;
    if (msg.type === 'neural:ensure') {
      ensureOffscreen().then(sendResponse, () => sendResponse(false));
      return true;
    }
    // true = responderemos de forma asíncrona.
    return handleTtsMessage(tts, msg, sendResponse) ?? live.handle(msg, sendResponse) ?? undefined;
  });
});
