import { defineConfig } from 'wxt';

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
});
