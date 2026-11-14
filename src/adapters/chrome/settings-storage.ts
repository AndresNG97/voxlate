/** Adaptador de SettingsStorePort sobre chrome.storage.sync (vía WXT). */
import { storage } from '#imports';
import { withDefaults, type Settings } from '@/core/domain/settings';
import type { SettingsStorePort } from '@/core/ports/settings-store';

const settingsItem = storage.defineItem<Partial<Settings>>('sync:settings', { fallback: {} });

export class ChromeSettingsStore implements SettingsStorePort {
  async get(): Promise<Settings> {
    return withDefaults(await settingsItem.getValue());
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.get()), ...patch };
    await settingsItem.setValue(next);
    return next;
  }

  watch(cb: (settings: Settings) => void): () => void {
    return settingsItem.watch((s) => cb(withDefaults(s)));
  }
}
