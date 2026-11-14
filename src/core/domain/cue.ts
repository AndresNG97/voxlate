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

/**
 * Orden en el que traducir una pista entera: primero desde `from` hasta el
 * final (lo que se va a ver) y después lo anterior (por si vuelve atrás).
 */
export function translationOrder(total: number, from: number): number[] {
  const start = Math.min(Math.max(0, from), total);
  const order: number[] = [];
  for (let i = start; i < total; i++) order.push(i);
  for (let i = 0; i < start; i++) order.push(i);
  return order;
}

/** Huella corta del contenido de una pista: si YouTube cambia los subtítulos, cambia. */
export function cuesFingerprint(cues: Cue[]): string {
  let h = 5381;
  for (const c of cues) {
    const s = `${c.start}|${c.text}\n`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `${cues.length.toString(36)}-${(h >>> 0).toString(36)}`;
}
