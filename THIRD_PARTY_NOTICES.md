# Third-party notices

Voxlate is released under the **GPL v3 or later** (see [LICENSE](LICENSE)). The
extension includes or downloads the components below, each under its own license.

## Included in the extension

These files are part of the package installed from the Chrome Web Store.

| Component | Version | License | What it's used for | Location |
|---|---|---|---|---|
| [espeak-ng](https://github.com/rhasspy/espeak-ng) (rhasspy fork) and its language data | the one bundled with piper-wasm 1.0.0 | GPL-3.0-or-later | Converts text into phonemes for the neural voice | Compiled into `vendor/piper/piper_phonemize.wasm` and `.data` |
| [piper-phonemize](https://github.com/rhasspy/piper-phonemize) | the one bundled with piper-wasm 1.0.0 | MIT | espeak-ng wrapper for Piper | Inside `vendor/piper/piper_phonemize.wasm` |
| [@diffusionstudio/piper-wasm](https://github.com/diffusion-studio/piper-wasm) | 1.0.0 | MIT | WebAssembly build of the above | `vendor/piper/` |
| [@mintplex-labs/piper-tts-web](https://github.com/Mintplex-Labs/piper-tts-web) | 1.0.5 (patched, see below) | MIT | Runs Piper voices in the browser | Bundled in the extension code |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (Microsoft) | 1.20.1 | MIT | Engine that runs the neural voice and the voice detector | Extension code and `vendor/ort/` |
| [Silero VAD v5](https://github.com/snakers4/silero-vad) (Silero Team) | v5 | MIT | Detects when the person is speaking (precision sync) | `vendor/silero/silero_vad_v5.onnx`, taken from the [@ricky0123/vad-web](https://github.com/ricky0123/vad) package (ISC) |
| [React](https://github.com/facebook/react) and React DOM (Meta) | 19.3 | MIT | Settings window (popup) | Bundled in the extension code |
| [WXT](https://github.com/wxt-dev/wxt) | 0.21 | MIT | Build tool (leaves a small amount of startup code) | Bundled in the extension code |

### espeak-ng source code (GPL)

espeak-ng is GPL, so its source code must be available to anyone who receives the
extension:

- espeak-ng source used: <https://github.com/rhasspy/espeak-ng>
- How it is compiled to WebAssembly (script in the README):
  <https://github.com/diffusion-studio/piper-wasm>
- Voxlate's source code is at <https://github.com/AndresNG97/voxlate>.

### Changes to piper-tts-web

`patches/@mintplex-labs__piper-tts-web@1.0.5.patch` makes two changes:

- adds `lengthScaleFactor` to `predict()` so the voice speed can be changed;
- removes the default CDN paths (cdnjs and jsDelivr), because the extension uses
  its own local files.

### MIT license text

The MIT components above are distributed with this notice. Each belongs to its
authors ("Copyright (c) <year> <authors>", as stated in its repository):

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

## Neural voices (downloaded separately)

Piper voices are **not included in the extension**. They are downloaded from
Hugging Face ([diffusionstudio/piper-voices](https://huggingface.co/diffusionstudio/piper-voices),
a copy of [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices))
when you choose one, and are stored only on your computer. Each voice carries the
license of the data it was trained on. The data below comes from each voice's card
(`MODEL_CARD`) in rhasspy/piper-voices.

| Voice | License on the card | Commercial use allowed? |
|---|---|---|
| es_ES-davefx-medium | CC0 | Yes |
| es_ES-sharvard-medium | CC BY 3.0 | Yes, with attribution |
| es_MX-claude-high | Apache-2.0 | Yes |
| es_MX-ald-medium | Unlicense | Yes |
| en_US-lessac-medium | [Blizzard 2013 custom license](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html) | **To be checked** |
| en_US-hfc_female-medium | CC BY-NC-SA 4.0 | **No** |
| en_US-ryan-medium | CC BY-NC-SA 4.0 | **No** |
| en_GB-alan-medium | [See the mimic3-voices card](https://github.com/MycroftAI/mimic3-voices/blob/master/voices/en_UK/apope_low) | **To be checked** |
| fr_FR-siwis-medium | CC BY 4.0 | Yes, with attribution |
| fr_FR-tom-medium | AGPL-3.0 | Yes, under copyleft terms |
| de_DE-thorsten-medium | CC0 | Yes |
| de_DE-eva_k-x_low | [M-AILABS](https://www.caito.de/2019/01/03/the-m-ailabs-speech-dataset/) | **To be checked** |
| it_IT-riccardo-x_low | [M-AILABS](https://www.caito.de/2019/01/03/the-m-ailabs-speech-dataset/) | **To be checked** |
| pt_BR-faber-medium | CC0 | Yes |
| pt_PT-tugão-medium | CC0 | Yes |
| ca_ES-upc_ona-medium | CC BY-SA 3.0 ES | Yes, with attribution and share-alike |
| nl_NL-mls-medium | CC BY 4.0 | Yes, with attribution |
| pl_PL-gosia-medium | CC0 | Yes |
| ru_RU-irina-medium | Unknown (RHVoice) | **To be checked** |
| uk_UA-ukrainian_tts-medium | CC0 | Yes |
| tr_TR-fettah-medium | Card not found | **To be checked** |
| zh_CN-huayan-medium | Unknown (HuaYan_TTS) | **To be checked** |

Voxlate is free and sells nothing, so all of them can be offered today. If there is
ever a paid version, the voices marked **No** or **To be checked** will have to be
removed or replaced.

## Services used by the browser

- **Chrome's Translator API**: translates on your computer. Chrome downloads and
  manages the language model.
- **System voices (`chrome.tts`)**: provided by your operating system or by Chrome,
  each under its own terms.
