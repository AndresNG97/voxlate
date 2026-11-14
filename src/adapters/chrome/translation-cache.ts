/**
 * Adaptador de TranslationCachePort sobre chrome.storage.local (10 MB).
 * Guarda los últimos MAX_ENTRIES vídeos; un vídeo de una hora ocupa ~100 KB.
 */
import type { TranslationCachePort } from '@/core/ports/translation-cache';

const PREFIX = 'tr:';
const INDEX_KEY = 'tr-index';
const MAX_ENTRIES = 40;

export class ChromeTranslationCache implements TranslationCachePort {
  async load(key: string): Promise<(string | null)[] | null> {
    const k = PREFIX + key;
    const value = (await browser.storage.local.get(k))[k];
    if (!Array.isArray(value)) return null;
    void this.touch(key);
    return value as (string | null)[];
  }

  async save(key: string, translations: (string | null)[]): Promise<void> {
    await browser.storage.local.set({ [PREFIX + key]: translations });
    await this.touch(key);
  }

  /** Cuántos vídeos/idiomas hay guardados. */
  async count(): Promise<number> {
    const index = (await browser.storage.local.get(INDEX_KEY))[INDEX_KEY] as string[] | undefined;
    return index?.length ?? 0;
  }

  /** Borra todas las traducciones guardadas. */
  async clear(): Promise<void> {
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX) || k === INDEX_KEY);
    if (keys.length) await browser.storage.local.remove(keys);
  }

  /** Marca la entrada como reciente y borra las más antiguas. */
  private async touch(key: string) {
    const index = ((await browser.storage.local.get(INDEX_KEY))[INDEX_KEY] as string[] | undefined) ?? [];
    const next = [key, ...index.filter((k) => k !== key)];
    const evicted = next.splice(MAX_ENTRIES);
    await browser.storage.local.set({ [INDEX_KEY]: next });
    if (evicted.length) await browser.storage.local.remove(evicted.map((k) => PREFIX + k));
  }
}
