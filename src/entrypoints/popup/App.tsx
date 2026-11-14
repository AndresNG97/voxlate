import { DubSection } from './DubSection';
import { LiveSection } from './LiveSection';
import { SubtitleSection } from './SubtitleSection';
import { TranslationSection } from './TranslationSection';
import { useSettings } from './useSettings';

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

      <TranslationSection s={s} set={set} />
      <SubtitleSection s={s} set={set} />
      <DubSection s={s} set={set} />
      <LiveSection />
    </main>
  );
}
