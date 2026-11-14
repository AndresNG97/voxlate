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

Hay dos motores, que se eligen en el popup:
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

Para probarlo, copia `.env.example` en `.env.local` y rellena `WXT_DEEPGRAM_DEV_KEY` (**solo en local**). En producción hay que usar `WXT_STT_TOKEN_URL`, que apunta a un endpoint de tu backend. Ese endpoint llama a `POST https://api.deepgram.com/v1/auth/grant` con tu API key y devuelve `{ access_token }`. Puede vivir en el mismo gateway en Rust que Sinelow.

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
      translator.ts  speech-synthesizer.ts  speech-recognizer.ts  audio-source.ts
      media-element.ts  subtitle-view.ts  settings-store.ts
    application/                 casos de uso
      caption-session.ts         traducir y mostrar una pista sincronizada
      dubbing.ts                 doblaje (sincronización / manual)
      live-transcription.ts      modo audio: audio → STT → traducción
  adapters/
    chrome/                      Translator API, chrome.tts, chrome.storage, tabCapture, mensajes, modo audio
    youtube/                     agente MAIN world, parser timedtext, DOM del reproductor
    dom/                         overlay de subtítulos, <video>
    deepgram/                    STT en streaming
  entrypoints/                   raíces de composición (background, content scripts, offscreen, popup)
public/
  pcm-worklet.js  icon/
```

| Puerto | Adaptadores actuales | Ideas |
|---|---|---|
| `TranslatorPort` | Translator API de Chrome (directa o vía la página de YouTube) | LLM con contexto (premium) |
| `SpeechSynthesizerPort` | `chrome.tts` (voces del sistema) | Piper/Kokoro en WASM, ElevenLabs |
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
