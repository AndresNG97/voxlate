import type { SubtitleStyle } from './subtitles';

export type Engine = 'chrome' | 'youtube';

/**
 * Ajustes del usuario. Plano a propósito: se guardan tal cual y se mezclan
 * con DEFAULT_SETTINGS, así los campos nuevos reciben su valor por defecto.
 */
export interface Settings {
  enabled: boolean;
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
  /** Lee la traducción en voz alta con una voz del sistema (gratis, local). */
  dub: boolean;
  /** Nombre de la voz; '' = la mejor voz local del idioma destino. */
  dubVoice: string;
  /** Modo sincronización (ver dub-sync.ts). Desactivado = manual. */
  dubSync: boolean;
  /** Velocidad de la voz. Base en sincronización, fija en manual. */
  dubRate: number;
  /** Modo manual: velocidad del vídeo mientras se dobla (0,85 = 85%). */
  dubVideoRate: number;
  /** Volumen del audio original mientras se dobla, en %. */
  dubOriginalVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
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

  dub: false,
  dubVoice: '',
  dubSync: true,
  dubRate: 1,
  dubVideoRate: 0.85,
  dubOriginalVolume: 25,
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

/** Idiomas del vídeo que ofrece el popup. */
export const SOURCE_LANGUAGES: [code: string, label: string][] = [
  ['en', 'Inglés'],
  ['es', 'Español'],
  ['fr', 'Francés'],
  ['de', 'Alemán'],
  ['pt', 'Portugués'],
  ['it', 'Italiano'],
  ['ja', 'Japonés'],
  ['ko', 'Coreano'],
];

/** Idiomas destino (códigos BCP-47 que entiende el traductor de Chrome). */
export const TARGET_LANGUAGES: [code: string, label: string][] = [
  ['es', 'Español'],
  ['en', 'Inglés'],
  ['fr', 'Francés'],
  ['de', 'Alemán'],
  ['it', 'Italiano'],
  ['pt', 'Portugués'],
  ['ca', 'Catalán'],
  ['nl', 'Neerlandés'],
  ['pl', 'Polaco'],
  ['ru', 'Ruso'],
  ['uk', 'Ucraniano'],
  ['tr', 'Turco'],
  ['ar', 'Árabe'],
  ['hi', 'Hindi'],
  ['ja', 'Japonés'],
  ['ko', 'Coreano'],
  ['zh', 'Chino (simplificado)'],
  ['zh-Hant', 'Chino (tradicional)'],
];
