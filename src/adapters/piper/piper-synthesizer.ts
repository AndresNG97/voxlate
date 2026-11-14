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
}

interface Play {
  req: SpeakRequest;
  resolve: (r: SpeakResult) => void;
  audio: HTMLAudioElement | null;
}

/** Audios generados que se guardan en memoria (unos 10-15 min de vídeo). */
const MAX_CLIPS = 250;

export class PiperSynthesizer implements SpeechSynthesizerPort {
  private session: Promise<TtsSession> | null = null;
  private voiceId = '';
  private readonly clips = new Map<string, Promise<Clip>>();
  /** Piper genera de uno en uno: encadenamos las peticiones. */
  private renderChain: Promise<unknown> = Promise.resolve();
  private queue: Play[] = [];
  private current: Play | null = null;
  private paused = false;

  constructor(
    private readonly assets: PiperAssets,
    private readonly onDownloadProgress?: (fraction: number) => void,
  ) {}

  async prepare(req: PrepareRequest): Promise<PreparedSpeech> {
    const clip = await this.getClip(req);
    return { id: req.id, durationMs: clip.durationMs };
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
      const blob = await session.predict(req.text);
      return { url: URL.createObjectURL(blob), durationMs: await wavDurationMs(blob) };
    });
    this.renderChain = job.catch(() => {});
    job.catch(() => this.clips.delete(req.id));
    this.clips.set(req.id, job);
    this.evictOld();
    return job;
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
