import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

// Carpeta del paquete en node_modules (algunos, como onnxruntime-web, no
// exportan su package.json y no se pueden localizar con require.resolve).
const pkgDir = (name: string) => fileURLToPath(new URL(`./node_modules/${name}/`, import.meta.url));

/**
 * Motor ONNX y fonetizador de Piper (WASM). Se copian desde node_modules a la
 * extensión al compilar: así no se descarga código de internet (lo prohíbe la
 * Chrome Web Store) y no subimos ~30 MB de binarios a git.
 */
const VENDOR_FILES: [src: string, dest: string][] = [
  [join(pkgDir('onnxruntime-web'), 'dist/ort-wasm-simd-threaded.mjs'), 'vendor/ort/ort-wasm-simd-threaded.mjs'],
  [join(pkgDir('onnxruntime-web'), 'dist/ort-wasm-simd-threaded.wasm'), 'vendor/ort/ort-wasm-simd-threaded.wasm'],
  [join(pkgDir('@diffusionstudio/piper-wasm'), 'build/piper_phonemize.wasm'), 'vendor/piper/piper_phonemize.wasm'],
  [join(pkgDir('@diffusionstudio/piper-wasm'), 'build/piper_phonemize.data'), 'vendor/piper/piper_phonemize.data'],
  // Detector de voz Silero VAD v5 (MIT) para la sincronía de precisión.
  [join(pkgDir('@ricky0123/vad-web'), 'dist/silero_vad_v5.onnx'), 'vendor/silero/silero_vad_v5.onnx'],
];

// Docs: https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Voxlate — Subtítulos traducidos y doblaje',
    short_name: 'Voxlate',
    description: 'Traduce en tiempo real los subtítulos y el audio de los vídeos a tu idioma.',
    // tts: doblaje con las voces del sistema (no muestra aviso al instalar).
    permissions: ['storage', 'tabCapture', 'offscreen', 'activeTab', 'scripting', 'tts'],
    // Solo YouTube de forma permanente. Para el resto de webs el modo audio
    // usa activeTab (permiso temporal al abrir el popup), así la revisión de la
    // Chrome Web Store es mucho más sencilla.
    host_permissions: ['https://www.youtube.com/*'],
  },
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      for (const [absoluteSrc, relativeDest] of VENDOR_FILES) files.push({ absoluteSrc, relativeDest });
    },
  },
});
