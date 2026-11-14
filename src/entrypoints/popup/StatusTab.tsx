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
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, type Settings } from '@/core/domain/settings';
import type { TranslatorAvailability } from '@/core/ports/translator';
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

const langName = (code: string) =>
  [...SOURCE_LANGUAGES, ...TARGET_LANGUAGES].find(([c]) => c === code)?.[1] ?? code;

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
      browser.runtime
        .sendMessage({ type: 'live:get-status' } satisfies RuntimeMessage)
        .then((st: LiveState) => alive && setLive(st), () => {});
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
  const neuralName = (neural.find((v) => v.id === s.neuralVoice) ?? neural[0])?.label;
  const voiceFallsBack = s.dubEngine === 'neural' && !neural.length;

  return (
    <>
      <Card title="Configuración">
        <Row label="Extensión" value={s.enabled ? 'Activada' : 'Desactivada'} tone={s.enabled ? 'on' : 'off'} />
        <Row label="Idiomas" value={`${langName(s.sourceLang)} → ${langName(s.targetLang)}`} tone="on" />
        <Row
          label="Motor de traducción"
          value={s.engine === 'chrome' ? 'Chrome (local)' : 'YouTube'}
          tone={s.engine === 'chrome' && (model === 'unavailable' || model === 'unsupported') ? 'warn' : 'on'}
        />
        {s.engine === 'chrome' && (
          <Row
            label="Modelo de Chrome"
            value={
              {
                checking: 'Comprobando…',
                available: 'Listo, sin conexión',
                downloadable: 'Hay que descargarlo',
                downloading: 'Descargando…',
                unavailable: 'No disponible: se usará YouTube',
                unsupported: 'Chrome sin traductor: se usará YouTube',
              }[model]
            }
            tone={model === 'available' ? 'on' : 'warn'}
          />
        )}
        <Row
          label="Traducciones guardadas"
          value={saved === null ? '…' : `${saved} ${saved === 1 ? 'vídeo' : 'vídeos'}`}
          tone={saved ? 'on' : 'off'}
        />
        <Row
          label="Espacio usado"
          value={
            !space
              ? '…'
              : `Traducciones ${formatBytes(space.translations)} · ${
                  space.voiceCount
                    ? `${space.voiceCount} ${space.voiceCount === 1 ? 'voz' : 'voces'} ${formatBytes(space.voices)}`
                    : 'sin voces descargadas'
                }`
          }
          tone={space && (space.translations || space.voices) ? 'on' : 'off'}
        />
        <Row
          label="Subtítulos en pantalla"
          value={
            [s.showTranslated && 'traducción', s.showOriginal && 'original'].filter(Boolean).join(' + ') || 'ninguno'
          }
          tone={s.showTranslated || s.showOriginal ? 'on' : 'off'}
        />
        <Row label="Leer en voz alta (doblaje)" value={s.dub ? 'Activado' : 'Desactivado'} tone={s.dub ? 'on' : 'off'} />
        <Row
          label="Sincronización"
          value={
            s.dubSync
              ? `Automática · voz base ${s.dubRate.toFixed(2)}×`
              : `Manual · voz ${s.dubRate.toFixed(2)}× · vídeo ${Math.round(s.dubVideoRate * 100)} %`
          }
          tone={s.dub ? 'on' : 'off'}
        />
        <Row
          label="Tipo de voz"
          value={
            voiceFallsBack
              ? 'Neuronal no disponible en este idioma: del sistema'
              : s.dubEngine === 'neural'
                ? `Neuronal (Piper) · ${neuralName}`
                : `Del sistema · ${s.dubVoice ? s.dubVoice.split(' - ')[0] : 'automática'}`
          }
          tone={!s.dub ? 'off' : voiceFallsBack ? 'warn' : 'on'}
        />
        <Row
          label="Sincronía de precisión (Silero VAD)"
          value={s.audioPrecision ? 'Activada (solo en YouTube)' : 'Desactivada'}
          tone={s.audioPrecision && s.dub ? 'on' : 'off'}
        />
        <Row
          label="Volumen del original al doblar"
          value={`${s.dubOriginalVolume} %`}
          tone={s.dub ? 'on' : 'off'}
        />
        {__LIVE_MODE__ && (
        <Row
          label="Modo audio (beta)"
          value={
            !live
              ? '…'
              : { idle: 'Apagado', connecting: 'Conectando…', listening: 'Escuchando esta pestaña', error: 'Error' }[
                  live.status
                ]
          }
          tone={!live || live.status === 'idle' ? 'off' : live.status === 'error' ? 'warn' : 'on'}
        />
        )}
      </Card>

      <Card title="En esta pestaña">
        <PageStatusRows page={page} s={s} />
      </Card>
    </>
  );
}

function PageStatusRows({ page, s }: { page: PageStatus | null | 'no-youtube' | 'no-response'; s: Settings }) {
  if (page === null) return <p className="hint">Comprobando…</p>;
  if (page === 'no-youtube') return <p className="hint">Abre un vídeo de YouTube para ver qué está pasando en él.</p>;
  if (page === 'no-response')
    return <p className="hint">La extensión no está activa en esta pestaña. Recárgala (F5) para que empiece.</p>;
  if (!page.active)
    return <p className="hint">{s.enabled ? 'No hay ningún vídeo abierto en esta pestaña.' : 'La extensión está desactivada.'}</p>;

  const snap = page.session;
  const tracks =
    page.manualCues === null && page.asrWords === null
      ? 'Esperando subtítulos…'
      : [
          page.manualCues !== null && `manuales (${page.manualCues} frases)`,
          page.asrWords !== null && `automáticos (${page.asrWords} palabras)`,
        ]
          .filter(Boolean)
          .join(' + ');
  const engineName = snap?.engine === 'youtube' ? 'YouTube' : snap?.engine === 'chrome' ? 'Chrome (local)' : '—';
  const fellBack = snap?.engine === 'youtube' && s.engine === 'chrome';

  return (
    <>
      <Row label="Subtítulos recibidos" value={tracks} tone={snap?.cues ? 'on' : 'warn'} />
      {!!snap?.cues && (
        <>
          <Row
            label="Tiempos de cada frase"
            value={
              snap.timedByWords
                ? `De palabras en ${snap.timedByWords}/${snap.cues} frases (precisos)`
                : 'De los bloques (menos precisos)'
            }
            tone={snap.timedByWords ? 'on' : 'warn'}
          />
          <Row
            label="Traducción en uso"
            value={`${engineName}${fellBack ? ' (plan B)' : ''} · ${snap.translated}/${snap.cues} frases`}
            tone={fellBack ? 'warn' : snap.translated ? 'on' : 'off'}
          />
        </>
      )}
      <Row
        label="Voz en uso"
        value={!s.dub ? 'Doblaje apagado' : page.voice === 'neural' ? 'Neuronal (Piper)' : 'Del sistema'}
        tone={s.dub ? 'on' : 'off'}
      />
      <Row
        label="Silero VAD"
        value={
          page.precision === 'off'
            ? 'Apagado'
            : page.precision === 'failed'
              ? 'No se pudo iniciar'
              : page.analyzedSec
                ? `Analizando · ${page.analyzedSec} s de audio`
                : 'Esperando audio…'
        }
        tone={page.precision === 'off' ? 'off' : page.precision === 'failed' ? 'warn' : 'on'}
      />
    </>
  );
}
