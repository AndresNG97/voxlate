/**
 * Corre en el MAIN world de YouTube (mismo contexto JS que la página).
 *
 * ¿Por qué? Desde 2025 YouTube exige un token `pot` en /api/timedtext, así que
 * pedir los subtítulos "a mano" devuelve vacío. Lo fiable es dejar que el propio
 * reproductor los pida e interceptar la respuesta. Desde aquí también podemos
 * usar la API del reproductor (`#movie_player`) para activar la pista en inglés.
 *
 * Este script NO tiene acceso a chrome.* — habla con el content script aislado
 * mediante window.postMessage (ver adapters/youtube/bridge.ts). El traductor de
 * Chrome se usa desde aquí porque el mundo aislado no tiene `Translator`.
 */
import { ChromeTranslator } from '@/adapters/chrome/chrome-translator';
import { AGENT, isContentMessage, type AgentMessage, type AgentRpc, type RpcMethod } from '@/adapters/youtube/bridge';

interface YtCaptionTrack {
  languageCode: string;
  kind?: string; // 'asr' = generados automáticamente
  vss_id?: string;
  displayName?: string;
}

interface YtPlayer extends HTMLElement {
  loadModule?: (name: string) => void;
  getOption?: (module: string, option: string) => unknown;
  setOption?: (module: string, option: string, value: unknown) => void;
  getVideoData?: () => { video_id?: string };
}

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    type WithoutSource<T> = T extends unknown ? Omit<T, 'source'> : never;
    const post = (msg: WithoutSource<AgentMessage>) =>
      window.postMessage({ source: AGENT, ...msg } as AgentMessage, location.origin);

    const nativeFetch = window.fetch.bind(window);
    const translator = new ChromeTranslator();

    /** Última respuesta de subtítulos por vídeo (por si el content script llega tarde). */
    const lastCaptions = new Map<string, Extract<AgentMessage, { type: 'captions' }>>();

    function onTimedText(rawUrl: string, body: string) {
      try {
        const url = new URL(rawUrl, location.origin);
        // Si es una petición ya traducida por YouTube la ignoramos.
        if (url.searchParams.has('tlang')) return;
        const videoId = url.searchParams.get('v') ?? '';
        const msg = {
          source: AGENT,
          type: 'captions',
          videoId,
          lang: url.searchParams.get('lang') ?? '',
          auto: url.searchParams.get('kind') === 'asr',
          url: url.toString(),
          body,
        } as const;
        lastCaptions.set(videoId, msg);
        window.postMessage(msg, location.origin);
      } catch (e) {
        console.warn('[voxlate] timedtext', e);
      }
    }

    // --- Interceptar fetch ---------------------------------------------------
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const res = await nativeFetch(input, init);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/timedtext')) {
        res.clone().text().then((body) => onTimedText(url, body), () => {});
      }
      return res;
    };

    // --- Interceptar XHR (el reproductor usa ambos según la versión) ---------
    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      const href = String(url);
      if (href.includes('/api/timedtext')) {
        this.addEventListener('load', () => {
          if (this.responseType === '' || this.responseType === 'text') onTimedText(href, this.responseText);
        });
      }
      // @ts-expect-error reenviamos los argumentos opcionales tal cual
      return xhrOpen.call(this, method, url, ...rest);
    };

    // --- Reproductor -----------------------------------------------------------
    const player = () => document.getElementById('movie_player') as YtPlayer | null;

    function currentVideoId(): string {
      return player()?.getVideoData?.().video_id ?? new URLSearchParams(location.search).get('v') ?? '';
    }

    async function enableCaptions(lang: string) {
      const videoId = currentVideoId();
      const cached = lastCaptions.get(videoId);
      if (cached && cached.lang.startsWith(lang)) {
        window.postMessage(cached, location.origin);
        return;
      }

      // La lista de pistas tarda un poco en estar disponible tras cargar el vídeo.
      let tracks: YtCaptionTrack[] = [];
      for (let i = 0; i < 30; i++) {
        const p = player();
        p?.loadModule?.('captions');
        tracks = (p?.getOption?.('captions', 'tracklist') as YtCaptionTrack[] | undefined) ?? [];
        if (tracks.length) break;
        await new Promise((r) => setTimeout(r, 150));
      }

      // Preferimos subtítulos manuales > automáticos > cualquier otro idioma.
      const inLang = tracks.filter((t) => t.languageCode.split('-')[0] === lang);
      const track = inLang.find((t) => t.kind !== 'asr') ?? inLang[0] ?? tracks[0];
      if (!track) {
        post({ type: 'no-captions', videoId });
        return;
      }
      player()?.setOption?.('captions', 'track', track);
    }

    // --- RPC desde el content script ---------------------------------------------
    const handlers: { [K in RpcMethod]: (args: AgentRpc[K]['args']) => Promise<AgentRpc[K]['result']> } = {
      enableCaptions: ({ lang }) => enableCaptions(lang),
      translatorStatus: ({ from, to }) => translator.availability(from, to),
      prepareTranslator: async ({ from, to }) => {
        await translator.prepare(from, to, (fraction) => post({ type: 'download-progress', fraction }));
      },
      translate: ({ texts, from, to }) => translator.translate(texts, from, to),
      fetchYoutubeTranslation: async ({ url, tlang }) => {
        const u = new URL(url);
        u.searchParams.set('tlang', tlang);
        const res = await nativeFetch(u, { credentials: 'include' });
        if (!res.ok) throw new Error(`YouTube respondió ${res.status}`);
        return res.text();
      },
    };

    window.addEventListener('message', async (e) => {
      if (e.source !== window || !isContentMessage(e.data)) return;
      const { id, method, args } = e.data;
      const handler = handlers[method] as ((a: unknown) => Promise<unknown>) | undefined;
      if (!handler) return;
      try {
        const value = await handler(args);
        post({ type: 'rpc-result', id, ok: true, value });
      } catch (err) {
        post({ type: 'rpc-result', id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });

    post({ type: 'ready' });
  },
});
