/**
 * Puerto: dónde se pintan los subtítulos.
 * Adaptador: adapters/dom/subtitle-overlay.ts (Shadow DOM sobre el reproductor o la página)
 */
import type { SubtitleLines, SubtitleStyle } from '../domain/subtitles';

export interface StatusAction {
  label: string;
  onClick: () => void;
}

export interface SubtitleViewPort {
  show(lines: SubtitleLines): void;
  clear(): void;
  setStyle(style: SubtitleStyle): void;
  /** Aparta los subtítulos cuando los controles del reproductor están visibles. */
  setControlsVisible(visible: boolean): void;
  setStatus(message: string | null, action?: StatusAction): void;
  destroy(): void;
}
