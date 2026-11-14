/**
 * Adaptador de AudioSourcePort: audio de una pestaña capturado con tabCapture
 * (en el offscreen document) y convertido a PCM16 mono 16 kHz con un AudioWorklet.
 */
import type { AudioSourcePort } from '@/core/ports/audio-source';

export class TabAudioCapture implements AudioSourcePort {
  private audioCtx: AudioContext | null = null;
  private media: MediaStream | null = null;

  constructor(private readonly streamId: string) {}

  async start(onChunk: (chunk: ArrayBuffer) => void): Promise<void> {
    this.media = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-expect-error constraints propias de Chrome para tabCapture
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: this.streamId },
      },
      video: false,
    });

    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaStreamSource(this.media);
    // ¡Importante! Al capturar la pestaña Chrome la silencia; la volvemos a
    // mandar a los altavoces para que el usuario siga oyendo el vídeo.
    source.connect(this.audioCtx.destination);

    await this.audioCtx.audioWorklet.addModule(browser.runtime.getURL('/pcm-worklet.js'));
    const pcm = new AudioWorkletNode(this.audioCtx, 'pcm-processor');
    source.connect(pcm);
    pcm.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onChunk(e.data);
  }

  async stop(): Promise<void> {
    this.media?.getTracks().forEach((t) => t.stop());
    this.media = null;
    await this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
  }
}
