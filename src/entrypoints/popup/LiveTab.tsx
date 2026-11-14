/** Pestaña "Audio": modo audio (beta) para vídeos sin subtítulos en cualquier web. */
import { useEffect, useState } from 'react';
import type { LiveState, RuntimeMessage } from '@/adapters/chrome/messages';
import { t } from '@/i18n';
import { Card } from './controls';

export function LiveTab() {
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
    <Card title={t.live.title}>
      <p className="hint">{t.live.hint}</p>
      {live.status === 'idle' || live.status === 'error' ? (
        <button className="primary" onClick={start}>
          {t.live.start}
        </button>
      ) : (
        <button className="danger" onClick={stop}>
          {live.status === 'connecting' ? t.live.connecting : t.live.stop}
        </button>
      )}
      {(error || live.error) && <p className="error">{error ?? live.error}</p>}
    </Card>
  );
}
