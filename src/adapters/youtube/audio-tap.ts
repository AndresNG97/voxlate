/**
 * Captura el audio que el reproductor de YouTube ya ha descargado y detecta
 * cuándo habla la persona (opción "Sincronía de precisión").
 *
 * Corre en el MAIN world (lo instala el agente en document_start, antes de que
 * el reproductor cree su MediaSource). YouTube mete el audio en un SourceBuffer
 * como Opus en WebM, con 1-2 minutos de antelación: interceptamos appendBuffer,
 * sacamos los paquetes con WebmOpusDemuxer, los decodificamos con WebCodecs y
 * se los pasamos al VoiceActivityDetector. Si la opción está desactivada, el
 * gancho no hace nada más que pasar los datos al reproductor.
 */
import type { VoiceInterval } from '@/core/domain/timing';
import { VoiceActivityDetector } from '@/core/domain/voice-activity';
import { WebmOpusDemuxer } from './webm-opus-demuxer';

interface Pipe {
  demuxer: WebmOpusDemuxer;
  decoder: AudioDecoder;
}

export class YoutubeAudioTap {
  private enabled = false;
  private readonly mimes = new WeakMap<SourceBuffer, string>();
  private readonly pipes = new WeakMap<SourceBuffer, Pipe>();
  private vad: VoiceActivityDetector | null = null;
  private failed = false;

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
  }

  /** false si el navegador no puede (sin WebCodecs/Opus). */
  get available(): boolean {
    return typeof AudioDecoder !== 'undefined' && !this.failed;
  }

  /** Tramos con voz detectados entre `fromMs` y `toMs`. */
  intervals(fromMs: number, toMs: number): VoiceInterval[] {
    return this.vad?.intervals(fromMs, toMs) ?? [];
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
      this.vad ??= new VoiceActivityDetector(audio.sampleRate);
      const samples = new Float32Array(audio.numberOfFrames);
      audio.copyTo(samples, { planeIndex: 0, format: 'f32-planar' }); // canal izquierdo basta para detectar voz
      this.vad.push(samples, audio.timestamp / 1000);
    } finally {
      audio.close();
    }
  }
}
