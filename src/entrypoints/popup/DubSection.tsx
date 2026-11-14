import { useEffect, useState } from 'react';
import { voicesFor, type TtsVoice } from '@/adapters/chrome/tts-voices';
import { manualHeadroom, SYNC_LIMITS } from '@/core/domain/dub-sync';
import type { Settings } from '@/core/domain/settings';
import { Check, Group, Range } from './controls';
import type { SetSettings } from './useSettings';

/**
 * Abre Configuración → Hora e idioma → Voz de Windows (donde se añaden voces).
 * Se navega la pestaña activa a un protocolo externo: Chrome no cambia la
 * página, solo pregunta "¿Abrir Configuración?" y lanza la app.
 */
async function openWindowsVoiceSettings(): Promise<boolean> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await browser.tabs.update(tab.id, { url: 'ms-settings:speech' });
    else await browser.tabs.create({ url: 'ms-settings:speech' });
    return true;
  } catch {
    return false;
  }
}

export function DubSection({ s, set }: { s: Settings; set: SetSettings }) {
  const [voices, setVoices] = useState<TtsVoice[] | null>(null);
  const [isWindows, setIsWindows] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    browser.runtime.getPlatformInfo().then((p) => setIsWindows(p.os === 'win'));
  }, []);

  useEffect(() => {
    setVoices(null);
    voicesFor(s.targetLang).then(setVoices, () => setVoices([]));
  }, [s.targetLang]);

  const local = voices?.filter((v) => !v.remote) ?? [];
  const remote = voices?.filter((v) => v.remote) ?? [];
  // Si la voz guardada no existe para este idioma, mostramos "Automática".
  const selected = voices?.some((v) => v.voiceName === s.dubVoice) ? s.dubVoice : '';

  const settingsButton = isWindows && (
    <button
      className="link"
      onClick={async () => setOpenFailed(!(await openWindowsVoiceSettings()))}
      title="Abre Configuración → Hora e idioma → Voz"
    >
      {voices?.length ? 'Añadir más voces' : 'Abrir la configuración de voz'}
    </button>
  );

  return (
    <Group title="Doblaje" badge={s.dub ? <span className="pill on">activo</span> : null}>
      <Check checked={s.dub} onChange={(dub) => set({ dub })}>
        Leer la traducción en voz alta
      </Check>
      {s.dub && (
        <>
          {voices && !voices.length ? (
            <p className="model warn">
              No hay voces para este idioma.{' '}
              {isWindows ? 'Añade una en la configuración de voz de Windows.' : 'Instala una voz en tu sistema.'}{' '}
              {settingsButton}
            </p>
          ) : (
            <select value={selected} onChange={(e) => set({ dubVoice: e.target.value })} aria-label="Voz">
              <option value="">Automática{local[0] ? ` (${local[0].voiceName})` : ''}</option>
              {local.length > 0 && (
                <optgroup label="En tu equipo (sin conexión)">
                  {local.map((v) => (
                    <option key={v.voiceName} value={v.voiceName}>
                      {v.voiceName}
                    </option>
                  ))}
                </optgroup>
              )}
              {remote.length > 0 && (
                <optgroup label="En línea (envían el texto a Google)">
                  {remote.map((v) => (
                    <option key={v.voiceName} value={v.voiceName}>
                      {v.voiceName}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {voices && voices.length > 0 && settingsButton && <div className="model">{settingsButton}</div>}
          {openFailed && (
            <p className="model warn">No se pudo abrir. Ve a Configuración → Hora e idioma → Voz → Agregar voces.</p>
          )}
          {isWindows && <p className="hint">Si acabas de instalar una voz, reinicia Chrome para que aparezca.</p>}

          <Check checked={s.dubSync} onChange={(dubSync) => set({ dubSync })}>
            Modo sincronización
          </Check>
          <p className="hint">
            {s.dubSync
              ? `Si una frase no cabe, ralentiza el vídeo (hasta el ${Math.round(SYNC_LIMITS.minVideoFactor * 100)}%) y acelera un poco la voz (como mucho +${Math.round((SYNC_LIMITS.maxVoiceBoost - 1) * 100)}%), repartiendo el ajuste entre los dos.`
              : 'Manual: la voz y el vídeo van siempre a las velocidades que elijas.'}
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
          <Range
            label="Volumen del audio original"
            value={s.dubOriginalVolume}
            display={`${s.dubOriginalVolume}%`}
            min={0}
            max={100}
            step={5}
            onChange={(dubOriginalVolume) => set({ dubOriginalVolume })}
          />
        </>
      )}
    </Group>
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
