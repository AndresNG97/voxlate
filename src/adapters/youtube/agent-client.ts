/**
 * Lado "content script aislado" del canal con el agente de YouTube (MAIN world).
 * - Expone el traductor de Chrome de la página como TranslatorPort.
 * - Avisa cuando llega una pista de subtítulos (ya parseada a frases).
 */
import type { Cue } from '@/core/domain/cue';
import type { TranslatorAvailability, TranslatorPort } from '@/core/ports/translator';
import { AGENT, CONTENT, isAgentMessage, type AgentMessage, type AgentRpc, type RpcMethod } from './bridge';
import { parseTimedText } from './timedtext';

export interface YoutubeCaptions {
  /** Identificador estable de la pista: vídeo + idioma + manual/automática. */
  id: string;
  videoId: string;
  /** Idioma base de la pista (p. ej. 'en'). */
  lang: string;
  cues: Cue[];
  /** Repide la pista traducida por YouTube (&tlang=). */
  fetchTranslated: (targetLang: string) => Promise<Cue[]>;
}

interface Handlers {
  captions?: (c: YoutubeCaptions) => void;
  noCaptions?: (videoId: string) => void;
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

  enableCaptions(lang: string): Promise<void> {
    return this.rpc('enableCaptions', { lang });
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
          cues: parseTimedText(msg.body, msg.auto),
          fetchTranslated: async (tlang) =>
            parseTimedText(await this.rpc('fetchYoutubeTranslation', { url, tlang }), false),
        });
        return;
      }
      case 'no-captions':
        this.handlers.noCaptions?.(msg.videoId);
        return;
      case 'download-progress':
        this.onDownloadProgress?.(msg.fraction);
        return;
      case 'ready':
        return;
    }
  }
}
