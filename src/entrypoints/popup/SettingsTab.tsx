/** Pestaña "Ajustes": opciones de la propia extensión (de momento, su idioma). */
import type { Settings, UiLanguage } from '@/core/domain/settings';
import { chromeLanguageName, t, UI_LANGUAGES } from '@/i18n';
import { Card } from './controls';
import type { SetSettings } from './useSettings';

export function SettingsTab({ s, set }: { s: Settings; set: SetSettings }) {
  return (
    <Card title={t.settings.languageTitle}>
      <select
        value={s.uiLanguage}
        onChange={(e) => set({ uiLanguage: e.target.value as UiLanguage })}
        aria-label={t.settings.languageLabel}
      >
        <option value="auto">{t.settings.auto(chromeLanguageName())}</option>
        {UI_LANGUAGES.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <p className="hint">{t.settings.languageHint}</p>
    </Card>
  );
}
