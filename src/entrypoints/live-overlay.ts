/**
 * Overlay del modo audio (FASE 2). No es un content script fijo: el background
 * lo inyecta con chrome.scripting solo en la pestaña que el usuario elige, así
 * no necesitamos permiso sobre <all_urls>.
 */
import type { RuntimeMessage } from '@/adapters/chrome/messages';
import { ChromeSettingsStore } from '@/adapters/chrome/settings-storage';
import { SubtitleOverlay } from '@/adapters/dom/subtitle-overlay';
import { subtitleStyleOf } from '@/core/domain/settings';
import { composeLines } from '@/core/domain/subtitles';

declare global {
  interface Window {
    __voxlateLive?: boolean;
  }
}

/** Si dejan de hablar, limpiamos los subtítulos tras este tiempo. */
const CLEAR_AFTER_MS = 4000;

export default defineUnlistedScript(async () => {
  if (window.__voxlateLive) return; // ya inyectado
  window.__voxlateLive = true;

  const store = new ChromeSettingsStore();
  let settings = await store.get();
  const view = new SubtitleOverlay({ kind: 'viewport' });
  view.setStyle(subtitleStyleOf(settings));
  view.setStatus('Conectando…');
  const unwatch = store.watch((s) => {
    settings = s;
    view.setStyle(subtitleStyleOf(s));
  });

  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const onMessage = (raw: unknown) => {
    const msg = raw as RuntimeMessage;
    if (msg.type === 'live:caption') {
      view.show(composeLines(msg.original, msg.translated, settings, !msg.isFinal));
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => view.clear(), CLEAR_AFTER_MS);
    } else if (msg.type === 'live:overlay-status') {
      if (msg.status === 'listening') view.setStatus(null);
      else if (msg.status === 'connecting') view.setStatus('Conectando…');
      else if (msg.status === 'error') view.setStatus(`Error: ${msg.error ?? 'desconocido'}`);
      else if (msg.status === 'idle') {
        clearTimeout(hideTimer);
        view.destroy();
        unwatch();
        browser.runtime.onMessage.removeListener(onMessage);
        window.__voxlateLive = false;
      }
    }
  };
  browser.runtime.onMessage.addListener(onMessage);
});
