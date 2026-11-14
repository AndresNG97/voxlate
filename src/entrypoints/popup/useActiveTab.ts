import { useEffect, useState } from 'react';

/** Id de la pestaña activa si es de YouTube; si no, null. */
export async function activeYoutubeTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    return tab?.id != null && tab.url && /(^|\.)youtube\.com$/.test(new URL(tab.url).hostname) ? tab.id : null;
  } catch {
    return null; // URL rara
  }
}

/** ¿La pestaña activa es de YouTube? (para enseñar opciones que solo funcionan ahí) */
export function useIsYoutubeTab(): boolean {
  const [isYoutube, setIsYoutube] = useState(false);
  useEffect(() => {
    activeYoutubeTabId().then((id) => setIsYoutube(id !== null));
  }, []);
  return isYoutube;
}
