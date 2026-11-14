# Chrome Web Store listing

Texts to copy into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
The listing is in **English (default)** with a **Spanish** translation. The name and
summary also live in `public/_locales/*/messages.json`: if you change them here,
change them there too.

---

## English (default language)

**Name** (from the manifest, max. 75)

```
Voxlate — Translated subtitles & dubbing
```

**Summary** (from the manifest, max. 132)

```
Translate and dub YouTube videos into your language. Free, private and processed on your own computer.
```

**Category:** Accessibility
**Language:** English

**Description**

```
Watch YouTube videos in your own language. Voxlate translates the subtitles and can read them aloud with a natural voice, in sync with the speaker. Everything runs on your computer: no account, no servers, no tracking.

TRANSLATED SUBTITLES
• Uses the video's own captions (manual or auto-generated) and translates them with Chrome's built-in, on-device translator.
• If Chrome's translator isn't available for a language, it falls back to YouTube's own translation.
• Show the translation, the original, or both at once, for as long as the person is speaking.
• Choose the text size, position and background.

DUBBING
• Reads the translated subtitles aloud while lowering the original audio (you choose how much).
• Natural neural voices (Piper) for 13 languages: English, Spanish, French, German, Italian, Portuguese, Catalan, Dutch, Polish, Russian, Ukrainian, Turkish and Chinese. Each voice is downloaded once and stored on your computer.
• Or use the voices already installed on your system.

SYNCHRONIZATION
• Automatic mode: adjusts the voice speed, and slightly the video speed when needed, so each sentence starts and ends with the speaker.
• Precision mode: detects when the person is really speaking (voice activity detection, on your computer) for even tighter timing.
• Manual mode: set the voice and video speed yourself.

PRIVATE BY DESIGN
• Translation, voice and audio analysis happen on your computer.
• Voxlate doesn't collect, sell or share any data. No analytics, no ads.
• Saved translations (last 40 videos, 30 days) and downloaded voices stay in your browser, and you can delete them at any time.

REQUIREMENTS
• Chrome 138 or later on a computer (Windows, macOS or Linux).
• Videos with captions (manual or auto-generated).
• Interface in English and Spanish (it follows Chrome’s language).

Voxlate is free and open source (GPL-3.0): https://github.com/AndresNG97/voxlate
```

---

## Spanish

The texts inside the code blocks stay in Spanish: they are what Spanish-speaking users see.

**Name** (from the manifest)

```
Voxlate — Subtítulos traducidos y doblaje
```

**Summary** (from the manifest)

```
Traduce y dobla los vídeos de YouTube a tu idioma. Gratis, privado y procesado en tu propio equipo.
```

**Description**

```
Mira los vídeos de YouTube en tu idioma. Voxlate traduce los subtítulos y puede leerlos en voz alta con una voz natural, sincronizada con quien habla. Todo funciona en tu equipo: sin cuentas, sin servidores y sin rastreo.

SUBTÍTULOS TRADUCIDOS
• Usa los subtítulos del propio vídeo (manuales o automáticos) y los traduce con el traductor integrado de Chrome, en tu equipo.
• Si el traductor de Chrome no está disponible para un idioma, usa la traducción de YouTube.
• Muestra la traducción, el original o los dos a la vez, durante todo el tiempo que habla la persona.
• Elige el tamaño del texto, la posición y el fondo.

DOBLAJE
• Lee en voz alta los subtítulos traducidos y baja el audio original (tú eliges cuánto).
• Voces neuronales naturales (Piper) en 13 idiomas: español, inglés, francés, alemán, italiano, portugués, catalán, neerlandés, polaco, ruso, ucraniano, turco y chino. Cada voz se descarga una vez y se guarda en tu equipo.
• O usa las voces que ya tiene instaladas tu sistema.

SINCRONIZACIÓN
• Modo automático: ajusta la velocidad de la voz y, si hace falta, un poco la del vídeo, para que cada frase empiece y acabe con quien habla.
• Modo de precisión: detecta cuándo habla de verdad la persona (detección de voz, en tu equipo) para cuadrarlo todavía mejor.
• Modo manual: eliges tú la velocidad de la voz y del vídeo.

PRIVADO DE SERIE
• La traducción, la voz y el análisis del audio se hacen en tu equipo.
• Voxlate no recoge, no vende y no comparte ningún dato. Sin analítica ni anuncios.
• Las traducciones guardadas (últimos 40 vídeos, 30 días) y las voces descargadas se quedan en tu navegador, y puedes borrarlas cuando quieras.

REQUISITOS
• Chrome 138 o posterior en ordenador (Windows, macOS o Linux).
• Vídeos con subtítulos (manuales o automáticos).
• Interfaz en español e inglés (según el idioma de Chrome).

Voxlate es gratis y de código abierto (GPL-3.0): https://github.com/AndresNG97/voxlate
```

---

## Privacy practices tab (English)

**Single purpose**

```
Voxlate translates the subtitles of YouTube videos into the user's language, shows them over the video and can read them aloud (dubbing) in sync with the speaker.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings (languages, voice, subtitle style) and a local cache of translated subtitles so the same video isn't translated twice. |
| `offscreen` | Runs the neural text-to-speech voice and the voice activity detector (WebAssembly) in an offscreen document, so audio is generated in the background without opening any window. |
| `tts` | Lets the user choose the voices installed on their system for dubbing, as an alternative to the neural voices. |
| Host permission `https://www.youtube.com/*` | Reads the captions of the YouTube video being watched and shows the translated subtitles over the player. The extension only runs on YouTube. |

**Are you using remote code?**

```
No. All code (JavaScript and WebAssembly) is included in the package. Neural voices downloaded from Hugging Face are model data (ONNX weights), not executable code.
```

**Data usage**

- Personal data collected: **none** (leave all boxes unchecked).
- Check the three certifications:
  - I do not sell or transfer user data to third parties, outside of the approved use cases.
  - I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**

```
https://github.com/AndresNG97/voxlate/blob/main/PRIVACY.md
```

---

## Images

| Asset | Size | Notes |
|---|---|---|
| Icon | 128×128 | `public/icon/128.png` |
| Screenshots | 1280×800 (or 640×400), 1 to 5 | Subtitles over a video, the dubbing tab, the Status tab… Use videos you have the rights to show. |
| Small promo tile | 440×280 | Required |
| Marquee promo tile | 1400×560 | Optional |
