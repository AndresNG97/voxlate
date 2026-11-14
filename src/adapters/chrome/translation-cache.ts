/**
 * Adaptador de TranslationCachePort sobre chrome.storage.local (cuota de 10 MB
 * de la extensión; no usa la caché general de Chrome).
 *
 * Limpieza automática:
 * - como mucho MAX_ENTRIES vídeos (se borran los menos usados),
 * - y caducan los que llevan MAX_AGE_DAYS sin abrirse.
 * - Si alguna vez se llena el espacio, se borra la mitad más antigua y se reintenta.
 * Un vídeo de una hora ocupa ~100 KB, así que el total ronda como mucho unos MB.
 */
import type { TranslationCachePort } from '@/core/ports/translation-cache';

const PREFIX = 'tr:';
const INDEX_KEY = 'tr-index';
export const MAX_ENTRIES = 40;
export const MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Índice: cada entrada guardada con la última vez que se usó (más reciente primero). */
interface IndexEntry {
  k: string;
  t: number;
}

export class ChromeTranslationCache implements TranslationCachePort {
  async load(key: string): Promise<(string | null)[] | null> {
    const k = PREFIX + key;
    const value = (await browser.storage.local.get(k))[k];
    if (!Array.isArray(value)) return null;
    void this.touch(key);
    return value as (string | null)[];
  }

  async save(key: string, translations: (string | null)[]): Promise<void> {
    try {
      await browser.storage.local.set({ [PREFIX + key]: translations });
    } catch {
      // Sin espacio: liberamos la mitad más antigua y lo intentamos otra vez.
      await this.evictOldest(Math.ceil((await this.readIndex()).length / 2));
      await browser.storage.local.set({ [PREFIX + key]: translations });
    }
    await this.touch(key);
  }

  /** Cuántos vídeos/idiomas hay guardados. */
  async count(): Promise<number> {
    return (await this.readIndex()).length;
  }

  /** Bytes que ocupan las traducciones guardadas. */
  async bytes(): Promise<number> {
    const keys = [INDEX_KEY, ...(await this.readIndex()).map((e) => PREFIX + e.k)];
    return browser.storage.local.getBytesInUse(keys);
  }

  /** Borra todas las traducciones guardadas. */
  async clear(): Promise<void> {
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX) || k === INDEX_KEY);
    if (keys.length) await browser.storage.local.remove(keys);
  }

  /** Marca la entrada como recién usada y quita las que sobran o han caducado. */
  private async touch(key: string) {
    const now = Date.now();
    const index = [{ k: key, t: now }, ...(await this.readIndex()).filter((e) => e.k !== key)];
    const keep = index.filter((e, i) => i < MAX_ENTRIES && now - e.t < MAX_AGE_DAYS * DAY_MS);
    const evicted = index.filter((e) => !keep.includes(e));
    await browser.storage.local.set({ [INDEX_KEY]: keep });
    if (evicted.length) await browser.storage.local.remove(evicted.map((e) => PREFIX + e.k));
  }

  private async evictOldest(count: number) {
    const index = await this.readIndex();
    const evicted = index.splice(Math.max(0, index.length - count));
    await browser.storage.local.set({ [INDEX_KEY]: index });
    if (evicted.length) await browser.storage.local.remove(evicted.map((e) => PREFIX + e.k));
  }

  private async readIndex(): Promise<IndexEntry[]> {
    const raw = (await browser.storage.local.get(INDEX_KEY))[INDEX_KEY] as (IndexEntry | string)[] | undefined;
    // Versiones anteriores guardaban solo las claves: las tomamos como usadas ahora.
    return (raw ?? []).map((e) => (typeof e === 'string' ? { k: e, t: Date.now() } : e));
  }
}
