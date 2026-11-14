/**
 * Catálogo de voces del sistema vía chrome.tts (solo en contextos de extensión:
 * background y popup; los content scripts no tienen acceso a chrome.tts).
 *
 * Las voces "locales" (remote = false) son las que trae el sistema operativo
 * (en Windows: Microsoft Helena, Laura, Pablo…). Funcionan sin conexión y son
 * gratis. Las remotas (Google …) también son gratis pero envían el texto fuera.
 */

export type TtsVoice = Browser.tts.TtsVoice;

function baseLang(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0]!;
}

/** Voces del idioma pedido, primero las locales. */
export async function voicesFor(lang: string): Promise<TtsVoice[]> {
  const base = baseLang(lang);
  const all = await browser.tts.getVoices();
  return all
    .filter((v) => v.voiceName && v.lang && baseLang(v.lang) === base)
    .sort((a, b) => Number(!!a.remote) - Number(!!b.remote));
}

/** La voz preferida si existe para ese idioma; si no, la mejor disponible. */
export async function pickVoice(lang: string, preferred: string): Promise<string | undefined> {
  const list = await voicesFor(lang);
  if (preferred && list.some((v) => v.voiceName === preferred)) return preferred;
  return list[0]?.voiceName;
}
