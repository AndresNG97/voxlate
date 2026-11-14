/**
 * Adaptador de SpeechSynthesizerPort para content scripts que usa la voz
 * neuronal (Piper) del offscreen document. Antes de cada petición se asegura
 * de que el offscreen existe (Chrome puede cerrarlo si lleva rato sin sonar).
 */
import type {
  PrepareRequest,
  PreparedSpeech,
  SpeakRequest,
  SpeakResult,
  SpeechSynthesizerPort,
} from '@/core/ports/speech-synthesizer';
import { t } from '@/i18n';
import { sendRuntime, type RuntimeMessage } from './messages';

export class RuntimeNeuralSynthesizer implements SpeechSynthesizerPort {
  /**
   * @param onLoading avisa mientras se carga la voz la primera vez (descarga +
   *   arranque del modelo), para enseñarlo en pantalla.
   */
  constructor(private readonly onLoading?: (loading: boolean) => void) {}

  private loaded = false;

  async prepare(req: PrepareRequest): Promise<PreparedSpeech> {
    const res = await this.call<PreparedSpeech | { error: string }>({ type: 'neural:prepare', target: 'offscreen', req });
    if ('error' in res) throw new Error(res.error);
    return res;
  }

  speak(req: SpeakRequest): Promise<SpeakResult> {
    return this.call<SpeakResult>({ type: 'neural:speak', target: 'offscreen', req });
  }

  stop() {
    sendRuntime({ type: 'neural:stop', target: 'offscreen' });
  }

  setRate(rate: number) {
    sendRuntime({ type: 'neural:set-rate', target: 'offscreen', rate });
  }

  pause() {
    sendRuntime({ type: 'neural:pause', target: 'offscreen' });
  }

  resume() {
    sendRuntime({ type: 'neural:resume', target: 'offscreen' });
  }

  private async ensure() {
    const ready = await browser.runtime.sendMessage({ type: 'neural:ensure' } satisfies RuntimeMessage);
    if (ready !== true) throw new Error(t.errors.neuralStart);
  }

  /** Envía al offscreen; si no contesta (no existía), lo crea y reintenta una vez. */
  private async call<T>(msg: RuntimeMessage): Promise<T> {
    const firstTime = !this.loaded;
    if (firstTime) this.onLoading?.(true);
    try {
      await this.ensure();
      let res = (await browser.runtime.sendMessage(msg).catch(() => undefined)) as T | undefined;
      if (res === undefined) {
        // Chrome pudo cerrar el offscreen entre medias: lo recreamos y reintentamos una vez.
        await this.ensure();
        res = (await browser.runtime.sendMessage(msg).catch(() => undefined)) as T | undefined;
      }
      if (res === undefined) throw new Error(t.errors.neuralNoResponse);
      this.loaded = true;
      return res;
    } finally {
      if (firstTime) this.onLoading?.(false);
    }
  }
}
