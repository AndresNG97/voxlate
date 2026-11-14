/**
 * Captura el audio que el reproductor de YouTube ya ha descargado (opción
 * "Sincronía de precisión") y lo entrega como PCM mono a 16 kHz, listo para un
 * detector de voz (Silero VAD).
 *
 * Corre en el MAIN world (lo instala el agente en document_start, antes de que
 * el reproductor cree su MediaSource). YouTube mete el audio en un SourceBuffer
 * como Opus en WebM, con 1-2 minutos de antelación: interceptamos appendBuffer,
 * sacamos los paquetes con WebmOpusDemuxer y los decodificamos con WebCodecs.
 * Si la opción está desactivada, el gancho solo pasa los datos al reproductor.
 */
import { WebmOpusDemuxer } from './webm-opus-demuxer';

interface Pipe {
  demuxer: WebmOpusDemuxer;
  decoder: AudioDecoder;
}

/** Frecuencia que necesita el detector de voz. */
const TAP_SAMPLE_RATE = 16_000;
/** Se entrega audio en lotes de este tamaño (o antes si hay un salto). */
const BATCH_MS = 2000;

export type PcmListener = (startMs: number, samples: Float32Array) => void;

export class YoutubeAudioTap {
  private enabled = false;
  private failed = false;
  private readonly mimes = new WeakMap<SourceBuffer, string>();
  private readonly pipes = new WeakMap<SourceBuffer, Pipe>();
  /** Lote en construcción: audio contiguo a 16 kHz. */
  private batch: { startMs: number; chunks: Float32Array[]; length: number } | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly onPcm: PcmListener) {}

  /** Engancha MediaSource/SourceBuffer. Hay que llamarlo antes de que el reproductor arranque. */
  install() {
    if (typeof MediaSource === 'undefined' || typeof AudioDecoder === 'undefined') return;
    const tap = this;

    const addSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function (this: MediaSource, mime: string) {
      const sb = addSourceBuffer.call(this, mime);
      tap.mimes.set(sb, mime);
      return sb;
    };

    const appendBuffer = SourceBuffer.prototype.appendBuffer;
    SourceBuffer.prototype.appendBuffer = function (this: SourceBuffer, data: BufferSource) {
      if (tap.enabled) {
        try {
          tap.onAppend(this, data);
        } catch (e) {
          console.warn('[voxlate] audio-tap', e);
        }
      }
      return appendBuffer.call(this, data);
    };

    // Tras un salto, YouTube aborta el buffer y empieza otra tanda: reiniciamos el demuxer.
    const abort = SourceBuffer.prototype.abort;
    SourceBuffer.prototype.abort = function (this: SourceBuffer) {
      tap.pipes.get(this)?.demuxer.reset();
      return abort.call(this);
    };
  }

  setEnabled(on: boolean) {
    this.enabled = on && !this.failed;
    if (!this.enabled) this.batch = null;
  }

  /** false si el navegador no puede (sin WebCodecs/Opus). */
  get available(): boolean {
    return typeof AudioDecoder !== 'undefined' && !this.failed;
  }

  private onAppend(sb: SourceBuffer, data: BufferSource) {
    const mime = this.mimes.get(sb) ?? '';
    if (!/^audio\/webm/i.test(mime) || !/opus/i.test(mime)) return; // solo Opus en WebM (lo habitual en Chrome)
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data.slice(0))
        : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

    const pipe = this.pipeFor(sb);
    if (!pipe) return;
    for (const frame of pipe.demuxer.push(bytes)) {
      pipe.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: frame.timestampMs * 1000, data: frame.data }));
    }
  }

  private pipeFor(sb: SourceBuffer): Pipe | null {
    const existing = this.pipes.get(sb);
    if (existing && existing.decoder.state !== 'closed') return existing;
    try {
      const decoder = new AudioDecoder({
        output: (audio) => this.onAudio(audio),
        error: (e) => console.warn('[voxlate] audio-tap decoder', e),
      });
      decoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
      const pipe = { demuxer: existing?.demuxer ?? new WebmOpusDemuxer(), decoder };
      this.pipes.set(sb, pipe);
      return pipe;
    } catch (e) {
      console.warn('[voxlate] audio-tap: no se puede decodificar Opus', e);
      this.failed = true;
      this.enabled = false;
      return null;
    }
  }

  private onAudio(audio: AudioData) {
    try {
      const raw = new Float32Array(audio.numberOfFrames);
      audio.copyTo(raw, { planeIndex: 0, format: 'f32-planar' }); // canal izquierdo basta para detectar voz
      this.append(audio.timestamp / 1000, downsample(raw, audio.sampleRate, TAP_SAMPLE_RATE));
    } finally {
      audio.close();
    }
  }

  /** Acumula audio contiguo; entrega el lote al llenarse, al saltar o tras un rato sin más. */
  private append(startMs: number, samples: Float32Array) {
    const b = this.batch;
    const batchEndMs = b ? b.startMs + (b.length / TAP_SAMPLE_RATE) * 1000 : NaN;
    if (b && Math.abs(startMs - batchEndMs) > 5) this.flush(); // salto: el lote acaba aquí
    this.batch ??= { startMs, chunks: [], length: 0 };
    this.batch.chunks.push(samples);
    this.batch.length += samples.length;
    if ((this.batch.length / TAP_SAMPLE_RATE) * 1000 >= BATCH_MS) this.flush();
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 500);
  }

  private flush() {
    const b = this.batch;
    this.batch = null;
    if (!b?.length) return;
    const out = new Float32Array(b.length);
    let o = 0;
    for (const c of b.chunks) {
      out.set(c, o);
      o += c.length;
    }
    this.onPcm(b.startMs, out);
  }
}

/** Baja la frecuencia promediando grupos de muestras (sirve para voz; 48 kHz → 16 kHz es exacto). */
function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const z = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let k = a; k < z; k++) sum += input[k]!;
    out[i] = sum / Math.max(1, z - a);
  }
  return out;
}
