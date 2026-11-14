/**
 * Puerto: traducciones guardadas por pista, para no volver a traducir un vídeo
 * ya visto. Cada posición corresponde a una frase; null = aún sin traducir.
 * Adaptador: adapters/chrome/translation-cache.ts (chrome.storage.local)
 */
export interface TranslationCachePort {
  load(key: string): Promise<(string | null)[] | null>;
  save(key: string, translations: (string | null)[]): Promise<void>;
}
