/**
 * Textos de la interfaz. Por defecto, en el idioma de Chrome (español si Chrome
 * está en español, inglés en cualquier otro caso); el usuario puede elegir otro
 * en la pestaña Ajustes (setting uiLanguage). Lo usan el popup, los avisos sobre
 * el vídeo y los mensajes de error de los motores.
 *
 * `t` y `uiLocale` son "live bindings": tras setUiLanguage() quien los importa ve
 * ya los textos nuevos (no hay que copiarlos en constantes al cargar el módulo).
 *
 * Para añadir un idioma: copia en.ts, tradúcelo y añádelo a CATALOG y a
 * UiLanguage (core/domain/settings.ts).
 */
import { en } from './en';
import { es, type Messages } from './es';

export type { Messages };

const CATALOG: Record<string, Messages> = { es, en };

/** Idiomas de la interfaz, con su nombre en ese mismo idioma (para el selector). */
export const UI_LANGUAGES: [code: 'es' | 'en', name: string][] = [
  ['es', 'Español'],
  ['en', 'English'],
];

/** Idioma de la interfaz de Chrome (funciona en el popup, offscreen y content scripts). */
function chromeLanguage(): string {
  const g = globalThis as { chrome?: { i18n?: { getUILanguage?: () => string } }; navigator?: { language?: string } };
  let lang = 'en';
  try {
    lang = g.chrome?.i18n?.getUILanguage?.() ?? g.navigator?.language ?? 'en';
  } catch {
    lang = g.navigator?.language ?? 'en';
  }
  return lang.toLowerCase().split(/[-_]/)[0]!;
}

const CHROME_LANGUAGE = chromeLanguage();

/** Nombre del idioma de Chrome en el idioma actual (para "Automático (como Chrome: …)"). */
export function chromeLanguageName(): string {
  return languageName(CATALOG[CHROME_LANGUAGE] ? CHROME_LANGUAGE : 'en');
}

/** Textos del idioma actual. */
export let t: Messages = CATALOG[CHROME_LANGUAGE] ?? en;
/** Código del idioma actual ("es", "en"). */
export let uiLocale: string = t.locale;

let languageNames: Intl.DisplayNames | null = null;
let regionNames: Intl.DisplayNames | null = null;

function displayNames(type: 'language' | 'region'): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([uiLocale], { type });
  } catch {
    return null;
  }
}

/** Cambia el idioma de la interfaz. 'auto' (o uno desconocido) = el de Chrome. */
export function setUiLanguage(pref: string | undefined): void {
  const next = (pref && pref !== 'auto' && CATALOG[pref]) || CATALOG[CHROME_LANGUAGE] || en;
  if (next === t && languageNames) return;
  t = next;
  uiLocale = next.locale;
  languageNames = displayNames('language');
  regionNames = displayNames('region');
}
setUiLanguage('auto');

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase(uiLocale) + s.slice(1);

/** Nombre de un idioma en el idioma de la interfaz: "en" → "Inglés" / "English". */
export function languageName(code: string): string {
  // "zh" a secas es el chino simplificado (así lo trata el traductor de Chrome).
  const name = languageNames?.of(code === 'zh' ? 'zh-Hans' : code);
  return name ? capitalize(name) : code;
}

/** Nombre de un país o región: "MX" → "México" / "Mexico". */
export function regionName(code: string): string {
  return regionNames?.of(code) ?? code;
}
