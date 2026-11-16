/**
 * Pestaña "Estado": resumen de todo lo que está aplicado. Dos partes:
 * - Configuración: lo que has elegido.
 * - En esta pestaña: lo que está pasando de verdad en el vídeo de YouTube abierto
 *   (qué subtítulos llegaron, qué motor se usa, si Silero está analizando…).
 */
import { useEffect, useState } from 'react';
import { ChromeTranslator } from '@/adapters/chrome/chrome-translator';
import type { LiveState, PageStatus, RuntimeMessage } from '@/adapters/chrome/messages';
import { ChromeTranslationCache } from '@/adapters/chrome/translation-cache';
import { listStoredVoices } from '@/adapters/piper/piper-storage';
import { neuralVoicesFor } from '@/adapters/piper/piper-voices';
import type { Settings } from '@/core/domain/settings';
import type { TranslatorAvailability } from '@/core/ports/translator';
import { languageName, t } from '@/i18n';
import { Card } from './controls';
import { formatBytes } from './format';
import { activeYoutubeTabId } from './useActiveTab';

const translator = new ChromeTranslator();
const cache = new ChromeTranslationCache();
const REFRESH_MS = 2000;

type Tone = 'on' | 'off' | 'warn';

function Row({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="status-row">
      <i className={`status-dot ${tone}`} aria-hidden />
      <span className="status-label">{label}</span>
      <span className="status-value">{value}</span>
    </div>
  );
}

export function StatusTab({ s }: { s: Settings }) {
  const [model, setModel] = useState<TranslatorAvailability | 'checking'>('checking');
  const [saved, setSaved] = useState<number | null>(null);
  const [space, setSpace] = useState<{ translations: number; voices: number; voiceCount: number } | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [page, setPage] = useState<PageStatus | null | 'no-youtube' | 'no-response'>(null);

  useEffect(() => {
    translator.availability(s.sourceLang, s.targetLang).then(setModel);
  }, [s.sourceLang, s.targetLang]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      cache.count().then((n) => alive && setSaved(n), () => {});
      Promise.all([cache.bytes(), listStoredVoices()]).then(
        ([translations, voices]) =>
          alive && setSpace({ translations, voices: voices.reduce((n, v) => n + v.bytes, 0), voiceCount: voices.length }),
        () => {},
      );
      if (__LIVE_MODE__) {
        browser.runtime
          .sendMessage({ type: 'live:get-status' } satisfies RuntimeMessage)
          .then((st: LiveState) => alive && setLive(st), () => {});
      }
      const tabId = await activeYoutubeTabId();
      if (tabId === null) return alive && setPage('no-youtube');
      browser.tabs
        .sendMessage(tabId, { type: 'page:status' } satisfies RuntimeMessage)
        .then((st: PageStatus | undefined) => alive && setPage(st ?? 'no-response'), () => alive && setPage('no-response'));
    }
    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const neural = neuralVoicesFor(s.targetLang);
  const neuralName = (neural.find((v) => v.id === s.neuralVoice) ?? neural[0])?.label ?? '';
  const voiceFallsBack = s.dubEngine === 'neural' && !neural.length;
  const st = t.status;

  return (
    <>
      <Card title={st.configTitle}>
        <Row label={st.extension} value={s.enabled ? t.on : t.off} tone={s.enabled ? 'on' : 'off'} />
        <Row
          label={st.onOpen}
          value={s.autoTranslate ? st.onOpenAuto : st.onOpenManual}
          tone={s.autoTranslate ? 'on' : 'off'}
        />
        <Row label={st.languages} value={`${languageName(s.sourceLang)} → ${languageName(s.targetLang)}`} tone="on" />
        <Row
          label={st.engine}
          value={s.engine === 'chrome' ? t.translation.engineChrome : t.translation.engineYoutube}
          tone={s.engine === 'chrome' && (model === 'unavailable' || model === 'unsupported') ? 'warn' : 'on'}
        />
        {s.engine === 'chrome' && (
          <Row label={st.chromeModel} value={st.model[model]} tone={model === 'available' ? 'on' : 'warn'} />
        )}
        <Row label={st.saved} value={saved === null ? '…' : t.videos(saved)} tone={saved ? 'on' : 'off'} />
        <Row
          label={st.space}
          value={
            !space
              ? '…'
              : st.spaceValue(
                  formatBytes(space.translations),
                  space.voiceCount ? `${t.voices(space.voiceCount)} ${formatBytes(space.voices)}` : null,
                )
          }
          tone={space && (space.translations || space.voices) ? 'on' : 'off'}
        />
        <Row
          label={st.onScreen}
          value={
            [s.showTranslated && st.onScreenTranslated, s.showOriginal && st.onScreenOriginal]
              .filter(Boolean)
              .join(' + ') || st.none
          }
          tone={s.showTranslated || s.showOriginal ? 'on' : 'off'}
        />
        <Row label={st.dub} value={s.dub ? t.on : t.off} tone={s.dub ? 'on' : 'off'} />
        <Row
          label={st.sync}
          value={
            s.dubSync
              ? st.syncAuto(s.dubRate.toFixed(2))
              : st.syncManual(s.dubRate.toFixed(2), Math.round(s.dubVideoRate * 100))
          }
          tone={s.dub ? 'on' : 'off'}
        />
        <Row
          label={st.voiceType}
          value={
            voiceFallsBack
              ? st.neuralFallsBack
              : s.dubEngine === 'neural'
                ? st.neuralVoice(neuralName)
                : st.systemVoice(s.dubVoice ? s.dubVoice.split(' - ')[0]! : null)
          }
          tone={!s.dub ? 'off' : voiceFallsBack ? 'warn' : 'on'}
        />
        <Row
          label={st.precision}
          value={s.audioPrecision ? st.precisionOn : st.precisionOff}
          tone={s.audioPrecision && s.dub ? 'on' : 'off'}
        />
        <Row label={st.originalVolume} value={`${s.dubOriginalVolume} %`} tone={s.dub ? 'on' : 'off'} />
        {__LIVE_MODE__ && (
          <Row
            label={st.live}
            value={!live ? '…' : st.liveState[live.status]}
            tone={!live || live.status === 'idle' ? 'off' : live.status === 'error' ? 'warn' : 'on'}
          />
        )}
      </Card>

      <Card title={st.pageTitle}>
        <PageStatusRows page={page} s={s} />
      </Card>
    </>
  );
}

function PageStatusRows({ page, s }: { page: PageStatus | null | 'no-youtube' | 'no-response'; s: Settings }) {
  const st = t.status;
  if (page === null) return <p className="hint">{st.checking}</p>;
  if (page === 'no-youtube') return <p className="hint">{st.noYoutube}</p>;
  if (page === 'no-response') return <p className="hint">{st.noResponse}</p>;
  if (!page.active) {
    if (!s.enabled) return <p className="hint">{st.disabled}</p>;
    if (page.off === 'same-language' && page.videoLang)
      return <p className="hint">{st.videoSameLanguage(languageName(page.videoLang))}</p>;
    return <p className="hint">{page.off ? st.videoOff : st.noVideo}</p>;
  }

  const snap = page.session;
  const tracks =
    page.manualCues === null && page.asrWords === null
      ? st.waitingSubtitles
      : [page.manualCues !== null && st.manualTrack(page.manualCues), page.asrWords !== null && st.asrTrack(page.asrWords)]
          .filter(Boolean)
          .join(' + ');
  const engineName =
    snap?.engine === 'youtube'
      ? t.translation.engineYoutube
      : snap?.engine === 'chrome'
        ? t.translation.engineChrome
        : '—';
  const fellBack = snap?.engine === 'youtube' && s.engine === 'chrome';

  return (
    <>
      <Row label={st.received} value={tracks} tone={snap?.cues ? 'on' : 'warn'} />
      {!!snap?.cues && (
        <>
          <Row
            label={st.timing}
            value={snap.timedByWords ? st.timingWords(snap.timedByWords, snap.cues) : st.timingBlocks}
            tone={snap.timedByWords ? 'on' : 'warn'}
          />
          <Row
            label={st.inUse}
            value={`${engineName}${fellBack ? st.fallback : ''} · ${st.translatedOf(snap.translated, snap.cues)}`}
            tone={fellBack ? 'warn' : snap.translated ? 'on' : 'off'}
          />
        </>
      )}
      <Row
        label={st.voiceInUse}
        value={!s.dub ? st.dubOff : page.voice === 'neural' ? st.neuralPiper : st.systemShort}
        tone={s.dub ? 'on' : 'off'}
      />
      <Row
        label={st.silero}
        value={
          page.precision === 'off'
            ? st.sileroOff
            : page.precision === 'failed'
              ? st.sileroFailed
              : page.analyzedSec
                ? st.sileroAnalyzing(page.analyzedSec)
                : st.sileroWaiting
        }
        tone={page.precision === 'off' ? 'off' : page.precision === 'failed' ? 'warn' : 'on'}
      />
    </>
  );
}
