/** Pestaña "Doblaje": activarlo y cómo encaja la voz con el vídeo (sincronización, velocidades, volumen). */
import { manualHeadroom, SYNC_LIMITS } from '@/core/domain/dub-sync';
import type { Settings } from '@/core/domain/settings';
import { Card, Check, Range, Segmented } from './controls';
import type { SetSettings } from './useSettings';

export function DubTab({ s, set }: { s: Settings; set: SetSettings }) {
  return (
    <>
      <Card>
        <Check checked={s.dub} onChange={(dub) => set({ dub })}>
          <b>Leer la traducción en voz alta</b>
        </Check>
        <p className="hint">La voz se elige en la pestaña Voz.</p>
      </Card>

      <Card title="Sincronización con el vídeo">
        <Segmented
          value={s.dubSync ? 'sync' : 'manual'}
          options={[
            ['sync', 'Automática'],
            ['manual', 'Manual'],
          ]}
          onChange={(mode) => set({ dubSync: mode === 'sync' })}
        />
        <p className="hint">
          {s.dubSync
            ? `Si una frase no cabe, ralentiza el vídeo (hasta el ${Math.round(SYNC_LIMITS.minVideoFactor * 100)}%) y acelera un poco la voz (como mucho +${Math.round((SYNC_LIMITS.maxVoiceBoost - 1) * 100)}%), repartiendo el ajuste entre los dos.`
            : 'La voz y el vídeo van siempre a las velocidades que elijas.'}
        </p>
        <Range
          label={s.dubSync ? 'Velocidad base de la voz' : 'Velocidad de la voz'}
          value={s.dubRate}
          display={`${s.dubRate.toFixed(2)}×`}
          min={0.7}
          max={1.5}
          step={0.05}
          onChange={(dubRate) => set({ dubRate })}
        />
        {!s.dubSync && (
          <>
            <Range
              label="Velocidad del vídeo"
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

      <Card title="Audio original">
        <Range
          label="Volumen mientras se dobla"
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
  if (headroom === 0) return <p className="hint">Igual que sin ajustar: las frases largas se pueden solapar.</p>;
  return headroom > 0 ? (
    <p className="hint">Cabe un {headroom}% más de texto por frase que a velocidad normal.</p>
  ) : (
    <p className="hint warn-text">Cabe un {-headroom}% menos de texto por frase: la voz irá acumulando retraso.</p>
  );
}
