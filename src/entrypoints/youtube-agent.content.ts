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
import { YoutubeAudioTap } from '@/adapters/youtube/audio-tap';
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
  getPlayerResponse?: () => {
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: { languageCode: string; kind?: string; vssId?: string }[] };
    };
  };
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
    // Hay que engancharlo ya (document_start), antes de que el reproductor cree su MediaSource.
    // Con la opción de precisión, entrega el audio (16 kHz) al content script para el detector de voz.
    const audioTap = new YoutubeAudioTap((startMs, samples) => {
      const msg: AgentMessage = { source: AGENT, type: 'audio-pcm', startMs, samples };
      window.postMessage(msg, location.origin, [samples.buffer]);
    });
    audioTap.install();

    type CaptionsMsg = Extract<AgentMessage, { type: 'captions' }>;
    const baseLang = (code: string) => code.split('-')[0] ?? '';
    const captionsKey = (videoId: string, asr: boolean) => `${videoId}|${asr ? 'asr' : 'std'}`;

    /**
     * Última pista recibida por vídeo y tipo (manual / automática), por si el
     * content script llega tarde o la pide otra vez.
     */
    const lastCaptions = new Map<string, CaptionsMsg>();

    function onTimedText(rawUrl: string, body: string) {
      try {
        const url = new URL(rawUrl, location.origin);
        // Si es una petición ya traducida por YouTube la ignoramos.
        if (url.searchParams.has('tlang') || !body) return;
        const videoId = url.searchParams.get('v') ?? '';
        const auto = url.searchParams.get('kind') === 'asr';
        const msg: CaptionsMsg = {
          source: AGENT,
          type: 'captions',
          videoId,
          lang: url.searchParams.get('lang') ?? '',
          auto,
          url: url.toString(),
          body,
        };
        lastCaptions.set(captionsKey(videoId, auto), msg);
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
          const r: unknown = this.response;
          const body = typeof r === 'string' ? r : r instanceof ArrayBuffer ? new TextDecoder().decode(r) : '';
          onTimedText(href, body);
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

    /**
     * Pistas disponibles. La API del reproductor a veces devuelve la lista vacía
     * (sobre todo si los subtítulos ya venían activados); en ese caso las leemos
     * de los datos del vídeo. Ojo: para activar una pista automática hay que
     * pasar el objeto completo (con vss_id), no basta con el idioma.
     */
    function availableTracks(): YtCaptionTrack[] {
      const p = player();
      p?.loadModule?.('captions');
      const fromPlayer = (p?.getOption?.('captions', 'tracklist') as YtCaptionTrack[] | undefined) ?? [];
      if (fromPlayer.length) return fromPlayer;
      const fromResponse = p?.getPlayerResponse?.()?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      return fromResponse.map((t) => ({ languageCode: t.languageCode, kind: t.kind, vss_id: t.vssId }));
    }

    function cached(videoId: string, lang: string, asr: boolean): CaptionsMsg | null {
      const c = lastCaptions.get(captionsKey(videoId, asr));
      return c && baseLang(c.lang) === lang ? c : null;
    }

    async function waitFor<T>(get: () => T | null, ms: number): Promise<T | null> {
      for (let waited = 0; waited < ms; waited += 150) {
        const v = get();
        if (v) return v;
        await new Promise((r) => setTimeout(r, 150));
      }
      return get();
    }

    /** Activa una pista y espera a recibirla. Si ya estaba activa, la reactiva para forzar la descarga. */
    async function fetchTrack(videoId: string, track: YtCaptionTrack): Promise<boolean> {
      const lang = baseLang(track.languageCode);
      const asr = track.kind === 'asr';
      if (cached(videoId, lang, asr)) return true;
      player()?.setOption?.('captions', 'track', track);
      if (await waitFor(() => cached(videoId, lang, asr), 2500)) return true;
      player()?.setOption?.('captions', 'track', {});
      player()?.setOption?.('captions', 'track', track);
      return !!(await waitFor(() => cached(videoId, lang, asr), 2500));
    }

    /**
     * Consigue los subtítulos del vídeo en `lang`: la pista manual (mejor texto
     * para traducir) y además la automática (tiempos de cada palabra, para
     * sincronizar el doblaje). Las dos llegan al content script, que las combina.
     */
    async function enableCaptions(lang: string) {
      const videoId = currentVideoId();
      // Lo que ya tengamos, se reenvía enseguida (p. ej. si los subtítulos ya estaban puestos).
      for (const asr of [false, true]) {
        const c = cached(videoId, lang, asr);
        if (c) window.postMessage(c, location.origin);
      }

      // La lista de pistas tarda un poco en estar disponible tras cargar el vídeo.
      const tracks = (await waitFor(() => { const t = availableTracks(); return t.length ? t : null; }, 4500)) ?? [];
      const inLang = tracks.filter((t) => baseLang(t.languageCode) === lang);
      const manualTrack = inLang.find((t) => t.kind !== 'asr');
      const asrTrack = inLang.find((t) => t.kind === 'asr');

      if (!manualTrack && !asrTrack) {
        // Nada en ese idioma: lo que haya llegado de este vídeo, o cualquier otra pista.
        const any = [...lastCaptions.values()].find((c) => c.videoId === videoId);
        if (any) return void window.postMessage(any, location.origin);
        if (tracks[0] && (await fetchTrack(videoId, tracks[0]))) return;
        post({ type: 'no-captions', videoId });
        return;
      }
      if (manualTrack) await fetchTrack(videoId, manualTrack);
      if (asrTrack) {
        await fetchTrack(videoId, asrTrack);
        // Dejamos activa la manual, que es la que el usuario espera.
        if (manualTrack) player()?.setOption?.('captions', 'track', manualTrack);
      }
    }

    // --- RPC desde el content script ---------------------------------------------
    const handlers: { [K in RpcMethod]: (args: AgentRpc[K]['args']) => Promise<AgentRpc[K]['result']> } = {
      enableCaptions: ({ lang }) => enableCaptions(lang),
      setVoiceAnalysis: async ({ enabled }) => {
        audioTap.setEnabled(enabled);
        return audioTap.available;
      },
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

  },
});
