/** Detalles del DOM de YouTube: el reproductor, su <video> y los subtítulos nativos. */

const PLAYER_ID = 'movie_player';

export function isWatchPage(): boolean {
  return location.pathname === '/watch';
}

export function currentVideoId(): string {
  return new URLSearchParams(location.search).get('v') ?? '';
}

export interface YoutubePlayer {
  container: HTMLElement;
  video: HTMLVideoElement;
}

export async function waitForPlayer(timeoutMs = 10000): Promise<YoutubePlayer | null> {
  const container = await waitFor(() => document.getElementById(PLAYER_ID), timeoutMs);
  const video = await waitFor(() => container?.querySelector('video'), timeoutMs);
  return container && video ? { container, video } : null;
}

/** La barra de controles está visible (YouTube añade .ytp-autohide cuando se esconde). */
export function controlsVisible(container: HTMLElement): boolean {
  return !container.classList.contains('ytp-autohide');
}

const hideNativeStyle = document.createElement('style');
hideNativeStyle.textContent = '.ytp-caption-window-container{display:none!important}';

export function setNativeCaptionsHidden(hidden: boolean) {
  if (hidden) document.documentElement.appendChild(hideNativeStyle);
  else hideNativeStyle.remove();
}

/** YouTube es una SPA: este evento salta en cada cambio de vídeo. */
export const NAVIGATE_EVENT = 'yt-navigate-finish';

async function waitFor<T>(get: () => T | null | undefined, timeoutMs: number): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = get();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
