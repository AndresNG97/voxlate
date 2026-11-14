/**
 * Adaptador de VoiceDetectorPort con Silero VAD v5 (ONNX, ~2,3 MB, licencia MIT).
 * Corre donde haya onnxruntime-web: el offscreen document (lo comparte con Piper).
 *
 * Formato del modelo (igual que utils_vad.py de silero-vad):
 * - audio a 16 kHz en trozos de 512 muestras (32 ms),
 * - cada trozo va precedido de las últimas 64 muestras del anterior (contexto),
 * - un estado interno [2, 1, 128] que se arrastra de un trozo al siguiente,
 * - salida: probabilidad de voz del trozo.
 */
import type { VoiceDetectorPort, VoiceProbabilities } from '@/core/ports/voice-detector';

type Ort = typeof import('onnxruntime-web/wasm');
type Session = import('onnxruntime-web').InferenceSession;
type Tensor = import('onnxruntime-web').Tensor;

const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 512;
const CONTEXT_SAMPLES = 64;
const STATE_SIZE = 2 * 1 * 128;

export interface SileroAssets {
  /** URL del modelo silero_vad_v5.onnx. */
  modelUrl: string;
  /** Carpeta con ort-wasm-simd-threaded.{mjs,wasm}, terminada en '/'. */
  onnxWasm: string;
}

export class SileroVad implements VoiceDetectorPort {
  readonly sampleRate = SAMPLE_RATE;
  readonly frameMs = (FRAME_SAMPLES / SAMPLE_RATE) * 1000;

  private ready: Promise<{ ort: Ort; session: Session; sr: Tensor }> | null = null;
  private state = new Float32Array(STATE_SIZE);
  private context = new Float32Array(CONTEXT_SAMPLES);
  /** Muestras sobrantes que no llenaban un trozo, y dónde acaba lo recibido. */
  private pending = new Float32Array(0);
  private pendingStartMs = 0;
  private expectedMs = -1;
  /** Una llamada cada vez: el estado depende del orden. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly assets: SileroAssets) {}

  analyze(samples: Float32Array, startMs: number): Promise<VoiceProbabilities> {
    const job = this.chain.then(() => this.run(samples, startMs));
    this.chain = job.catch(() => {});
    return job;
  }

  private async run(samples: Float32Array, startMs: number): Promise<VoiceProbabilities> {
    const { ort, session, sr } = await this.load();
    // ¿Sigue al audio anterior? Si no (salto), reiniciamos el estado del modelo.
    if (Math.abs(startMs - this.expectedMs) > 5) {
      this.state = new Float32Array(STATE_SIZE);
      this.context = new Float32Array(CONTEXT_SAMPLES);
      this.pending = new Float32Array(0);
      this.pendingStartMs = startMs;
    }
    this.expectedMs = startMs + (samples.length / SAMPLE_RATE) * 1000;

    const all = new Float32Array(this.pending.length + samples.length);
    all.set(this.pending);
    all.set(samples, this.pending.length);
    const frames = Math.floor(all.length / FRAME_SAMPLES);
    const probs: number[] = [];
    // La primera probabilidad corresponde al inicio de lo pendiente.
    const firstMs = this.pendingStartMs;

    for (let f = 0; f < frames; f++) {
      const frame = all.subarray(f * FRAME_SAMPLES, (f + 1) * FRAME_SAMPLES);
      const input = new Float32Array(CONTEXT_SAMPLES + FRAME_SAMPLES);
      input.set(this.context);
      input.set(frame, CONTEXT_SAMPLES);
      this.context = frame.slice(-CONTEXT_SAMPLES);
      const out = await session.run({
        input: new ort.Tensor('float32', input, [1, input.length]),
        state: new ort.Tensor('float32', this.state, [2, 1, 128]),
        sr,
      });
      this.state = new Float32Array(out.stateN!.data as Float32Array);
      probs.push((out.output!.data as Float32Array)[0] ?? 0);
    }

    this.pending = all.slice(frames * FRAME_SAMPLES);
    this.pendingStartMs = firstMs + frames * this.frameMs;
    return { startMs: firstMs, probabilities: probs };
  }

  private load() {
    this.ready ??= (async () => {
      const ort = (await import('onnxruntime-web/wasm')) as unknown as Ort;
      const env = (ort as unknown as { env: { wasm: { wasmPaths?: string; numThreads?: number } } }).env;
      env.wasm.wasmPaths = this.assets.onnxWasm;
      env.wasm.numThreads = 1;
      const model = await (await fetch(this.assets.modelUrl)).arrayBuffer();
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
      const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE)]), []);
      return { ort, session, sr };
    })();
    this.ready.catch(() => {
      this.ready = null;
    });
    return this.ready;
  }
}
