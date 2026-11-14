/** Barra de idiomas (siempre visible) y pestaña "Traducción": motor, modelo y traducciones guardadas. */
import { useEffect, useState } from 'react';
import { ChromeTranslator } from '@/adapters/chrome/chrome-translator';
import { ChromeTranslationCache } from '@/adapters/chrome/translation-cache';
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, type Settings } from '@/core/domain/settings';
import type { TranslatorAvailability } from '@/core/ports/translator';
import { Card, Segmented } from './controls';
import type { SetSettings } from './useSettings';

const translator = new ChromeTranslator();
const cache = new ChromeTranslationCache();

/** Idioma del vídeo → idioma destino. Afecta a todo, por eso va fuera de las pestañas. */
export function LanguageBar({ s, set }: { s: Settings; set: SetSettings }) {
  return (
    <div className="langs">
      <select value={s.sourceLang} onChange={(e) => set({ sourceLang: e.target.value })} aria-label="Idioma del vídeo">
        {SOURCE_LANGUAGES.map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <span className="arrow">→</span>
      <select value={s.targetLang} onChange={(e) => set({ targetLang: e.target.value })} aria-label="Traducir a">
        {TARGET_LANGUAGES.map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TranslationTab({ s, set }: { s: Settings; set: SetSettings }) {
  const [model, setModel] = useState<TranslatorAvailability | 'checking'>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    setModel('checking');
    translator.availability(s.sourceLang, s.targetLang).then(setModel);
  }, [s.sourceLang, s.targetLang]);

  useEffect(() => {
    cache.count().then(setSaved, () => setSaved(0));
  }, []);

  async function downloadModel() {
    setProgress(0);
    try {
      // El clic en este botón es la "activación de usuario" que pide Chrome.
      await translator.prepare(s.sourceLang, s.targetLang, setProgress);
      setModel('available');
    } catch {
      setModel(await translator.availability(s.sourceLang, s.targetLang));
    } finally {
      setProgress(null);
    }
  }

  async function clearSaved() {
    await cache.clear();
    setSaved(0);
  }

  return (
    <>
      <Card title="Motor de traducción">
        <Segmented
          value={s.engine}
          options={[
            ['chrome', 'Chrome (local)'],
            ['youtube', 'YouTube'],
          ]}
          onChange={(engine) => set({ engine })}
        />
        <p className="hint">
          {s.engine === 'chrome'
            ? 'Traduce en tu equipo: gratis, privado y sin conexión. Si no está disponible, se usa YouTube.'
            : 'Usa la traducción automática de los propios subtítulos de YouTube.'}
        </p>
        {s.engine === 'chrome' && <ModelStatus state={model} progress={progress} onDownload={downloadModel} />}
      </Card>

      <Card title="Traducciones guardadas">
        <p className="hint">
          Cada vídeo se traduce entero una vez y se guarda, así al volver a verlo es instantáneo
          {saved !== null && ` (${saved} ${saved === 1 ? 'vídeo' : 'vídeos'} guardados)`}.
        </p>
        <button className="link small" onClick={clearSaved} disabled={!saved}>
          Borrar traducciones guardadas
        </button>
      </Card>
    </>
  );
}

function ModelStatus(props: { state: TranslatorAvailability | 'checking'; progress: number | null; onDownload: () => void }) {
  const { state, progress, onDownload } = props;
  if (progress !== null)
    return (
      <div className="model">
        <div className="bar">
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        Descargando modelo… {Math.round(progress * 100)}%
      </div>
    );
  switch (state) {
    case 'checking':
      return <div className="model muted">Comprobando modelo…</div>;
    case 'available':
      return <div className="model ok">● Modelo listo, traduce sin conexión</div>;
    case 'downloadable':
    case 'downloading':
      return (
        <div className="model">
          Hay que descargar el modelo una vez.
          <button className="link" onClick={onDownload}>
            Descargar
          </button>
        </div>
      );
    case 'unavailable':
      return <div className="model warn">Este par de idiomas no está disponible en Chrome. Usa YouTube.</div>;
    case 'unsupported':
      return <div className="model warn">Tu Chrome no tiene la Translator API (necesitas Chrome 138+ en escritorio).</div>;
  }
}
