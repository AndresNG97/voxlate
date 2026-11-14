/** Pestaña "Voz": qué voz lee el doblaje (neuronal o del sistema), elegirla y escucharla. */
import { useEffect, useState } from 'react';
import type { RuntimeMessage } from '@/adapters/chrome/messages';
import { voicesFor, type TtsVoice } from '@/adapters/chrome/tts-voices';
import {
  listStoredVoices,
  MAX_STORED_VOICES,
  removeStoredVoice,
  type StoredVoice,
} from '@/adapters/piper/piper-storage';
import { neuralVoiceLabel, neuralVoicesFor, type NeuralVoice } from '@/adapters/piper/piper-voices';
import type { Settings } from '@/core/domain/settings';
import type { SpeakResult } from '@/core/ports/speech-synthesizer';
import { Card, Segmented } from './controls';
import { formatBytes } from './format';
import type { SetSettings } from './useSettings';

export function VoiceTab({ s, set }: { s: Settings; set: SetSettings }) {
  const neural = neuralVoicesFor(s.targetLang);
  // Sin voz neuronal para este idioma, se usa la del sistema aunque esté elegida la neuronal.
  const usesSystem = s.dubEngine === 'system' || !neural.length;

  return (
    <>
      {!s.dub && <p className="notice">El doblaje está desactivado. Actívalo en la pestaña Doblaje para oír la voz en los vídeos.</p>}

      <Card title="Tipo de voz">
        <Segmented
          value={s.dubEngine}
          options={[
            ['neural', 'Neuronal'],
            ['system', 'Del sistema'],
          ]}
          onChange={(dubEngine) => set({ dubEngine })}
        />
        <p className="hint">
          {s.dubEngine === 'neural'
            ? 'Piper, en tu equipo: suena natural y prepara el audio por adelantado, así encaja mejor con el vídeo. Se descarga una vez (~60 MB por voz).'
            : 'Las voces que trae tu sistema operativo: sin descargas, pero suenan más robóticas.'}
        </p>
        {s.dubEngine === 'neural' && !neural.length && (
          <p className="model warn">No hay voz neuronal para este idioma: se usa la voz del sistema.</p>
        )}
      </Card>

      {usesSystem ? <SystemVoiceCard s={s} set={set} /> : <NeuralVoiceCard s={s} set={set} voices={neural} />}

      <DownloadedVoicesCard />
    </>
  );
}

// ------------------------------------------------------------ voz neuronal

const SAMPLE_TEXT: Record<string, string> = {
  es: 'Hola, así sonará el doblaje de tus vídeos.',
  en: 'Hi, this is how your videos will sound.',
  fr: 'Bonjour, voici comment sonneront tes vidéos.',
  de: 'Hallo, so werden deine Videos klingen.',
  it: 'Ciao, ecco come suoneranno i tuoi video.',
  pt: 'Olá, é assim que os teus vídeos vão soar.',
};

const ENGINE_DOWN =
  'El motor de voz no responde. Recarga la extensión; si sigue igual, mira la consola de offscreen.html en chrome://extensions.';

/** Selector de voz de Piper + botón para escucharla (la primera vez la descarga). */
function NeuralVoiceCard(props: { s: Settings; set: SetSettings; voices: NeuralVoice[] }) {
  const { s, set, voices } = props;
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onMsg = (raw: unknown) => {
      const msg = raw as RuntimeMessage;
      if (msg.type === 'neural:progress') setProgress(msg.fraction);
    };
    browser.runtime.onMessage.addListener(onMsg);
    return () => browser.runtime.onMessage.removeListener(onMsg);
  }, []);

  async function listen() {
    setError(null);
    setState('loading');
    try {
      const ready = await browser.runtime.sendMessage({ type: 'neural:ensure' } satisfies RuntimeMessage);
      if (ready !== true) throw new Error(ENGINE_DOWN);
      const lang = s.targetLang.split('-')[0]!;
      const promise = browser.runtime.sendMessage({
        type: 'neural:speak',
        target: 'offscreen',
        req: {
          text: SAMPLE_TEXT[lang] ?? SAMPLE_TEXT.en!,
          lang: s.targetLang,
          voiceName: s.neuralVoice,
          rate: s.dubRate,
          enqueue: false,
        },
      } satisfies RuntimeMessage) as Promise<SpeakResult | undefined>;
      setState('playing');
      const res = await promise;
      if (!res) throw new Error(ENGINE_DOWN);
      if (!res.ok && res.event !== 'interrupted') setError(res.error ?? 'No se pudo reproducir la voz.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setState('idle');
      setProgress(null);
    }
  }

  return (
    <Card title="Voz neuronal">
      <div className="row-inline">
        <select
          value={voices.some((v) => v.id === s.neuralVoice) ? s.neuralVoice : ''}
          onChange={(e) => set({ neuralVoice: e.target.value })}
          aria-label="Voz neuronal"
        >
          <option value="">Recomendada: {voices[0]!.label.split(' (')[0]}</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <button className="small-btn" onClick={listen} disabled={state !== 'idle'}>
          {state === 'idle' ? '▶ Escuchar' : state === 'loading' ? 'Cargando…' : 'Sonando…'}
        </button>
      </div>
      {progress !== null && progress < 1 && (
        <div className="model">
          <div className="bar">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          Descargando voz… {Math.round(progress * 100)}%
        </div>
      )}
      {error && <p className="model warn">{error}</p>}
    </Card>
  );
}

/** Voces neuronales descargadas: cuánto ocupan y botón para borrarlas. */
function DownloadedVoicesCard() {
  const [voices, setVoices] = useState<StoredVoice[] | null>(null);
  const refresh = () => listStoredVoices().then(setVoices, () => setVoices([]));
  useEffect(() => void refresh(), []);
  if (!voices?.length) return null;

  const total = voices.reduce((n, v) => n + v.bytes, 0);
  return (
    <Card title={`Voces descargadas · ${formatBytes(total)}`}>
      {voices.map((v) => (
        <div className="row-inline" key={v.id}>
          <span>
            {neuralVoiceLabel(v.id)} <span className="hint">· {formatBytes(v.bytes)}</span>
          </span>
          <button className="link small" onClick={() => removeStoredVoice(v.id).then(refresh)}>
            Borrar
          </button>
        </div>
      ))}
      <p className="hint">
        Se conservan como mucho {MAX_STORED_VOICES}: la que usas y la anterior. Las demás se borran solas; si vuelves
        a usar una borrada, se descarga otra vez.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------- voz del sistema

/**
 * Abre Configuración → Hora e idioma → Voz de Windows (donde se añaden voces).
 * Se navega la pestaña activa a un protocolo externo: Chrome no cambia la
 * página, solo pregunta "¿Abrir Configuración?" y lanza la app.
 */
async function openWindowsVoiceSettings(): Promise<boolean> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await browser.tabs.update(tab.id, { url: 'ms-settings:speech' });
    else await browser.tabs.create({ url: 'ms-settings:speech' });
    return true;
  } catch {
    return false;
  }
}

function SystemVoiceCard({ s, set }: { s: Settings; set: SetSettings }) {
  const [voices, setVoices] = useState<TtsVoice[] | null>(null);
  const [isWindows, setIsWindows] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    browser.runtime.getPlatformInfo().then((p) => setIsWindows(p.os === 'win'));
  }, []);

  useEffect(() => {
    setVoices(null);
    voicesFor(s.targetLang).then(setVoices, () => setVoices([]));
  }, [s.targetLang]);

  const local = voices?.filter((v) => !v.remote) ?? [];
  const remote = voices?.filter((v) => v.remote) ?? [];
  // Si la voz guardada no existe para este idioma, mostramos "Automática".
  const selected = voices?.some((v) => v.voiceName === s.dubVoice) ? s.dubVoice : '';

  const settingsButton = isWindows && (
    <button
      className="link"
      onClick={async () => setOpenFailed(!(await openWindowsVoiceSettings()))}
      title="Abre Configuración → Hora e idioma → Voz"
    >
      {voices?.length ? 'Añadir más voces de Windows' : 'Abrir la configuración de voz'}
    </button>
  );

  return (
    <Card title="Voz del sistema">
      {voices && !voices.length ? (
        <p className="model warn">
          No hay voces para este idioma.{' '}
          {isWindows ? 'Añade una en la configuración de voz de Windows.' : 'Instala una voz en tu sistema.'}{' '}
          {settingsButton}
        </p>
      ) : (
        <select value={selected} onChange={(e) => set({ dubVoice: e.target.value })} aria-label="Voz del sistema">
          {/* "Microsoft Helena - Spanish (Spain)" → "Microsoft Helena", para que quepa. */}
          <option value="">Automática{local[0] ? `: ${(local[0].voiceName ?? '').split(' - ')[0]}` : ''}</option>
          {local.length > 0 && (
            <optgroup label="En tu equipo (sin conexión)">
              {local.map((v) => (
                <option key={v.voiceName} value={v.voiceName}>
                  {v.voiceName}
                </option>
              ))}
            </optgroup>
          )}
          {remote.length > 0 && (
            <optgroup label="En línea (envían el texto a Google)">
              {remote.map((v) => (
                <option key={v.voiceName} value={v.voiceName}>
                  {v.voiceName}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
      {voices && voices.length > 0 && settingsButton && <div className="model">{settingsButton}</div>}
      {openFailed && (
        <p className="model warn">No se pudo abrir. Ve a Configuración → Hora e idioma → Voz → Agregar voces.</p>
      )}
      {isWindows && <p className="hint">Si acabas de instalar una voz, reinicia Chrome para que aparezca.</p>}
    </Card>
  );
}
