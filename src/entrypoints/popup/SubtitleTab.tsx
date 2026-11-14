/** Pestaña "Subtítulos": qué se ve, dónde, a qué tamaño y con qué fondo. */
import { DEFAULT_SETTINGS, type Settings } from '@/core/domain/settings';
import { t } from '@/i18n';
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
      <Card title={t.subtitles.whatTitle}>
        <div className="row-inline">
          <Check checked={s.showTranslated} onChange={(v) => set({ showTranslated: v })}>
            {t.subtitles.translated}
          </Check>
          <input
            type="color"
            value={s.translatedColor}
            onChange={(e) => set({ translatedColor: e.target.value })}
            aria-label={t.subtitles.translatedColor}
          />
        </div>
        <div className="row-inline">
          <Check checked={s.showOriginal} onChange={(v) => set({ showOriginal: v })}>
            {t.subtitles.original}
          </Check>
          <input
            type="color"
            value={s.originalColor}
            onChange={(e) => set({ originalColor: e.target.value })}
            aria-label={t.subtitles.originalColor}
          />
        </div>
        {s.showTranslated && s.showOriginal && (
          <Check checked={s.originalFirst} onChange={(v) => set({ originalFirst: v })}>
            {t.subtitles.originalFirst}
          </Check>
        )}
      </Card>

      <Card title={t.subtitles.placeTitle}>
        <Segmented
          value={s.subtitlePosition}
          options={[
            ['bottom', t.subtitles.bottom],
            ['top', t.subtitles.top],
          ]}
          onChange={(subtitlePosition) => set({ subtitlePosition })}
        />
        <Range
          label={t.subtitles.offset}
          value={s.subtitleOffset}
          display={`${s.subtitleOffset}%`}
          min={0}
          max={40}
          step={1}
          onChange={(subtitleOffset) => set({ subtitleOffset })}
        />
        <Range
          label={t.subtitles.size}
          value={s.fontScale}
          display={`${s.fontScale}%`}
          min={70}
          max={160}
          step={10}
          onChange={(fontScale) => set({ fontScale })}
        />
      </Card>

      <Card title={t.subtitles.bgTitle}>
        <Check checked={s.subtitleBackground} onChange={(v) => set({ subtitleBackground: v })}>
          {t.subtitles.bg}
        </Check>
        {s.subtitleBackground ? (
          <Range
            label={t.subtitles.opacity}
            value={s.subtitleBgOpacity}
            display={`${s.subtitleBgOpacity}%`}
            min={10}
            max={100}
            step={5}
            onChange={(subtitleBgOpacity) => set({ subtitleBgOpacity })}
          />
        ) : (
          <p className="hint">{t.subtitles.noBgHint}</p>
        )}
      </Card>

      <button className="link small" onClick={reset}>
        {t.subtitles.reset}
      </button>
    </>
  );
}
