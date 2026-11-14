/**
 * Adaptador de TranslatorPort sobre la Translator API integrada en Chrome
 * (modelos de traducción on-device). Funciona en cualquier contexto con
 * `self.Translator`: página (MAIN world), popup u offscreen document.
 *
 * - Cachea un traductor por par de idiomas.
 * - Cachea traducciones (los subtítulos se repiten mucho: "Yeah.", "Okay.").
 * - Limita la concurrencia para no saturar el modelo.
 */
import type { TranslatorAvailability, TranslatorPort } from '@/core/ports/translator';

const MAX_CACHE = 5000;
const MAX_CONCURRENT = 4;

export class ChromeTranslator implements TranslatorPort {
  private readonly translators = new Map<string, Promise<Translator>>();
  private readonly cache = new Map<string, string>();
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  private static isSupported(): boolean {
    return typeof self !== 'undefined' && 'Translator' in self;
  }

  async availability(from: string, to: string): Promise<TranslatorAvailability> {
    if (!ChromeTranslator.isSupported()) return 'unsupported';
    try {
      return await Translator.availability({ sourceLanguage: from, targetLanguage: to });
    } catch {
      return 'unavailable';
    }
  }

  async prepare(from: string, to: string, onProgress?: (fraction: number) => void): Promise<void> {
    await this.getTranslator(from, to, onProgress);
  }

  translate(texts: string[], from: string, to: string): Promise<string[]> {
    return Promise.all(texts.map((t) => this.translateOne(t, from, to)));
  }

  /**
   * Crea (o reutiliza) el traductor. Si el modelo aún no está descargado, Chrome
   * exige activación de usuario (un clic reciente) para iniciar la descarga.
   */
  private getTranslator(from: string, to: string, onProgress?: (fraction: number) => void): Promise<Translator> {
    const key = `${from}>${to}`;
    let t = this.translators.get(key);
    if (!t) {
      t = Translator.create({
        sourceLanguage: from,
        targetLanguage: to,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded));
        },
      });
      // Si falla (p. ej. sin activación de usuario) permitimos reintentar.
      t.catch(() => this.translators.delete(key));
      this.translators.set(key, t);
    }
    return t;
  }

  private async translateOne(text: string, from: string, to: string): Promise<string> {
    const clean = text.trim();
    if (!clean || from === to) return clean;
    const key = `${from}>${to}|${clean}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const translator = await this.getTranslator(from, to);
    const out = await this.withSlot(() => translator.translate(clean));
    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, out);
    return out;
  }

  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_CONCURRENT) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}
