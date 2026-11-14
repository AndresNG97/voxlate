/**
 * Orquesta el modo audio desde el background:
 *   popup (gesto del usuario) → streamId → offscreen document (captura + STT + traducción)
 *   offscreen → background → overlay inyectado en la pestaña
 */
import type { SettingsStorePort } from '@/core/ports/settings-store';
import type { LiveState, RuntimeMessage } from './messages';

const OFFSCREEN_PATH = '/offscreen.html';

export class LiveController {
  private live: LiveState = { status: 'idle', tabId: null };

  constructor(private readonly settings: SettingsStorePort) {
    // Si cierran o recargan la pestaña capturada, paramos.
    browser.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.live.tabId) void this.stop();
    });
    browser.tabs.onUpdated.addListener((tabId, info) => {
      if (tabId === this.live.tabId && info.status === 'loading') void this.stop();
    });
  }

  /** Devuelve true si el mensaje era suyo y la respuesta es asíncrona. */
  handle(msg: RuntimeMessage, sendResponse: (r: unknown) => void): boolean | undefined {
    switch (msg.type) {
      case 'live:start':
        this.start(msg.tabId, msg.streamId).then(
          () => sendResponse({ ok: true }),
          (e: unknown) => {
            this.live = { status: 'error', tabId: msg.tabId, error: String(e) };
            sendResponse({ ok: false, error: String(e) });
          },
        );
        return true;
      case 'live:stop':
        this.stop().then(() => sendResponse({ ok: true }));
        return true;
      case 'live:get-status':
        sendResponse(this.live);
        return false;
      case 'live:status':
        this.live = { status: msg.status, tabId: msg.tabId, error: msg.error };
        this.sendToTab(msg.tabId, { type: 'live:overlay-status', status: msg.status, error: msg.error });
        return false;
      case 'live:transcript':
        this.sendToTab(msg.tabId, {
          type: 'live:caption',
          original: msg.original,
          translated: msg.translated,
          isFinal: msg.isFinal,
        });
        return false;
    }
    return undefined;
  }

  private async start(tabId: number, streamId: string) {
    if (this.live.status !== 'idle') await this.stop();
    this.live = { status: 'connecting', tabId };

    // Overlay genérico en la pestaña (permiso temporal gracias a activeTab).
    await browser.scripting.executeScript({ target: { tabId }, files: ['/live-overlay.js'] });

    await this.ensureOffscreen();
    const s = await this.settings.get();
    await browser.runtime.sendMessage({
      type: 'offscreen:start',
      target: 'offscreen',
      streamId,
      tabId,
      from: s.sourceLang,
      to: s.targetLang,
    } satisfies RuntimeMessage);
  }

  private async stop() {
    const tabId = this.live.tabId;
    this.live = { status: 'idle', tabId: null };
    if (await this.hasOffscreen()) {
      await browser.runtime.sendMessage({ type: 'offscreen:stop', target: 'offscreen' } satisfies RuntimeMessage);
      await browser.offscreen.closeDocument();
    }
    if (tabId != null) this.sendToTab(tabId, { type: 'live:overlay-status', status: 'idle' });
  }

  private async hasOffscreen() {
    const contexts = await browser.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType],
    });
    return contexts.length > 0;
  }

  private async ensureOffscreen() {
    if (await this.hasOffscreen()) return;
    await browser.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['USER_MEDIA' as Browser.offscreen.Reason],
      justification: 'Capturar el audio de la pestaña para transcribirlo y traducirlo en tiempo real.',
    });
  }

  private sendToTab(tabId: number, msg: RuntimeMessage) {
    browser.tabs.sendMessage(tabId, msg).catch(() => {
      /* la pestaña se cerró o navegó */
    });
  }
}
