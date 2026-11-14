/** Una frase de subtítulo con sus tiempos en milisegundos (tiempo de vídeo). */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Índice de la frase activa en `ms` (búsqueda binaria), o -1. */
export function findCueIndex(cues: Cue[], ms: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid]!;
    if (ms < c.start) hi = mid - 1;
    else if (ms >= c.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Primera frase que termina después de `ms` (para priorizar la traducción). */
export function firstCueAfter(cues: Cue[], ms: number): number {
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid]!.end <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
