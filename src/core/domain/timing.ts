/**
 * Cuándo habla de verdad la persona en cada frase.
 *
 * Medido con un vídeo real (TED, subtítulos manuales + automáticos + audio):
 * - Los bloques manuales van pegados (hueco mediano 24 ms) y no marcan silencios:
 *   la persona solo habla el 28-100 % del bloque. Mala referencia de duración.
 * - Los automáticos dan el inicio de cada palabra: estimando la duración de la
 *   última, el fin del habla sale con ~150 ms de error mediano. Buena referencia.
 *
 * Por eso, si hay ambas pistas, se traduce el texto manual (mejor, con
 * puntuación) y se toman los tiempos de las palabras automáticas (alignToWords).
 * Con la opción de precisión, además se afinan con el audio real (refineWithVoice).
 */
import { speechEndOf, speechStartOf, type Cue } from './cue';

/** Una palabra de los subtítulos automáticos con el instante en que empieza (ms). */
export interface TimedWord {
  t: number;
  w: string;
}

/** Tramo de audio con voz (ms de vídeo). */
export interface VoiceInterval {
  start: number;
  end: number;
}

/**
 * Lo más rápido que habla una persona, en caracteres por segundo (inglés
 * rápido ronda 18-20). Por debajo de text/esto, la duración es imposible: algo
 * falló al estimarla y se corrige a este mínimo.
 */
const MAX_PLAUSIBLE_CPS = 22;

/** Fin del habla mínimo creíble para decir `text` empezando en `start`. */
export function plausibleSpeechEnd(start: number, text: string): number {
  return start + (text.length / MAX_PLAUSIBLE_CPS) * 1000;
}

/** Duración aproximada de una palabra hablada (ms). */
export function wordDurationMs(word: string): number {
  return Math.min(700, Math.max(200, 120 + 55 * word.length));
}

/** Cuánto puede desplazarse un corte entre frases para caer en una pausa real. */
const BOUNDARY_SEARCH_MS = 800;
/** Palabras más allá de esto de su frase se consideran de otra (p. ej. tras una pausa larga). */
const WORD_GUARD_MS = 1500;

/**
 * Ajusta inicio y fin del habla de cada frase (manual) a las palabras que la
 * persona dice de verdad (automáticos). Los cortes entre frases se mueven a la
 * pausa más larga cercana, así cada palabra cae en su frase aunque los dos
 * subtítulos no coincidan exactamente. Frases sin palabras (música, aplausos)
 * conservan sus tiempos.
 */
export function alignToWords(cues: Cue[], words: TimedWord[]): Cue[] {
  if (!cues.length || !words.length) return cues;
  const ws = [...words].sort((a, b) => a.t - b.t);

  // splits[k] = índice de la primera palabra de la frase k.
  const splits: number[] = [0];
  for (let k = 1; k < cues.length; k++) {
    const boundary = cues[k]!.start;
    const prev = splits[k - 1]!;
    let best = -1;
    let bestGap = -1;
    for (let i = Math.max(prev, 1); i < ws.length; i++) {
      const before = ws[i - 1]!.t;
      const after = ws[i]!.t;
      if (before > boundary + BOUNDARY_SEARCH_MS) break;
      if (after < boundary - BOUNDARY_SEARCH_MS) continue;
      const gap = after - before;
      // La pausa más larga; a igualdad, la más cercana al corte original.
      if (gap > bestGap || (gap === bestGap && Math.abs(after - boundary) < Math.abs(ws[best]!.t - boundary))) {
        best = i;
        bestGap = gap;
      }
    }
    if (best < 0) {
      // Sin palabras cerca: cortamos por tiempo.
      best = prev;
      while (best < ws.length && ws[best]!.t < boundary) best++;
    }
    splits.push(Math.max(prev, best));
  }
  splits.push(ws.length);

  return cues.map((cue, k) => {
    const own = ws
      .slice(splits[k], splits[k + 1])
      .filter((w) => w.t >= cue.start - WORD_GUARD_MS && w.t < cue.end + WORD_GUARD_MS);
    if (!own.length) return cue;
    const first = own[0]!;
    const last = own[own.length - 1]!;
    const nextStart = cues[k + 1]?.start ?? Infinity;
    const nextWord = ws[splits[k + 1]!]?.t ?? Infinity;
    return {
      ...cue,
      timing: 'words' as const,
      speechStart: first.t,
      // Fin: al acabar la última palabra; nunca menos de lo que se tarda en decir el texto.
      speechEnd: Math.min(
        Math.max(first.t + 200, last.t + wordDurationMs(last.w), plausibleSpeechEnd(first.t, cue.text)),
        Math.max(nextWord, cue.end),
      ),
      // El subtítulo sigue visible al menos hasta que acaba de hablar.
      end: Math.max(cue.end, Math.min(last.t + wordDurationMs(last.w), nextStart)),
    };
  });
}

/**
 * Cuánto puede moverse cada borde al encajarlo con el audio, según lo fiable
 * que sea la estimación de partida:
 * - 'words' (palabras de los automáticos, ~150 ms): ajuste fino.
 * - 'block' (bloque manual): los bloques incluyen silencios y a veces acaban
 *   antes de que la persona termine, así que se busca con margen amplio.
 * Con Silero VAD (ignora risas, aplausos y música; medido: 0 % de falsos
 * positivos con aplausos y música) se puede alargar el fin si la voz sigue.
 */
const SEARCH = {
  words: { startBefore: 250, startAfter: 300, endBefore: 500, endAfter: 400 },
  block: { startBefore: 500, startAfter: 1000, endBefore: 2500, endAfter: 1000 },
} as const;

/**
 * Afina inicio y fin del habla de una frase con los tramos de voz detectados
 * en el audio real (opción de precisión). Inicio: el arranque de voz más
 * cercano al estimado. Fin: el último final de voz dentro de la ventana; si la
 * voz sigue más allá de la ventana (frase pegada a la siguiente, o risas), el
 * fin no se toca. Si no hay datos de audio para esa zona, la frase queda igual.
 */
export function refineWithVoice(cue: Cue, intervals: VoiceInterval[], nextStart?: number): Cue {
  if (!intervals.length) return cue;
  const w = SEARCH[cue.timing ?? 'block'];
  const s0 = speechStartOf(cue);
  const e0 = speechEndOf(cue);

  // Si ya había voz sonando al empezar (frases pegadas), el inicio no se mueve.
  const ongoing = intervals.some((v) => v.start < s0 - w.startBefore && v.end > s0);
  const onsets = intervals.map((v) => v.start).filter((t) => t >= s0 - w.startBefore && t <= s0 + w.startAfter);
  const start = ongoing || !onsets.length ? s0 : closest(onsets, s0);

  const limit = Math.min(nextStart ?? Infinity, e0 + w.endAfter);
  const continuesPast = intervals.some((v) => v.start < limit && v.end > limit);
  const offsets = intervals.map((v) => v.end).filter((t) => t >= e0 - w.endBefore && t <= limit && t > start);
  const end = continuesPast || !offsets.length ? e0 : Math.max(...offsets);

  if (end - start < 200) return cue; // resultado raro: mejor no tocar
  return { ...cue, speechStart: start, speechEnd: end };
}

function closest(values: number[], target: number): number {
  return values.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
}
