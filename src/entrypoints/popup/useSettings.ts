import { useCallback, useEffect, useState } from 'react';
import { ChromeSettingsStore } from '@/adapters/chrome/settings-storage';
import type { Settings } from '@/core/domain/settings';

const store = new ChromeSettingsStore();

export type SetSettings = (patch: Partial<Settings>) => void;

/** Ajustes actuales + función para cambiarlos (se guardan al momento). */
export function useSettings(): [Settings | null, SetSettings] {
  const [s, setS] = useState<Settings | null>(null);

  useEffect(() => {
    store.get().then(setS);
    return store.watch(setS);
  }, []);

  const set = useCallback<SetSettings>((patch) => {
    setS((prev) => (prev ? { ...prev, ...patch } : prev));
    void store.update(patch);
  }, []);

  return [s, set];
}
