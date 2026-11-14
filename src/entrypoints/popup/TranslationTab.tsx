/** Barra de idiomas (siempre visible) y pestaña "Traducción": motor, modelo y traducciones guardadas. */
import { useEffect, useState } from 'react';
import { ChromeTranslator } from '@/adapters/chrome/chrome-translator';
import { ChromeTranslationCache, MAX_AGE_DAYS, MAX_ENTRIES } from '@/adapters/chrome/translation-cache';
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, type Settings } from '@/core/domain/settings';
import type { TranslatorAvailability } from '@/core/ports/translator';
import { languageName, t } from '@/i18n';
import { Card, Segmented } from './controls';
import { formatBytes } from './format';
import type { SetSettings } from './useSettings';

const translator = new ChromeTranslator();
const cache = new ChromeTranslationCache();

/** Idioma del vídeo → idioma destino. Afecta a todo, por eso va fuera de las pestañas. */
export function LanguageBar({ s, set }: { s: Settings; set: SetSettings }) {
  return (
    <div className="langs">
      <select value={s.sourceLang} onChange={(e) => set({ sourceLang: e.target.value })} aria-label={t.langs.video}>
        {SOURCE_LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {languageName(code)}
          </option>
        ))}
      </select>
      <span className="arrow">→</span>
      <select value={s.targetLang} onChange={(e) => set({ targetLang: e.target.value })} aria-label={t.langs.target}>
        {TARGET_LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {languageName(code)}
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
  const [savedBytes, setSavedBytes] = useState(0);

  useEffect(() => {
    setModel('checking');
    translator.availability(s.sourceLang, s.targetLang).then(setModel);
  }, [s.sourceLang, s.targetLang]);

  useEffect(() => {
    cache.count().then(setSaved, () => setSaved(0));
    cache.bytes().then(setSavedBytes, () => {});
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
    setSavedBytes(0);
  }

  return (
    <>
      <Card title={t.translation.engineTitle}>
        <Segmented
          value={s.engine}
          options={[
            ['chrome', t.translation.engineChrome],
            ['youtube', t.translation.engineYoutube],
          ]}
          onChange={(engine) => set({ engine })}
        />
        <p className="hint">
          {s.engine === 'chrome' ? t.translation.hintChrome : t.translation.hintYoutube}
        </p>
        {s.engine === 'chrome' && <ModelStatus state={model} progress={progress} onDownload={downloadModel} />}
      </Card>

      <Card title={t.translation.savedTitle}>
        <p className="hint">
          {t.translation.savedHint(saved === null ? null : `${t.videos(saved)}, ${formatBytes(savedBytes)}`)}
        </p>
        <p className="hint">{t.translation.savedCleanup(MAX_ENTRIES, MAX_AGE_DAYS)}</p>
        <button className="link small" onClick={clearSaved} disabled={!saved}>
          {t.translation.clearSaved}
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
        {t.translation.downloadingModel(Math.round(progress * 100))}
      </div>
    );
  switch (state) {
    case 'checking':
      return <div className="model muted">{t.translation.checkingModel}</div>;
    case 'available':
      return <div className="model ok">{t.translation.modelReady}</div>;
    case 'downloadable':
    case 'downloading':
      return (
        <div className="model">
          {t.translation.modelNeedsDownload}
          <button className="link" onClick={onDownload}>
            {t.translation.download}
          </button>
        </div>
      );
    case 'unavailable':
      return <div className="model warn">{t.translation.pairUnavailable}</div>;
    case 'unsupported':
      return <div className="model warn">{t.translation.noTranslatorApi}</div>;
  }
}
