/** Cómo se pintan los subtítulos. Lo comparten el overlay de YouTube y el del modo audio. */
export interface SubtitleStyle {
  showTranslated: boolean;
  showOriginal: boolean;
  /** true = la línea original va encima de la traducción. */
  originalFirst: boolean;
  /** Tamaño en % sobre el automático (que depende del alto del reproductor). */
  fontScale: number;
  position: 'bottom' | 'top';
  /** Distancia al borde (abajo o arriba), en % del alto. */
  offset: number;
  background: boolean;
  /** Opacidad del fondo, 0-100. */
  backgroundOpacity: number;
  translatedColor: string;
  originalColor: string;
}

export interface SubtitleLines {
  translated: string;
  original: string;
  /** La línea original es provisional (transcripción en curso). */
  interim?: boolean;
}

/**
 * Decide qué líneas se ven según los ajustes. Si aún no hay traducción y la
 * traducción es lo único visible, mostramos el original para no dejar el hueco vacío.
 */
export function composeLines(
  original: string,
  translated: string,
  style: Pick<SubtitleStyle, 'showOriginal' | 'showTranslated'>,
  interim = false,
): SubtitleLines {
  const tr = style.showTranslated ? translated : '';
  const fallbackToOriginal = style.showTranslated && !translated;
  const orig = style.showOriginal || fallbackToOriginal ? original : '';
  return { translated: tr, original: orig, interim };
}
