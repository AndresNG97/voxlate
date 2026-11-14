/**
 * Puerto: traducción de texto.
 * Adaptadores: adapters/chrome/chrome-translator.ts (Translator API on-device)
 *              adapters/youtube/agent-client.ts (la misma API, vía el MAIN world de YouTube)
 */
export type TranslatorAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

export interface TranslatorPort {
  availability(from: string, to: string): Promise<TranslatorAvailability>;
  /**
   * Deja el modelo listo (lo descarga si hace falta). En Chrome hay que
   * llamarlo justo después de un clic del usuario.
   */
  prepare(from: string, to: string, onProgress?: (fraction: number) => void): Promise<void>;
  translate(texts: string[], from: string, to: string): Promise<string[]>;
}
