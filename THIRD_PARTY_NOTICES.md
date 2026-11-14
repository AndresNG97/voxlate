# Avisos de terceros

Voxlate se publica bajo la **GPL v3 o posterior** (ver [LICENSE](LICENSE)). La
extensión incluye o descarga los componentes de abajo, cada uno con su propia
licencia.

## Incluidos en la extensión

Estos archivos van dentro del paquete que se instala desde la Chrome Web Store.

| Componente | Versión | Licencia | Para qué se usa | Origen |
|---|---|---|---|---|
| [espeak-ng](https://github.com/rhasspy/espeak-ng) (fork de rhasspy) y sus datos de idiomas | el que incluye piper-wasm 1.0.0 | GPL-3.0-or-later | Convierte el texto en fonemas para la voz neuronal | Va compilado dentro de `vendor/piper/piper_phonemize.wasm` y `.data` |
| [piper-phonemize](https://github.com/rhasspy/piper-phonemize) | el que incluye piper-wasm 1.0.0 | MIT | Envoltorio de espeak-ng para Piper | Dentro de `vendor/piper/piper_phonemize.wasm` |
| [@diffusionstudio/piper-wasm](https://github.com/diffusion-studio/piper-wasm) | 1.0.0 | MIT | Compilación a WebAssembly de lo anterior | `vendor/piper/` |
| [@mintplex-labs/piper-tts-web](https://github.com/Mintplex-Labs/piper-tts-web) | 1.0.5 (con parche, ver abajo) | MIT | Ejecuta las voces de Piper en el navegador | Va en el código de la extensión |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (Microsoft) | 1.20.1 | MIT | Motor que ejecuta la voz neuronal y el detector de voz | Código de la extensión y `vendor/ort/` |
| [Silero VAD v5](https://github.com/snakers4/silero-vad) (Silero Team) | v5 | MIT | Detecta cuándo habla la persona (sincronía de precisión) | `vendor/silero/silero_vad_v5.onnx`, sacado del paquete [@ricky0123/vad-web](https://github.com/ricky0123/vad) (ISC) |
| [React](https://github.com/facebook/react) y React DOM (Meta) | 19.3 | MIT | Ventana de ajustes (popup) | Código de la extensión |
| [WXT](https://github.com/wxt-dev/wxt) | 0.21 | MIT | Herramienta de compilación (deja un poco de código de arranque) | Código de la extensión |

### Código fuente de espeak-ng (GPL)

espeak-ng es GPL, así que su código fuente tiene que estar disponible para quien
reciba la extensión:

- Código de espeak-ng usado: <https://github.com/rhasspy/espeak-ng>
- Cómo se compila a WebAssembly (script en el README):
  <https://github.com/diffusion-studio/piper-wasm>
- El código de Voxlate está en <https://github.com/AndresNG97/voxlate>.

### Cambios sobre piper-tts-web

`patches/@mintplex-labs__piper-tts-web@1.0.5.patch` hace dos cambios:

- añade `lengthScaleFactor` a `predict()` para poder cambiar la velocidad de la voz;
- quita las rutas por defecto a CDN (cdnjs y jsDelivr), porque la extensión usa
  sus propios archivos locales.

### Texto de la licencia MIT

Los componentes MIT de arriba se distribuyen con este aviso. Cada uno pertenece a
sus autores ("Copyright (c) <año> <autores>", tal y como aparece en su repositorio):

> Permission is hereby granted, free of charge, to any person obtaining a copy of
> this software and associated documentation files (the "Software"), to deal in
> the Software without restriction, including without limitation the rights to
> use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
> the Software, and to permit persons to whom the Software is furnished to do so,
> subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
> FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
> AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
> WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Voces neuronales (se descargan aparte)

Las voces de Piper **no van dentro de la extensión**. Se descargan de Hugging Face
([diffusionstudio/piper-voices](https://huggingface.co/diffusionstudio/piper-voices),
copia de [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices))
cuando eliges una, y se guardan solo en tu equipo. Cada voz tiene la licencia de
los datos con los que se entrenó. Los datos de abajo salen de la ficha
(`MODEL_CARD`) de cada voz en rhasspy/piper-voices.

| Voz | Licencia de la ficha | ¿Permite uso comercial? |
|---|---|---|
| es_ES-davefx-medium | CC0 | Sí |
| es_ES-sharvard-medium | CC BY 3.0 | Sí, citando la fuente |
| es_MX-claude-high | Apache-2.0 | Sí |
| es_MX-ald-medium | Unlicense | Sí |
| en_US-lessac-medium | [Licencia propia de Blizzard 2013](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html) | **Por revisar** |
| en_US-hfc_female-medium | CC BY-NC-SA 4.0 | **No** |
| en_US-ryan-medium | CC BY-NC-SA 4.0 | **No** |
| en_GB-alan-medium | [Ver la ficha de mimic3-voices](https://github.com/MycroftAI/mimic3-voices/blob/master/voices/en_UK/apope_low) | **Por revisar** |
| fr_FR-siwis-medium | CC BY 4.0 | Sí, citando la fuente |
| fr_FR-tom-medium | AGPL-3.0 | Sí, con condiciones copyleft |
| de_DE-thorsten-medium | CC0 | Sí |
| de_DE-eva_k-x_low | [M-AILABS](https://www.caito.de/2019/01/03/the-m-ailabs-speech-dataset/) | **Por revisar** |
| it_IT-riccardo-x_low | [M-AILABS](https://www.caito.de/2019/01/03/the-m-ailabs-speech-dataset/) | **Por revisar** |
| pt_BR-faber-medium | CC0 | Sí |
| pt_PT-tugão-medium | CC0 | Sí |
| ca_ES-upc_ona-medium | CC BY-SA 3.0 ES | Sí, citando y compartiendo igual |
| nl_NL-mls-medium | CC BY 4.0 | Sí, citando la fuente |
| pl_PL-gosia-medium | CC0 | Sí |
| ru_RU-irina-medium | Desconocida (RHVoice) | **Por revisar** |
| uk_UA-ukrainian_tts-medium | CC0 | Sí |
| tr_TR-fettah-medium | No se encontró la ficha | **Por revisar** |
| zh_CN-huayan-medium | Desconocida (HuaYan_TTS) | **Por revisar** |

Voxlate es gratis y no vende nada, así que hoy todas se pueden ofrecer. Si algún
día hay una versión de pago, habrá que quitar o cambiar las voces marcadas con
**No** o **Por revisar**.

## Servicios que usa el navegador

- **Translator API de Chrome**: traduce en tu equipo. Chrome descarga y gestiona el
  modelo de idioma.
- **Voces del sistema (`chrome.tts`)**: las da tu sistema operativo o Chrome, cada
  una con sus propias condiciones.
