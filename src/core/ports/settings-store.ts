/**
 * Puerto: dónde se guardan los ajustes.
 * Adaptador: adapters/chrome/settings-storage.ts (chrome.storage.sync vía WXT)
 */
import type { Settings } from '../domain/settings';

export interface SettingsStorePort {
  get(): Promise<Settings>;
  update(patch: Partial<Settings>): Promise<Settings>;
  /** Devuelve una función para darse de baja. */
  watch(cb: (settings: Settings) => void): () => void;
}
