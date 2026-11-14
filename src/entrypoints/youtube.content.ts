/**
 * Content script (mundo aislado) de YouTube. Raíz de composición de la FASE 1:
 * conecta los adaptadores de YouTube, DOM y Chrome con CaptionSession y
 * DubbingService, y crea una sesión nueva en cada vídeo.
 */
import { RuntimeNeuralSynthesizer } from '@/adapters/chrome/runtime-neural-speech';
import { RuntimeSpeechSynthesizer } from '@/adapters/chrome/runtime-speech';
import { ChromeSettingsStore } from '@/adapters/chrome/settings-storage';
import { ChromeTranslationCache } from '@/adapters/chrome/translation-cache';
import { HtmlMediaElement } from '@/adapters/dom/html-media-element';
import { SubtitleOverlay } from '@/adapters/dom/subtitle-overlay';
import { pickNeuralVoice } from '@/adapters/piper/piper-voices';
import { YoutubeAgentClient } from '@/adapters/youtube/agent-client';
import {
  controlsVisible,
  currentVideoId,
  isWatchPage,
  NAVIGATE_EVENT,
  setNativeCaptionsHidden,
  waitForPlayer,
} from '@/adapters/youtube/youtube-page';
import { CaptionSession } from '@/core/application/caption-session';
import { DubbingService, VoiceCalibration, type DubOptions } from '@/core/application/dubbing';
import type { Settings } from '@/core/domain/settings';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    const store = new ChromeSettingsStore();
    let settings: Settings = await store.get();

    const agent = new YoutubeAgentClient((cb) => ctx.addEventListener(window, 'message', cb));
    const systemVoice = new RuntimeSpeechSynthesizer();
    const neuralVoice = new RuntimeNeuralSynthesizer((loading) =>
      session?.status(loading ? 'Preparando la voz neuronal… (la primera vez se descarga, ~60 MB)' : null),
    );
    /** Voz neuronal si hay una para el idioma destino; si no, la del sistema. */
    const useNeural = (s: Settings = settings) =>
      s.dubEngine === 'neural' && !!pickNeuralVoice(s.targetLang, s.neuralVoice);
    // La calibración de la voz sobrevive a los cambios de vídeo.
    const calibration = new VoiceCalibration();
    const translationCache = new ChromeTranslationCache();

    const dubOptions = (): DubOptions => ({
      lang: settings.targetLang,
      voiceName: useNeural() ? settings.neuralVoice : settings.dubVoice,
      rate: settings.dubRate,
      originalVolume: settings.dubOriginalVolume,
      sync: settings.dubSync,
      videoRate: settings.dubVideoRate,
    });

    let session: CaptionSession | null = null;
    let videoId = '';
    let setupGen = 0;

    function teardown() {
      session?.dispose();
      session = null;
      setNativeCaptionsHidden(false);
    }

    async function setupForCurrentVideo() {
      const gen = ++setupGen;
      teardown();
      if (!settings.enabled || !isWatchPage()) return;

      const player = await waitForPlayer();
      // Si mientras esperábamos cambió de vídeo, esta llamada ya no vale.
      if (!player || ctx.isInvalid || gen !== setupGen) return;

      videoId = currentVideoId();
      const view = new SubtitleOverlay({ kind: 'player', container: player.container });
      const media = new HtmlMediaElement(player.video);
      const dubbing = new DubbingService({
        speech: useNeural() ? neuralVoice : systemVoice,
        media,
        calibration,
        options: dubOptions,
        onError: (message) => session?.status(`Doblaje: ${message}`, 6000),
      });
      session = new CaptionSession({
        translator: agent.translator,
        view,
        media,
        dubbing,
        settings: () => settings,
        cache: translationCache,
        controlsVisible: () => controlsVisible(player.container),
      });
      setNativeCaptionsHidden(true);
      await agent.enableCaptions(settings.sourceLang);
    }

    agent.on({
      captions: (c) => {
        if (!session || (c.videoId && c.videoId !== videoId)) return;
        session.load({
          id: c.videoId ? c.id : undefined,
          cues: c.cues,
          lang: c.lang || settings.sourceLang,
          fetchTranslated: c.fetchTranslated,
        });
      },
      noCaptions: () =>
        session?.status('Este vídeo no tiene subtítulos. Prueba el modo audio desde el icono de la extensión.'),
    });

    ctx.addEventListener(document, NAVIGATE_EVENT as keyof DocumentEventMap, () => setupForCurrentVideo());

    const unwatch = store.watch((next) => {
      const prev = settings;
      settings = next;
      // Cambiar de motor de voz obliga a recrear el doblaje: recreamos la sesión.
      const engineChanged = useNeural(prev) !== useNeural(next);
      if (prev.enabled !== next.enabled || prev.sourceLang !== next.sourceLang || engineChanged)
        return void setupForCurrentVideo();
      session?.onSettingsChanged(prev, next);
    });
    ctx.onInvalidated(() => {
      unwatch();
      teardown();
    });

    setupForCurrentVideo();
  },
});
