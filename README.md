# Voxlate

Extensión de Chrome (Manifest V3) que traduce en tiempo real los vídeos, sobre todo del inglés al español.

**Stack:** TypeScript · [WXT](https://wxt.dev) (Vite) · React (solo en el popup) · overlay vanilla en Shadow DOM · Translator API integrada en Chrome · Deepgram (modo audio).

## Arrancar

```bash
pnpm install
pnpm dev          # abre un Chrome con la extensión cargada y recarga en caliente
```

Para cargarla en tu Chrome de siempre: ejecuta `pnpm build`, ve a `chrome://extensions`, activa el modo desarrollador y usa "Cargar descomprimida" con `.output/chrome-mv3`.

Requisitos: Chrome 138 o superior en escritorio para la Translator API. La primera vez hay que descargar el modelo en→es, ya sea desde el popup o desde el aviso que sale sobre el vídeo.

## Cómo funciona

### Fase 1: vídeos con subtítulos (YouTube) ✅

```
youtube-agent.content.ts  (MAIN world, document_start)
  ├─ intercepta fetch/XHR a /api/timedtext  → la pista con el token `pot` incluido
  ├─ activa la pista en inglés con la API de #movie_player
  └─ RPC: Translator API, &tlang= de YouTube
        ⇅ window.postMessage (adapters/youtube/bridge.ts)
youtube.content.ts  (mundo aislado, raíz de composición)
  ├─ adapters/youtube/timedtext.ts   json3/XML → frases (re-segmenta los subtítulos automáticos)
  ├─ core/application/caption-session.ts
  │    traduce por delante del cursor, en lotes; si haces seek, vuelve a priorizar desde ahí
  ├─ core/application/dubbing.ts     doblaje con voz del sistema + modo sincronización
  ├─ adapters/dom/subtitle-overlay.ts pinta la frase activa (o la que está sonando) en el reproductor
  └─ oculta los subtítulos nativos
```

**Traducción completa y caché:** YouTube entrega la pista entera al empezar. Se traduce toda (primero
desde donde estás hasta el final, luego lo anterior) y se guarda por vídeo e idioma en
`chrome.storage.local`, así al volver a un vídeo la traducción es instantánea.

**Doblaje:** con voz neuronal (Piper) el audio de las frases del próximo minuto y medio se genera por
adelantado en el offscreen document. El modo sincronización (`core/domain/dub-sync.ts`) busca la
*isocronía*: la voz empieza cuando empieza a hablar la persona y acaba cuando ella acaba (fin real del
habla, estimado con los tiempos palabra a palabra de los subtítulos). Acelera o frena la voz según haga
falta, la corrige unas 4 veces por segundo mientras suena y solo ralentiza el vídeo como último recurso.
Además, cada frase se genera ya con la duración de lo que habla la persona: Piper puede hablar más
despacio o más deprisa de forma natural (`length_scale`), mucho mejor que estirar el audio. Para eso hay
un pequeño parche a `@mintplex-labs/piper-tts-web` en `patches/` (pnpm lo aplica solo al instalar). Con la voz del
sistema (`chrome.tts`) la duración se estima y se calibra sobre la marcha. El motor ONNX y el
fonetizador de Piper se copian de `node_modules` al compilar (`wxt.config.ts`); las voces (~60 MB)
se descargan una vez de Hugging Face.

**Cuándo habla de verdad la persona** (`core/domain/timing.ts`). Medido con un vídeo real: los bloques
de los subtítulos manuales van pegados e incluyen silencios (la persona habla el 28-100 % del bloque), mientras
que los automáticos dan el instante de cada palabra (~150 ms de error). Por eso se piden **las dos pistas**: el
texto manual para traducir y las palabras automáticas para los tiempos (error del fin del habla: 704 ms → 91 ms).
Las anotaciones como "(Laughter)" o "[Music]" se descartan.

**Sincronía de precisión (opcional, solo YouTube):** el agente intercepta el audio que el reproductor mete en
MSE (Opus en WebM, 1-2 min por delante), lo descompone (`webm-opus-demuxer.ts`), lo decodifica con WebCodecs y
lo pasa a 16 kHz. El content script lo envía al offscreen document, donde **Silero VAD v5** (`adapters/silero`,
ONNX, MIT) da la probabilidad de voz cada 32 ms; `voice-activity.ts` lo convierte en tramos y `timing.ts` afina
inicio y fin de cada frase. Medido: 0 % de falsos positivos con aplausos y música (un detector por energía los
confundía con voz), bordes a ~60 ms y unas 90× más rápido que el tiempo real.

Hay dos motores de traducción, que se eligen en el popup:
- **Chrome (local):** traduce on-device. Es gratis, privado y no consume red. Es el motor por defecto.
- **YouTube:** repide la pista con `&tlang=es`. Es el plan B automático si la Translator API no está disponible.

### Fase 2: modo audio en cualquier web (beta, esqueleto)

```
popup (clic) → tabCapture.getMediaStreamId → background.ts
  → inyecta live-overlay.js en la pestaña (activeTab, sin <all_urls>)
  → offscreen document: getUserMedia(tab) → AudioContext (reenvía el audio a los altavoces)
       → public/pcm-worklet.js (PCM16 mono 16 kHz, bloques de 100 ms)
       → adapters/deepgram/deepgram-recognizer.ts (WebSocket nova-3, parciales + finales)
       → traduce solo los finales → background → overlay
```

Está **apagado por defecto**: la build normal no incluye su código ni pide sus permisos (`tabCapture`, `activeTab`, `scripting`). Para probarlo, copia `.env.example` en `.env.local`, pon `WXT_LIVE_MODE=true` y rellena `WXT_DEEPGRAM_DEV_KEY` (**solo en local**; `pnpm build` falla si la clave acaba en la build de producción). En producción hay que usar `WXT_STT_TOKEN_URL`, que apunta a un endpoint de tu backend. Ese endpoint llama a `POST https://api.deepgram.com/v1/auth/grant` con tu API key y devuelve `{ access_token }`. Puede vivir en el mismo gateway en Rust que Sinelow.

## Qué se guarda y cuándo se limpia

| Qué | Dónde | Limpieza |
|---|---|---|
| Traducciones por vídeo | `chrome.storage.local` (~100 KB por hora de vídeo) | Máx. 40 vídeos; caducan a los 30 días sin usarse; si se llena el espacio se libera la mitad más antigua. Botón para borrarlas en el popup |
| Voces de Piper (~60 MB cada una) | OPFS de la extensión | Se conservan máx. 2 (la que se usa y la anterior); lista y botón para borrarlas en la pestaña Voz |
| Audio generado del doblaje | Memoria del offscreen | Máx. 250 frases; desaparece al cerrarse |
| Probabilidades de voz (Silero) | Memoria de la pestaña | Se olvida lo que queda a más de 10 min |
| Modelos de traducción de Chrome | Los gestiona Chrome | — |

## Arquitectura (hexagonal)

La lógica vive en `core/` y no sabe nada de Chrome, YouTube ni Deepgram: habla con
**puertos** (interfaces). Cada tecnología concreta es un **adaptador** en `adapters/`, y
los **entrypoints** son las raíces de composición que enchufan unos con otros.
Para cambiar una pieza (otra voz, otro traductor, otro STT, otra web) se escribe un
adaptador nuevo para el mismo puerto, sin tocar `core/`.

```
src/
  core/                          ← sin chrome.*, sin DOM de YouTube
    domain/                      reglas puras
      cue.ts                     frases y búsqueda por tiempo
      dub-sync.ts                fórmula del modo sincronización
      settings.ts                ajustes, valores por defecto, idiomas
      subtitles.ts               estilo de subtítulos y qué líneas se ven
    ports/                       interfaces
      translator.ts  translation-cache.ts  speech-synthesizer.ts  speech-recognizer.ts
      audio-source.ts  media-element.ts  subtitle-view.ts  settings-store.ts
    application/                 casos de uso
      caption-session.ts         traducir y mostrar una pista sincronizada
      dubbing.ts                 doblaje (sincronización / manual)
      live-transcription.ts      modo audio: audio → STT → traducción
  adapters/
    chrome/                      Translator API, chrome.tts, chrome.storage, tabCapture, mensajes, modo audio
    youtube/                     agente MAIN world, parser timedtext, DOM del reproductor
    dom/                         overlay de subtítulos, <video>
    piper/                       voz neuronal local (ONNX en WASM, corre en el offscreen document)
    deepgram/                    STT en streaming
  entrypoints/                   raíces de composición (background, content scripts, offscreen, popup)
public/
  pcm-worklet.js  icon/
```

| Puerto | Adaptadores actuales | Ideas |
|---|---|---|
| `TranslatorPort` | Translator API de Chrome (directa o vía la página de YouTube) | LLM con contexto (premium) |
| `SpeechSynthesizerPort` | Piper (voz neuronal local, genera el audio por adelantado) · `chrome.tts` (voces del sistema) | Kokoro, ElevenLabs |
| `TranslationCachePort` | `chrome.storage.local` (últimos 40 vídeos) | |
| `SpeechRecognizerPort` | Deepgram | Reconocimiento local de Chrome, Whisper/Moonshine en WebGPU |
| `SubtitleViewPort` | Overlay en Shadow DOM | |
| `MediaElementPort` | `<video>` del DOM | |
| `SettingsStorePort` | `chrome.storage.sync` | |
| `AudioSourcePort` | Captura de pestaña | Micrófono |

## Pendiente / ideas

- [ ] Probar la fase 1 con muchos tipos de vídeo: directos, Shorts y embeds (`allFrames`).
- [ ] Fase 2: comprobar que la Translator API funciona en el offscreen document. Si no, mover la traducción a `live-overlay`.
- [ ] Backend de tokens STT y control de minutos por usuario (plan de pago).
- [ ] Más webs con subtítulos: `<track>` y HLS WebVTT genéricos, Coursera, Udemy…
- [ ] Modo calidad con un LLM, pasando contexto de las frases anteriores.
- [x] Doblaje con TTS bajando el volumen original (modo sincronización y manual).
- [ ] Atajo de teclado para activar/desactivar y arrastrar el subtítulo.

## Licencia y privacidad

- Voxlate se publica bajo la **GPL v3 o posterior** ([LICENSE](LICENSE)). Tiene que ser GPL porque incluye espeak-ng (GPL-3.0) dentro del fonetizador de Piper.
- Componentes de terceros y licencias de las voces: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Política de privacidad (es el enlace que pide la Chrome Web Store): [PRIVACY.md](PRIVACY.md).
