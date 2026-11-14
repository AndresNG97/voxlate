/** Pestaña "Doblaje": activarlo y cómo encaja la voz con el vídeo (sincronización, velocidades, volumen). */
import { manualHeadroom, SYNC_LIMITS } from '@/core/domain/dub-sync';
import type { Settings } from '@/core/domain/settings';
import { Card, Check, Range, Segmented } from './controls';
import { useIsYoutubeTab } from './useActiveTab';
import type { SetSettings } from './useSettings';

export function DubTab({ s, set }: { s: Settings; set: SetSettings }) {
  const onYoutube = useIsYoutubeTab();
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
            ? `La voz empieza y acaba a la vez que la persona del vídeo. Nunca suena por debajo del ${Math.round(SYNC_LIMITS.minVoice * 100)} % (frenada resulta molesta) y como mucho va al ${Math.round(SYNC_LIMITS.maxVoice * 100)} %. Lo demás lo ajusta el vídeo: se acelera hasta el ${Math.round(SYNC_LIMITS.maxVideo * 100)} % si la traducción es más corta, o se ralentiza hasta el ${Math.round(SYNC_LIMITS.minVideo * 100)} % si es más larga.`
            : 'La voz y el vídeo van siempre a las velocidades que elijas.'}
        </p>
        <Range
          label={s.dubSync ? 'Velocidad base de la voz' : 'Velocidad de la voz'}
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

      {onYoutube && (
        <Card title="Sincronía de precisión · Silero VAD">
          <Check checked={s.audioPrecision} onChange={(audioPrecision) => set({ audioPrecision })}>
            Analizar la voz del vídeo
          </Check>
          <p className="hint">
            Un modelo de detección de voz (Silero) escucha el audio que YouTube ya tiene descargado (1-2 min por
            delante) y marca cuándo empieza y acaba de hablar la persona, ignorando risas, aplausos y música. El
            doblaje se ajusta a eso. Funciona en tu equipo. Solo en YouTube.
          </p>
        </Card>
      )}

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
