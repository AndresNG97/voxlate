/**
 * Service worker (raíz de composición).
 * - Modo audio: LiveController orquesta el offscreen document y el overlay.
 * - Doblaje: atiende los tts:* de los content scripts con chrome.tts.
 */
import { ChromeTtsSynthesizer, handleTtsMessage } from '@/adapters/chrome/chrome-tts';
import { LiveController } from '@/adapters/chrome/live-controller';
import type { RuntimeMessage } from '@/adapters/chrome/messages';
import { ChromeSettingsStore } from '@/adapters/chrome/settings-storage';

export default defineBackground(() => {
  const live = new LiveController(new ChromeSettingsStore());
  const tts = new ChromeTtsSynthesizer();

  browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as RuntimeMessage;
    // true = responderemos de forma asíncrona.
    return handleTtsMessage(tts, msg, sendResponse) ?? live.handle(msg, sendResponse) ?? undefined;
  });
});
