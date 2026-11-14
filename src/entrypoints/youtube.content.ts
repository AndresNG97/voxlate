/**
 * Content script (mundo aislado) de YouTube. Raíz de composición de la FASE 1:
 * conecta los adaptadores de YouTube, DOM y Chrome con CaptionSession y
 * DubbingService, y crea una sesión nueva en cada vídeo.
 */
import { RuntimeSpeechSynthesizer } from '@/adapters/chrome/runtime-speech';
import { ChromeSettingsStore } from '@/adapters/chrome/settings-storage';
import { HtmlMediaElement } from '@/adapters/dom/html-media-element';
import { SubtitleOverlay } from '@/adapters/dom/subtitle-overlay';
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
    const speech = new RuntimeSpeechSynthesizer();
    // La calibración de la voz sobrevive a los cambios de vídeo.
    const calibration = new VoiceCalibration();

    const dubOptions = (): DubOptions => ({
      lang: settings.targetLang,
      voiceName: settings.dubVoice,
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
        speech,
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
        controlsVisible: () => controlsVisible(player.container),
      });
      setNativeCaptionsHidden(true);
      await agent.enableCaptions(settings.sourceLang);
    }

    agent.on({
      captions: (c) => {
        if (!session || (c.videoId && c.videoId !== videoId)) return;
        session.load({ cues: c.cues, lang: c.lang || settings.sourceLang, fetchTranslated: c.fetchTranslated });
      },
      noCaptions: () =>
        session?.status('Este vídeo no tiene subtítulos. Prueba el modo audio desde el icono de la extensión.'),
    });

    ctx.addEventListener(document, NAVIGATE_EVENT as keyof DocumentEventMap, () => setupForCurrentVideo());

    const unwatch = store.watch((next) => {
      const prev = settings;
      settings = next;
      if (prev.enabled !== next.enabled || prev.sourceLang !== next.sourceLang) return void setupForCurrentVideo();
      session?.onSettingsChanged(prev, next);
    });
    ctx.onInvalidated(() => {
      unwatch();
      teardown();
    });

    setupForCurrentVideo();
  },
});
