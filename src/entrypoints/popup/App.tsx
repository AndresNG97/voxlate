import { setUiLanguage, t, uiLocale } from '@/i18n';
import { Tabs } from './controls';
import { DubTab } from './DubTab';
import { LiveTab } from './LiveTab';
import { StatusTab } from './StatusTab';
import { SubtitleTab } from './SubtitleTab';
import { SettingsTab } from './SettingsTab';
import { LanguageBar, TranslationTab } from './TranslationTab';
import { useSettings } from './useSettings';
import { VoiceTab } from './VoiceTab';

type TabId = 'status' | 'translation' | 'subtitles' | 'dub' | 'voice' | 'audio' | 'settings';

export default function App() {
  const [s, set] = useSettings();
  if (!s) return null;
  // Idioma de la interfaz: antes de pintar, para que todo el árbol use los textos nuevos.
  setUiLanguage(s.uiLanguage);
  document.documentElement.lang = uiLocale;

  return (
    <main>
      <header>
        <img src="/icon/48.png" alt="" width={28} height={28} />
        <h1>Voxlate</h1>
        <label className="switch" title={s.enabled ? t.on : t.off}>
          <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span />
        </label>
      </header>

      <LanguageBar s={s} set={set} />

      <Tabs<TabId>
        tabs={[
          { id: 'status', label: t.tabs.status, render: () => <StatusTab s={s} /> },
          { id: 'translation', label: t.tabs.translation, render: () => <TranslationTab s={s} set={set} /> },
          { id: 'subtitles', label: t.tabs.subtitles, render: () => <SubtitleTab s={s} set={set} /> },
          { id: 'dub', label: t.tabs.dub, dot: s.dub, render: () => <DubTab s={s} set={set} /> },
          { id: 'voice', label: t.tabs.voice, render: () => <VoiceTab s={s} set={set} /> },
          // El modo audio solo existe si se compila con WXT_LIVE_MODE=true.
          ...(__LIVE_MODE__ ? [{ id: 'audio' as const, label: t.tabs.audio, render: () => <LiveTab /> }] : []),
          { id: 'settings', label: '⚙', title: t.tabs.settings, render: () => <SettingsTab s={s} set={set} /> },
        ]}
      />
    </main>
  );
}
