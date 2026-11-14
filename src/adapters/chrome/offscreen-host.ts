/**
 * El offscreen document es único por extensión: lo comparten el modo audio
 * (captura de la pestaña) y la voz neuronal (Piper). Solo el background puede crearlo.
 *
 * Ojo: createDocument() resuelve cuando el documento existe, no cuando su
 * código ha terminado de cargar (en desarrollo llega desde localhost y tarda).
 * Por eso, antes de usarlo, esperamos a que conteste a un ping.
 */
import type { RuntimeMessage } from './messages';

const OFFSCREEN_PATH = '/offscreen.html';
const READY_TIMEOUT_MS = 15_000;
const PING_EVERY_MS = 100;

let creating: Promise<void> | null = null;

export async function hasOffscreen(): Promise<boolean> {
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType],
  });
  return contexts.length > 0;
}

/** Crea el offscreen si no existe y espera a que esté listo. Devuelve false si no arranca. */
export async function ensureOffscreen(): Promise<boolean> {
  if (!(await hasOffscreen())) {
    // Evita crearlo dos veces si llegan dos peticiones a la vez.
    creating ??= browser.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK', 'WORKERS'] as Browser.offscreen.Reason[],
        justification:
          'Capturar el audio de la pestaña para traducirlo (modo audio) y generar y reproducir la voz del doblaje.',
      })
      .finally(() => {
        creating = null;
      });
    await creating;
  }
  return waitUntilReady();
}

async function waitUntilReady(): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await browser.runtime
      .sendMessage({ type: 'offscreen:ping', target: 'offscreen' } satisfies RuntimeMessage)
      .catch(() => false);
    if (ready === true) return true;
    await new Promise((r) => setTimeout(r, PING_EVERY_MS));
  }
  return false;
}
