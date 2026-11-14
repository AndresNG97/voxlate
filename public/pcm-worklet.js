/**
 * AudioWorklet: convierte el audio de la pestaña (normalmente 48 kHz estéreo
 * Float32) a PCM16 mono a 16 kHz, que es lo que esperan los STT en streaming.
 * Envía bloques de ~100 ms al hilo principal (offscreen document).
 *
 * Va en /public como JS plano porque audioWorklet.addModule() necesita una URL.
 */
const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 1600; // 100 ms a 16 kHz

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.acc = 0; // acumulador de muestras de entrada para el diezmado
    this.sum = 0;
    this.count = 0;
    this.out = new Int16Array(CHUNK_SAMPLES);
    this.outPos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channels = input.length;
    const frames = input[0].length;

    for (let i = 0; i < frames; i++) {
      // Mezcla a mono.
      let s = 0;
      for (let c = 0; c < channels; c++) s += input[c][i];
      s /= channels;

      // Diezmado con promedio (filtro paso bajo barato, evita aliasing grosero).
      this.sum += s;
      this.count++;
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0;
        this.count = 0;
        this.out[this.outPos++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.outPos === CHUNK_SAMPLES) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(CHUNK_SAMPLES);
          this.outPos = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
