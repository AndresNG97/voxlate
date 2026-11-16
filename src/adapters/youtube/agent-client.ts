/**
 * Lado "content script aislado" del canal con el agente de YouTube (MAIN world).
 * - Expone el traductor de Chrome de la página como TranslatorPort.
 * - Avisa cuando llega una pista de subtítulos (ya parseada a frases).
 */
import type { Cue } from '@/core/domain/cue';
import type { TimedWord } from '@/core/domain/timing';
import type { TranslatorAvailability, TranslatorPort } from '@/core/ports/translator';
import { AGENT, CONTENT, isAgentMessage, type AgentMessage, type AgentRpc, type RpcMethod } from './bridge';
import { parseAsrWords, parseTimedText } from './timedtext';

export interface YoutubeCaptions {
  /** Identificador estable de la pista: vídeo + idioma + manual/automática. */
  id: string;
  videoId: string;
  /** Idioma base de la pista (p. ej. 'en'). */
  lang: string;
  /** true = subtítulos automáticos (reconocimiento de voz de YouTube). */
  auto: boolean;
  cues: Cue[];
  /** Solo automáticos: cada palabra con el instante en que se dice (para sincronizar). */
  words?: TimedWord[];
  /** Repide la pista traducida por YouTube (&tlang=). */
  fetchTranslated: (targetLang: string) => Promise<Cue[]>;
}

interface Handlers {
  captions?: (c: YoutubeCaptions) => void;
  noCaptions?: (videoId: string) => void;
  /** Audio ya descargado por YouTube, mono a 16 kHz (opción de precisión). */
  audioPcm?: (startMs: number, samples: Float32Array) => void;
}

export class YoutubeAgentClient {
  private rpcId = 0;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private handlers: Handlers = {};
  private onDownloadProgress?: (fraction: number) => void;

  /** Traductor de Chrome que vive en la página (el content script aislado no lo tiene). */
  readonly translator: TranslatorPort = {
    availability: async (from, to) =>
      (await this.rpc('translatorStatus', { from, to })) as TranslatorAvailability,
    prepare: async (from, to, onProgress) => {
      this.onDownloadProgress = onProgress;
      try {
        await this.rpc('prepareTranslator', { from, to });
      } finally {
        this.onDownloadProgress = undefined;
      }
    },
    translate: (texts, from, to) => this.rpc('translate', { texts, from, to }),
  };

  /** `listen` registra el listener de window (con ctx.addEventListener en el content script). */
  constructor(listen: (cb: (e: MessageEvent) => void) => void) {
    listen((e) => {
      if (e.source === window && isAgentMessage(e.data) && e.data.source === AGENT) this.onMessage(e.data);
    });
  }

  on(handlers: Handlers) {
    this.handlers = handlers;
  }

  /** Activa/desactiva el análisis del audio. Devuelve false si el navegador no puede. */
  setVoiceAnalysis(enabled: boolean): Promise<boolean> {
    return this.rpc('setVoiceAnalysis', { enabled });
  }

  enableCaptions(lang: string): Promise<void> {
    return this.rpc('enableCaptions', { lang });
  }

  /** Idioma hablado en el vídeo, o null si YouTube no lo indica. */
  videoLanguage(videoId: string): Promise<string | null> {
    return this.rpc('videoLanguage', { videoId });
  }

  private rpc<M extends RpcMethod>(method: M, args: AgentRpc[M]['args']): Promise<AgentRpc[M]['result']> {
    const id = ++this.rpcId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      window.postMessage({ source: CONTENT, type: 'rpc', id, method, args }, location.origin);
    });
  }

  private onMessage(msg: AgentMessage) {
    switch (msg.type) {
      case 'rpc-result': {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.value);
        else p.reject(new Error(msg.error));
        return;
      }
      case 'captions': {
        const url = msg.url;
        this.handlers.captions?.({
          id: `yt:${msg.videoId}:${msg.lang}:${msg.auto ? 'asr' : 'std'}`,
          videoId: msg.videoId,
          lang: msg.lang.split('-')[0] ?? '',
          auto: msg.auto,
          cues: parseTimedText(msg.body, msg.auto),
          words: msg.auto ? parseAsrWords(msg.body) : undefined,
          fetchTranslated: async (tlang) =>
            parseTimedText(await this.rpc('fetchYoutubeTranslation', { url, tlang }), false),
        });
        return;
      }
      case 'no-captions':
        this.handlers.noCaptions?.(msg.videoId);
        return;
      case 'audio-pcm':
        this.handlers.audioPcm?.(msg.startMs, msg.samples);
        return;
      case 'download-progress':
        this.onDownloadProgress?.(msg.fraction);
        return;
    }
  }
}
