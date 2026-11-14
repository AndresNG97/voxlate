import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

const root = fileURLToPath(new URL('.', import.meta.url));

// Carpeta del paquete en node_modules (algunos, como onnxruntime-web, no
// exportan su package.json y no se pueden localizar con require.resolve).
const pkgDir = (name: string) => join(root, 'node_modules', name);

/** Variables de los .env (los mismos que WXT carga para el código de la extensión). */
function readEnvFiles(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...(process.env as Record<string, string>) };
}
const ENV = readEnvFiles();

/**
 * Modo audio (beta): traduce el audio de cualquier pestaña con Deepgram. Está
 * APAGADO por defecto: la versión gratuita no lo necesita y necesita una clave
 * o un backend de tokens. Con WXT_LIVE_MODE=true se incluye (y pide más permisos).
 */
const LIVE_MODE = ENV.WXT_LIVE_MODE === 'true';

/**
 * Motor ONNX, fonetizador de Piper (WASM) y modelo Silero. Se copian desde
 * node_modules a la extensión al compilar: así no se descarga código de
 * internet (lo prohíbe la Chrome Web Store) y no subimos ~30 MB a git.
 */
const VENDOR_FILES: [src: string, dest: string][] = [
  [join(pkgDir('onnxruntime-web'), 'dist/ort-wasm-simd-threaded.mjs'), 'vendor/ort/ort-wasm-simd-threaded.mjs'],
  [join(pkgDir('onnxruntime-web'), 'dist/ort-wasm-simd-threaded.wasm'), 'vendor/ort/ort-wasm-simd-threaded.wasm'],
  [join(pkgDir('@diffusionstudio/piper-wasm'), 'build/piper_phonemize.wasm'), 'vendor/piper/piper_phonemize.wasm'],
  [join(pkgDir('@diffusionstudio/piper-wasm'), 'build/piper_phonemize.data'), 'vendor/piper/piper_phonemize.data'],
  // Detector de voz Silero VAD v5 (MIT) para la sincronía de precisión.
  [join(pkgDir('@ricky0123/vad-web'), 'dist/silero_vad_v5.onnx'), 'vendor/silero/silero_vad_v5.onnx'],
];

/** Archivos de texto de la build (para buscar secretos que no deberían estar ahí). */
function textFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return textFiles(path);
    return /\.(m?js|html|json|css)$/.test(name) ? [path] : [];
  });
}

// Docs: https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Nombre y resumen traducidos: public/_locales/<idioma>/messages.json.
    // Chrome y la Chrome Web Store muestran el del idioma del usuario (inglés por defecto).
    name: '__MSG_extName__',
    short_name: 'Voxlate',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // El traductor local de Chrome (Translator API) existe desde Chrome 138.
    minimum_chrome_version: '138',
    // storage: ajustes y traducciones guardadas · offscreen: voz neuronal y
    // detector de voz · tts: voces del sistema (no muestra aviso al instalar).
    // El modo audio añade tabCapture + activeTab + scripting (capturar e
    // inyectar el overlay solo en la pestaña que el usuario elige).
    permissions: [
      'storage',
      'offscreen',
      'tts',
      ...(LIVE_MODE ? (['tabCapture', 'activeTab', 'scripting'] as const) : []),
    ],
    host_permissions: ['https://www.youtube.com/*'],
    // La voz neuronal (Piper) y el detector de voz (Silero) corren en WebAssembly:
    // sin 'wasm-unsafe-eval' ONNX Runtime falla con "no available backend found".
    // Solo permite compilar WASM empaquetado en la extensión (no permite eval de JS).
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  // Constante de compilación: sin modo audio, su código (Deepgram) se elimina de la build.
  vite: () => ({ define: { __LIVE_MODE__: JSON.stringify(LIVE_MODE) } }),
  hooks: {
    // Sin modo audio, fuera también su overlay y su worklet de captura.
    'entrypoints:resolved': (_wxt, entrypoints) => {
      if (LIVE_MODE) return;
      const i = entrypoints.findIndex((e) => e.name === 'live-overlay');
      if (i >= 0) entrypoints.splice(i, 1);
    },
    'build:publicAssets': (_wxt, files) => {
      if (!LIVE_MODE) {
        const i = files.findIndex((f) => f.relativeDest === 'pcm-worklet.js');
        if (i >= 0) files.splice(i, 1);
      }
      for (const [absoluteSrc, relativeDest] of VENDOR_FILES) files.push({ absoluteSrc, relativeDest });
    },
    // Freno de seguridad: una build de producción NUNCA puede llevar la clave
    // de Deepgram (cualquiera podría sacarla de la extensión). Si aparece, falla.
    'build:done': (wxt) => {
      if (wxt.config.command !== 'build' || wxt.config.mode !== 'production') return;
      const secrets = [ENV.WXT_DEEPGRAM_DEV_KEY].filter((s): s is string => !!s && s.length >= 8);
      for (const file of textFiles(wxt.config.outDir)) {
        const content = readFileSync(file, 'utf8');
        if (secrets.some((s) => content.includes(s))) {
          throw new Error(
            `La build de producción contiene la clave de Deepgram (${file.replace(root, '')}). ` +
              'Quita WXT_DEEPGRAM_DEV_KEY de .env.local o usa WXT_STT_TOKEN_URL (backend de tokens).',
          );
        }
      }
    },
  },
});
