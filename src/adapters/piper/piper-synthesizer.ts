/**
 * Adaptador de SpeechSynthesizerPort con Piper (voz neuronal local, ONNX en WASM).
 * Corre en el offscreen document: genera el audio de cada frase por adelantado
 * (prepare), lo guarda y lo reproduce cuando toca (speak) con la velocidad
 * pedida sin cambiar el tono (preservesPitch).
 */
import { TtsSession } from '@mintplex-labs/piper-tts-web';
import type {
  PrepareRequest,
  PreparedSpeech,
  SpeakRequest,
  SpeakResult,
  SpeechSynthesizerPort,
} from '@/core/ports/speech-synthesizer';
import { SYNC_LIMITS } from '@/core/domain/dub-sync';
import { pickNeuralVoice } from './piper-voices';

/** Rutas (dentro de la extensión) del motor ONNX y del fonetizador de Piper. */
export interface PiperAssets {
  /** Carpeta con ort-wasm-simd-threaded.{mjs,wasm}, terminada en '/'. */
  onnxWasm: string;
  piperWasm: string;
  piperData: string;
}

interface Clip {
  url: string;
  durationMs: number;
  naturalMs: number;
}

interface Play {
  req: SpeakRequest;
  resolve: (r: SpeakResult) => void;
  audio: HTMLAudioElement | null;
}

/** Audios generados que se guardan en memoria (unos 10-15 min de vídeo). */
const MAX_CLIPS = 250;
/**
 * Ritmo de generación de Piper (length_scale). Suena mucho más natural que
 * estirar el audio ya generado. Medido con es_ES-davefx: la duración responde
 * a ~60 % del cambio (factor 1,3 → ×1,20; 1,5 → ×1,31; 1,8 → ×1,50), así que
 * pedimos el factor que da la duración deseada con esa elasticidad.
 */
const LENGTH_ELASTICITY = 0.6;
const MIN_LENGTH_FACTOR = 0.75; // ≈ ×0,85 de duración
const MAX_LENGTH_FACTOR = 1.7; // ≈ ×1,42 de duración
/** Caracteres por segundo de una voz de Piper a su ritmo natural, hasta que lo medimos. */
const DEFAULT_NATURAL_CPS = 18;

export class PiperSynthesizer implements SpeechSynthesizerPort {
  private session: Promise<TtsSession> | null = null;
  private voiceId = '';
  private readonly clips = new Map<string, Promise<Clip>>();
  /** Piper genera de uno en uno: encadenamos las peticiones. */
  private renderChain: Promise<unknown> = Promise.resolve();
  private queue: Play[] = [];
  private current: Play | null = null;
  private paused = false;
  /** Caracteres por segundo de cada voz a su ritmo natural (aprendido al generar). */
  private readonly naturalCps = new Map<string, number>();

  constructor(
    private readonly assets: PiperAssets,
    private readonly onDownloadProgress?: (fraction: number) => void,
  ) {}

  async prepare(req: PrepareRequest): Promise<PreparedSpeech> {
    const clip = await this.getClip(req);
    return { id: req.id, durationMs: clip.durationMs, naturalMs: clip.naturalMs };
  }

  speak(req: SpeakRequest): Promise<SpeakResult> {
    return new Promise((resolve) => {
      if (!req.enqueue) this.stop();
      this.queue.push({ req, resolve, audio: null });
      if (!this.current) void this.playNext();
    });
  }

  stop() {
    for (const p of this.queue) p.resolve({ ok: false, event: 'cancelled' });
    this.queue = [];
    const cur = this.current;
    this.current = null;
    if (cur) {
      cur.audio?.pause();
      cur.resolve({ ok: false, event: 'interrupted' });
    }
  }

  setRate(rate: number) {
    const audio = this.current?.audio;
    if (audio && Number.isFinite(rate) && rate > 0) audio.playbackRate = rate;
  }

  pause() {
    this.paused = true;
    this.current?.audio?.pause();
  }

  resume() {
    this.paused = false;
    const audio = this.current?.audio;
    if (audio?.paused) void audio.play().catch(() => {});
    else if (!this.current) void this.playNext();
  }

  // ------------------------------------------------------------ reproducción

  private async playNext() {
    if (this.paused) return; // resume() la arrancará
    const play = this.queue.shift();
    this.current = play ?? null;
    if (!play) return;
    const { req } = play;
    let clip: Clip;
    try {
      clip = await this.getClip({ id: req.id ?? `${req.voiceName}|${req.text}`, ...req });
    } catch (e) {
      play.resolve(errorResult(e));
      if (this.current === play) {
        this.current = null;
        void this.playNext();
      }
      return;
    }
    if (this.current !== play) return; // la cortaron mientras se generaba

    const audio = new Audio(clip.url);
    audio.preservesPitch = true;
    audio.playbackRate = req.rate;
    play.audio = audio;
    const done = (r: SpeakResult) => {
      if (this.current !== play) return;
      this.current = null;
      play.resolve(r);
      void this.playNext();
    };
    audio.onended = () => done({ ok: true, event: 'end' });
    audio.onerror = () => done({ ok: false, event: 'error', error: 'No se pudo reproducir el audio' });
    if (!this.paused) await audio.play().catch((e: unknown) => done(errorResult(e)));
  }

  // --------------------------------------------------------------- generación

  private getClip(req: PrepareRequest): Promise<Clip> {
    const hit = this.clips.get(req.id);
    if (hit) {
      // Lo movemos al final (más reciente).
      this.clips.delete(req.id);
      this.clips.set(req.id, hit);
      return hit;
    }
    const voice = pickNeuralVoice(req.lang, req.voiceName);
    if (!voice) return Promise.reject(new NoVoiceError(req.lang));

    const job = this.renderChain.then(async () => {
      const session = await this.sessionFor(voice);
      // Ritmo de generación: el que acerca la frase a la duración deseada.
      const cps = this.naturalCps.get(voice) ?? DEFAULT_NATURAL_CPS;
      const naturalMs = (req.text.length / cps) * 1000;
      // Nunca más lenta de lo que permite el mínimo de 0,9× (sonaría arrastrada):
      // si sobra hueco, ya se acelera el vídeo.
      const wantedRatio = Math.min(req.targetMs ? req.targetMs / naturalMs : 1, 1 / SYNC_LIMITS.minVoice);
      const factor = Math.min(
        MAX_LENGTH_FACTOR,
        Math.max(MIN_LENGTH_FACTOR, 1 + (wantedRatio - 1) / LENGTH_ELASTICITY),
      );
      const blob = await session.predict(req.text, { lengthScaleFactor: factor });
      const durationMs = await wavDurationMs(blob);
      // Ritmo natural de ESTA frase: deshacemos el efecto (aproximado) del factor.
      const clipNaturalMs = durationMs / (1 + LENGTH_ELASTICITY * (factor - 1));
      this.learnPace(voice, req.text.length, clipNaturalMs);
      return { url: URL.createObjectURL(blob), durationMs, naturalMs: clipNaturalMs };
    });
    this.renderChain = job.catch(() => {});
    job.catch(() => this.clips.delete(req.id));
    this.clips.set(req.id, job);
    this.evictOld();
    return job;
  }

  /** Media móvil de lo rápido que habla cada voz a su ritmo natural. */
  private learnPace(voice: string, chars: number, naturalMs: number) {
    if (chars < 12 || naturalMs < 400) return; // frases muy cortas: medida poco fiable
    const measured = chars / (naturalMs / 1000);
    const prev = this.naturalCps.get(voice) ?? DEFAULT_NATURAL_CPS;
    this.naturalCps.set(voice, Math.min(35, Math.max(8, prev * 0.5 + measured * 0.5)));
  }

  private evictOld() {
    while (this.clips.size > MAX_CLIPS) {
      const [oldestId, oldest] = this.clips.entries().next().value!;
      this.clips.delete(oldestId);
      void oldest.then((c) => URL.revokeObjectURL(c.url), () => {});
    }
  }

  /** La librería es un singleton: para cambiar de voz hay que crear la sesión de cero. */
  private sessionFor(voice: string): Promise<TtsSession> {
    if (voice !== this.voiceId || !this.session) {
      this.voiceId = voice;
      TtsSession._instance = null;
      this.session = TtsSession.create({
        voiceId: voice,
        wasmPaths: this.assets,
        progress: (p) => {
          if (p.total && !p.url.startsWith('tts://')) this.onDownloadProgress?.(p.loaded / p.total);
        },
      });
      this.session.catch(() => {
        this.session = null;
        this.voiceId = '';
      });
    }
    return this.session;
  }
}

export class NoVoiceError extends Error {
  constructor(lang: string) {
    super(`No hay voz neuronal para "${lang}"`);
  }
}

function errorResult(e: unknown): SpeakResult {
  if (e instanceof NoVoiceError) return { ok: false, event: 'no-voice', error: e.message };
  return { ok: false, event: 'error', error: e instanceof Error ? e.message : String(e) };
}

/** Duración de un WAV PCM leyendo su cabecera (sin decodificar el audio). */
async function wavDurationMs(blob: Blob): Promise<number> {
  const view = new DataView(await blob.slice(0, Math.min(blob.size, 4096)).arrayBuffer());
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  // Buscamos el bloque "data" (normalmente en el byte 36).
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') return (size / (sampleRate * channels * (bitsPerSample / 8))) * 1000;
    offset += 8 + size;
  }
  // Sin cabecera estándar: estimamos con el tamaño total.
  return ((blob.size - 44) / (sampleRate * channels * (bitsPerSample / 8))) * 1000;
}
