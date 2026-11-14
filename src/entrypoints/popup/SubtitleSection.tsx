import { DEFAULT_SETTINGS, type Settings } from '@/core/domain/settings';
import { Check, Group, Range, Segmented } from './controls';
import type { SetSettings } from './useSettings';

export function SubtitleSection({ s, set }: { s: Settings; set: SetSettings }) {
  const reset = () =>
    set({
      showTranslated: DEFAULT_SETTINGS.showTranslated,
      showOriginal: DEFAULT_SETTINGS.showOriginal,
      originalFirst: DEFAULT_SETTINGS.originalFirst,
      fontScale: DEFAULT_SETTINGS.fontScale,
      subtitlePosition: DEFAULT_SETTINGS.subtitlePosition,
      subtitleOffset: DEFAULT_SETTINGS.subtitleOffset,
      subtitleBackground: DEFAULT_SETTINGS.subtitleBackground,
      subtitleBgOpacity: DEFAULT_SETTINGS.subtitleBgOpacity,
      translatedColor: DEFAULT_SETTINGS.translatedColor,
      originalColor: DEFAULT_SETTINGS.originalColor,
    });

  return (
    <Group title="Subtítulos" defaultOpen>
      <div className="colors">
        <Check checked={s.showTranslated} onChange={(v) => set({ showTranslated: v })}>
          Traducción
        </Check>
        <input
          type="color"
          value={s.translatedColor}
          onChange={(e) => set({ translatedColor: e.target.value })}
          aria-label="Color de la traducción"
        />
      </div>
      <div className="colors">
        <Check checked={s.showOriginal} onChange={(v) => set({ showOriginal: v })}>
          Original
        </Check>
        <input
          type="color"
          value={s.originalColor}
          onChange={(e) => set({ originalColor: e.target.value })}
          aria-label="Color del original"
        />
      </div>
      {s.showTranslated && s.showOriginal && (
        <Check checked={s.originalFirst} onChange={(v) => set({ originalFirst: v })}>
          Original encima de la traducción
        </Check>
      )}

      <div className="label">Posición</div>
      <Segmented
        value={s.subtitlePosition}
        options={[
          ['bottom', 'Abajo'],
          ['top', 'Arriba'],
        ]}
        onChange={(subtitlePosition) => set({ subtitlePosition })}
      />
      <Range
        label="Distancia al borde"
        value={s.subtitleOffset}
        display={`${s.subtitleOffset}%`}
        min={0}
        max={40}
        step={1}
        onChange={(subtitleOffset) => set({ subtitleOffset })}
      />
      <Range
        label="Tamaño del texto"
        value={s.fontScale}
        display={`${s.fontScale}%`}
        min={70}
        max={160}
        step={10}
        onChange={(fontScale) => set({ fontScale })}
      />

      <Check checked={s.subtitleBackground} onChange={(v) => set({ subtitleBackground: v })}>
        Fondo detrás del texto
      </Check>
      {s.subtitleBackground ? (
        <Range
          label="Opacidad del fondo"
          value={s.subtitleBgOpacity}
          display={`${s.subtitleBgOpacity}%`}
          min={10}
          max={100}
          step={5}
          onChange={(subtitleBgOpacity) => set({ subtitleBgOpacity })}
        />
      ) : (
        <p className="hint">Sin fondo, el texto lleva un contorno oscuro para que se lea.</p>
      )}

      <button className="link small" onClick={reset}>
        Restablecer estilo
      </button>
    </Group>
  );
}
