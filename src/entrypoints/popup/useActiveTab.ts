import { useEffect, useState } from 'react';

/** ¿La pestaña activa es un vídeo de YouTube? (para enseñar opciones que solo funcionan ahí) */
export function useIsYoutubeTab(): boolean {
  const [isYoutube, setIsYoutube] = useState(false);
  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      try {
        setIsYoutube(!!tab?.url && /(^|\.)youtube\.com$/.test(new URL(tab.url).hostname));
      } catch {
        setIsYoutube(false);
      }
    });
  }, []);
  return isYoutube;
}
