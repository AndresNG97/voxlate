import type { SubtitleStyle } from './subtitles';

export type Engine = 'chrome' | 'youtube';

/** Idioma de la interfaz de la extensión. auto = el de Chrome. */
export type UiLanguage = 'auto' | 'es' | 'en';

/**
 * Ajustes del usuario. Plano a propósito: se guardan tal cual y se mezclan
 * con DEFAULT_SETTINGS, así los campos nuevos reciben su valor por defecto.
 */
export interface Settings {
  /** Interruptor general de la extensión (cabecera del popup). */
  enabled: boolean;
  /**
   * Cada vídeo nuevo empieza desactivado y se activa con el botón del reproductor.
   * true = se traduce solo al abrirlo, salvo si ya está en el idioma destino.
   */
  autoTranslate: boolean;
  /** Idioma de los menús y avisos de la extensión (no el de la traducción). */
  uiLanguage: UiLanguage;
  /** Idioma del vídeo. */
  sourceLang: string;
  /** Idioma al que traducimos. */
  targetLang: string;
  /**
   * chrome  → traductor local de Chrome (on-device, gratis, privado).
   * youtube → traducción automática de los propios subtítulos de YouTube.
   */
  engine: Engine;

  // --- Subtítulos ---
  showTranslated: boolean;
  /** Muestra la línea original junto a la traducción (modo bilingüe). */
  showOriginal: boolean;
  originalFirst: boolean;
  /** Tamaño del texto en %. */
  fontScale: number;
  subtitlePosition: 'bottom' | 'top';
  /** Distancia al borde en %. */
  subtitleOffset: number;
  subtitleBackground: boolean;
  subtitleBgOpacity: number;
  translatedColor: string;
  originalColor: string;

  // --- Doblaje ---
  /** Lee la traducción en voz alta (gratis, local). */
  dub: boolean;
  /**
   * neural → Piper: voz neuronal en tu equipo, genera el audio por adelantado
   *          (mejor sincronización). Se descarga una vez (~60 MB por voz).
   * system → voces del sistema operativo vía chrome.tts (sin descargas).
   */
  dubEngine: 'neural' | 'system';
  /** Voz de Piper; '' = la recomendada para el idioma destino. */
  neuralVoice: string;
  /** Voz del sistema; '' = la mejor voz local del idioma destino. */
  dubVoice: string;
  /** Modo sincronización (ver dub-sync.ts). Desactivado = manual. */
  dubSync: boolean;
  /** Velocidad de la voz. Base en sincronización, fija en manual. */
  dubRate: number;
  /** Modo manual: velocidad del vídeo mientras se dobla (0,85 = 85%). */
  dubVideoRate: number;
  /** Volumen del audio original mientras se dobla, en %. */
  dubOriginalVolume: number;
  /**
   * Sincronía de precisión (solo YouTube): analiza el audio que YouTube ya ha
   * descargado para detectar al milisegundo cuándo habla la persona.
   */
  audioPrecision: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  autoTranslate: false,
  uiLanguage: 'auto',
  sourceLang: 'en',
  targetLang: 'es',
  engine: 'chrome',

  showTranslated: true,
  showOriginal: true,
  originalFirst: false,
  fontScale: 100,
  subtitlePosition: 'bottom',
  subtitleOffset: 9,
  subtitleBackground: true,
  subtitleBgOpacity: 75,
  translatedColor: '#ffffff',
  originalColor: '#d8d8d8',

  dub: true,
  dubEngine: 'neural',
  neuralVoice: '',
  dubVoice: '',
  dubSync: true,
  dubRate: 1,
  dubVideoRate: 0.85,
  dubOriginalVolume: 25,
  audioPrecision: false,
};

export function withDefaults(stored: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function subtitleStyleOf(s: Settings): SubtitleStyle {
  return {
    showTranslated: s.showTranslated,
    showOriginal: s.showOriginal,
    originalFirst: s.originalFirst,
    fontScale: s.fontScale,
    position: s.subtitlePosition,
    offset: s.subtitleOffset,
    background: s.subtitleBackground,
    backgroundOpacity: s.subtitleBgOpacity,
    translatedColor: s.translatedColor,
    originalColor: s.originalColor,
  };
}

/** Idiomas del vídeo que ofrece el popup (el nombre visible sale de languageName() en @/i18n). */
export const SOURCE_LANGUAGES: readonly string[] = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko'];

/** Idiomas destino (códigos BCP-47 que entiende el traductor de Chrome). */
export const TARGET_LANGUAGES: readonly string[] = ['es', 'en', 'fr', 'de', 'it', 'pt', 'ca', 'nl', 'pl', 'ru', 'uk', 'tr', 'ar', 'hi', 'ja', 'ko', 'zh', 'zh-Hant'];
