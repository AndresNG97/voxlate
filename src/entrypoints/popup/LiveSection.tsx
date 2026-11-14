import { useEffect, useState } from 'react';
import type { LiveState, RuntimeMessage } from '@/adapters/chrome/messages';

export function LiveSection() {
  const [live, setLive] = useState<LiveState>({ status: 'idle', tabId: null });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'live:get-status' } satisfies RuntimeMessage).then((st: LiveState) => setLive(st));
  }, []);

  async function start() {
    setError(null);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      setLive({ status: 'connecting', tabId: tab.id });
      const res = (await browser.runtime.sendMessage({
        type: 'live:start',
        tabId: tab.id,
        streamId,
      } satisfies RuntimeMessage)) as { ok: boolean; error?: string };
      if (!res.ok) throw new Error(res.error);
    } catch (e) {
      setLive({ status: 'idle', tabId: null });
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stop() {
    await browser.runtime.sendMessage({ type: 'live:stop' } satisfies RuntimeMessage);
    setLive({ status: 'idle', tabId: null });
  }

  return (
    <section className="live">
      <div className="label">
        Modo audio <span className="beta">beta</span>
      </div>
      <p className="hint">Para vídeos sin subtítulos, en cualquier web. Transcribe el audio en tiempo real.</p>
      {live.status === 'idle' || live.status === 'error' ? (
        <button className="primary" onClick={start}>
          Traducir el audio de esta pestaña
        </button>
      ) : (
        <button className="danger" onClick={stop}>
          {live.status === 'connecting' ? 'Conectando…' : 'Detener'}
        </button>
      )}
      {(error || live.error) && <p className="error">{error ?? live.error}</p>}
    </section>
  );
}
