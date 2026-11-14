/** Pestaña "Subtítulos": qué se ve, dónde, a qué tamaño y con qué fondo. */
import { DEFAULT_SETTINGS, type Settings } from '@/core/domain/settings';
import { Card, Check, Range, Segmented } from './controls';
import type { SetSettings } from './useSettings';

const STYLE_KEYS = [
  'showTranslated',
  'showOriginal',
  'originalFirst',
  'fontScale',
  'subtitlePosition',
  'subtitleOffset',
  'subtitleBackground',
  'subtitleBgOpacity',
  'translatedColor',
  'originalColor',
] as const satisfies readonly (keyof Settings)[];

export function SubtitleTab({ s, set }: { s: Settings; set: SetSettings }) {
  const reset = () => set(Object.fromEntries(STYLE_KEYS.map((k) => [k, DEFAULT_SETTINGS[k]])) as Partial<Settings>);

  return (
    <>
      <Card title="Qué mostrar">
        <div className="row-inline">
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
        <div className="row-inline">
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
      </Card>

      <Card title="Posición y tamaño">
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
      </Card>

      <Card title="Fondo">
        <Check checked={s.subtitleBackground} onChange={(v) => set({ subtitleBackground: v })}>
          Fondo detrás del texto
        </Check>
        {s.subtitleBackground ? (
          <Range
            label="Opacidad"
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
      </Card>

      <button className="link small" onClick={reset}>
        Restablecer estilo
      </button>
    </>
  );
}
