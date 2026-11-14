/** Una frase de subtítulo con sus tiempos en milisegundos (tiempo de vídeo). */
export interface Cue {
  start: number;
  /** Hasta cuándo se muestra el subtítulo. */
  end: number;
  text: string;
  /**
   * Cuándo empieza a hablar de verdad la persona (≥ start). El subtítulo
   * puede aparecer un poco antes; la voz traducida debe arrancar aquí.
   */
  speechStart?: number;
  /**
   * Cuándo deja de hablar de verdad la persona (≤ end). Es el objetivo del
   * doblaje: la voz traducida debe acabar aquí. Si falta, se usa `end`.
   */
  speechEnd?: number;
  /**
   * De dónde salen speechStart/speechEnd: 'words' = palabras de los automáticos
   * (precisos, ~150 ms); 'block' = bloque del subtítulo manual (incluye silencios).
   */
  timing?: 'words' | 'block';
}

/** Inicio del habla de una frase (speechStart si se conoce; si no, start). */
export function speechStartOf(cue: Pick<Cue, 'start' | 'speechStart'>): number {
  return cue.speechStart ?? cue.start;
}

/** Final del habla de una frase (speechEnd si se conoce; si no, end). */
export function speechEndOf(cue: Pick<Cue, 'end' | 'speechEnd'>): number {
  return cue.speechEnd ?? cue.end;
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

/**
 * Huella corta del TEXTO de una pista: si YouTube cambia los subtítulos, cambia.
 * No incluye los tiempos, para que afinar la sincronía no invalide la caché de traducciones.
 */
export function cuesFingerprint(cues: Cue[]): string {
  let h = 5381;
  for (const c of cues) {
    const s = `${c.text}\n`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `${cues.length.toString(36)}-${(h >>> 0).toString(36)}`;
}
