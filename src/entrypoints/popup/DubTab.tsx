/** Pestaña "Doblaje": activarlo y cómo encaja la voz con el vídeo (sincronización, velocidades, volumen). */
import { manualHeadroom, SYNC_LIMITS } from '@/core/domain/dub-sync';
import type { Settings } from '@/core/domain/settings';
import { t } from '@/i18n';
import { Card, Check, Range, Segmented } from './controls';
import { useIsYoutubeTab } from './useActiveTab';
import type { SetSettings } from './useSettings';

export function DubTab({ s, set }: { s: Settings; set: SetSettings }) {
  const onYoutube = useIsYoutubeTab();
  return (
    <>
      <Card>
        <Check checked={s.dub} onChange={(dub) => set({ dub })}>
          <b>{t.dub.readAloud}</b>
        </Check>
        <p className="hint">{t.dub.voiceHint}</p>
      </Card>

      <Card title={t.dub.syncTitle}>
        <Segmented
          value={s.dubSync ? 'sync' : 'manual'}
          options={[
            ['sync', t.dub.auto],
            ['manual', t.dub.manual],
          ]}
          onChange={(mode) => set({ dubSync: mode === 'sync' })}
        />
        <p className="hint">
          {s.dubSync
            ? t.dub.autoHint(
                Math.round(SYNC_LIMITS.minVoice * 100),
                Math.round(SYNC_LIMITS.maxVoice * 100),
                Math.round(SYNC_LIMITS.maxVideo * 100),
                Math.round(SYNC_LIMITS.minVideo * 100),
              )
            : t.dub.manualHint}
        </p>
        <Range
          label={s.dubSync ? t.dub.baseVoiceRate : t.dub.voiceRate}
          value={s.dubRate}
          display={`${s.dubRate.toFixed(2)}×`}
          min={0.9}
          max={1.5}
          step={0.05}
          onChange={(dubRate) => set({ dubRate })}
        />
        {!s.dubSync && (
          <>
            <Range
              label={t.dub.videoRate}
              value={s.dubVideoRate}
              display={`${Math.round(s.dubVideoRate * 100)}%`}
              min={0.5}
              max={1}
              step={0.05}
              onChange={(dubVideoRate) => set({ dubVideoRate })}
            />
            <ManualHint voiceRate={s.dubRate} videoRate={s.dubVideoRate} />
          </>
        )}
      </Card>

      {onYoutube && (
        <Card title={t.dub.precisionTitle}>
          <Check checked={s.audioPrecision} onChange={(audioPrecision) => set({ audioPrecision })}>
            {t.dub.precisionCheck}
          </Check>
          <p className="hint">{t.dub.precisionHint}</p>
        </Card>
      )}

      <Card title={t.dub.originalTitle}>
        <Range
          label={t.dub.originalVolume}
          value={s.dubOriginalVolume}
          display={`${s.dubOriginalVolume}%`}
          min={0}
          max={100}
          step={5}
          onChange={(dubOriginalVolume) => set({ dubOriginalVolume })}
        />
      </Card>
    </>
  );
}

/** Explica qué supone la combinación manual de velocidades. */
function ManualHint({ voiceRate, videoRate }: { voiceRate: number; videoRate: number }) {
  const headroom = Math.round(manualHeadroom(voiceRate, videoRate) * 100);
  if (headroom === 0) return <p className="hint">{t.dub.headroomZero}</p>;
  return headroom > 0 ? (
    <p className="hint">{t.dub.headroomMore(headroom)}</p>
  ) : (
    <p className="hint warn-text">{t.dub.headroomLess(-headroom)}</p>
  );
}
