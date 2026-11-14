import { Tabs } from './controls';
import { DubTab } from './DubTab';
import { LiveTab } from './LiveTab';
import { StatusTab } from './StatusTab';
import { SubtitleTab } from './SubtitleTab';
import { LanguageBar, TranslationTab } from './TranslationTab';
import { useSettings } from './useSettings';
import { VoiceTab } from './VoiceTab';

type TabId = 'status' | 'translation' | 'subtitles' | 'dub' | 'voice' | 'audio';

export default function App() {
  const [s, set] = useSettings();
  if (!s) return null;

  return (
    <main>
      <header>
        <img src="/icon/48.png" alt="" width={28} height={28} />
        <h1>Voxlate</h1>
        <label className="switch" title={s.enabled ? 'Activado' : 'Desactivado'}>
          <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span />
        </label>
      </header>

      <LanguageBar s={s} set={set} />

      <Tabs<TabId>
        tabs={[
          { id: 'status', label: 'Estado', render: () => <StatusTab s={s} /> },
          { id: 'translation', label: 'Traducción', render: () => <TranslationTab s={s} set={set} /> },
          { id: 'subtitles', label: 'Subtítulos', render: () => <SubtitleTab s={s} set={set} /> },
          { id: 'dub', label: 'Doblaje', dot: s.dub, render: () => <DubTab s={s} set={set} /> },
          { id: 'voice', label: 'Voz', render: () => <VoiceTab s={s} set={set} /> },
          { id: 'audio', label: 'Audio', render: () => <LiveTab /> },
        ]}
      />
    </main>
  );
}
