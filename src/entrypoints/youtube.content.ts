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
import { YoutubeAgentClient, type YoutubeCaptions } from '@/adapters/youtube/agent-client';
import type { PageStatus, RuntimeMessage } from '@/adapters/chrome/messages';
import { RuntimeVoiceDetector } from '@/adapters/chrome/runtime-voice-detector';
import { SpeechTimeline } from '@/core/domain/voice-activity';
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
import { alignToWords } from '@/core/domain/timing';

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
    // Opción de precisión: el agente nos pasa el audio de YouTube, Silero (en el
    // offscreen) dice dónde hay voz y la línea de tiempo lo convierte en tramos.
    const detector = new RuntimeVoiceDetector();
    const voice = new SpeechTimeline(detector.frameMs);
    let detectorQueue: Promise<unknown> = Promise.resolve();
    let detectorFailed = false;
    function analyzeAudio(startMs: number, samples: Float32Array) {
      if (!settings.audioPrecision || detectorFailed) return;
      detectorQueue = detectorQueue
        .then(() => detector.analyze(samples, startMs))
        .then((r) => voice.add(r.startMs, r.probabilities))
        .catch((e: unknown) => {
          detectorFailed = true;
          console.warn('[voxlate] detector de voz', e);
          session?.status('Sincronía de precisión: no se pudo iniciar el detector de voz.', 6000);
        });
    }

    async function applyAudioPrecision() {
      const available = await agent.setVoiceAnalysis(settings.audioPrecision).catch(() => false);
      if (!settings.audioPrecision) voice.clear();
      else if (!available) session?.status('Sincronía de precisión: este navegador no puede analizar el audio.', 6000);
    }

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
    /** Pistas recibidas del vídeo actual: la manual (texto) y la automática (tiempos). */
    let tracks: { manual?: YoutubeCaptions; asr?: YoutubeCaptions } = {};
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
      tracks = {};
      const view = new SubtitleOverlay({ kind: 'player', container: player.container });
      const media = new HtmlMediaElement(player.video);
      const dubbing = new DubbingService({
        speech: useNeural() ? neuralVoice : systemVoice,
        media,
        calibration,
        options: dubOptions,
        onError: (message) => session?.status(`Doblaje: ${message}`, 6000),
        // En desarrollo, una línea por frase en la consola de la pestaña (F12) para ver la sincronización.
        onDebug: import.meta.env.DEV ? (line) => console.info('[voxlate]', line) : undefined,
      });
      session = new CaptionSession({
        translator: agent.translator,
        view,
        media,
        dubbing,
        settings: () => settings,
        cache: translationCache,
        voice,
        controlsVisible: () => controlsVisible(player.container),
      });
      setNativeCaptionsHidden(true);
      voice.clear();
      void applyAudioPrecision();
      await agent.enableCaptions(settings.sourceLang);
    }

    agent.on({
      captions: (c) => {
        if (!session || (c.videoId && c.videoId !== videoId)) return;
        tracks[c.auto ? 'asr' : 'manual'] = c;
        // Texto: la manual si la hay (mejor, con puntuación). Tiempos: las palabras
        // de la automática, que marcan cuándo habla de verdad la persona.
        const primary = tracks.manual ?? c;
        const words = tracks.asr?.words;
        const cues = primary !== tracks.asr && words?.length ? alignToWords(primary.cues, words) : primary.cues;
        // En desarrollo, para comprobar en la consola (F12, filtrar "voxlate") qué tiempos
        // se usan. En la build de tienda no se escribe nada (la pestaña Estado ya lo muestra).
        if (import.meta.env.DEV) {
          const withWords = cues.filter((q) => q.timing === 'words').length;
          console.info(
            '[voxlate]',
            `subtítulos: ${tracks.manual ? `manual (${tracks.manual.cues.length} frases)` : 'sin manual'} + ` +
              `${tracks.asr ? `automáticos (${tracks.asr.words?.length ?? 0} palabras)` : 'sin automáticos'} → ` +
              (withWords
                ? `tiempos de palabras en ${withWords}/${cues.length} frases ✔`
                : 'tiempos de los bloques (sin palabras: menos precisos)'),
          );
        }
        session.load({
          id: primary.videoId ? primary.id : undefined,
          cues,
          lang: primary.lang || settings.sourceLang,
          fetchTranslated: primary.fetchTranslated,
        });
      },
      audioPcm: analyzeAudio,
      noCaptions: (id) => {
        // Si ya tenemos subtítulos funcionando para este vídeo, el aviso es falso.
        if (!session || session.hasTrack() || (id && id !== videoId)) return;
        session.status('Este vídeo no tiene subtítulos. Prueba el modo audio desde el icono de la extensión.');
      },
    });

    ctx.addEventListener(document, NAVIGATE_EVENT as keyof DocumentEventMap, () => setupForCurrentVideo());

    const unwatch = store.watch((next) => {
      const prev = settings;
      settings = next;
      // Cambiar de motor de voz obliga a recrear el doblaje: recreamos la sesión.
      const engineChanged = useNeural(prev) !== useNeural(next);
      if (prev.enabled !== next.enabled || prev.sourceLang !== next.sourceLang || engineChanged)
        return void setupForCurrentVideo();
      if (prev.audioPrecision !== next.audioPrecision) void applyAudioPrecision();
      session?.onSettingsChanged(prev, next);
    });
    // El popup pregunta qué está pasando en esta pestaña (pestaña Estado).
    const onRuntimeMessage = (raw: unknown, _sender: unknown, sendResponse: (r: PageStatus) => void) => {
      if ((raw as RuntimeMessage).type !== 'page:status') return;
      sendResponse({
        active: !!session,
        manualCues: tracks.manual?.cues.length ?? null,
        asrWords: tracks.asr?.words?.length ?? null,
        session: session?.snapshot() ?? null,
        voice: useNeural() ? 'neural' : 'system',
        precision: !settings.audioPrecision ? 'off' : detectorFailed ? 'failed' : 'on',
        analyzedSec: Math.round(voice.coveredMs() / 1000),
      });
    };
    browser.runtime.onMessage.addListener(onRuntimeMessage);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      unwatch();
      teardown();
    });

    setupForCurrentVideo();
  },
});
