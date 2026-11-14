/** Mensajes chrome.runtime entre popup, background, offscreen y content scripts. */
import type { LiveStatus } from '@/core/application/live-transcription';
import type { PrepareRequest, SpeakRequest } from '@/core/ports/speech-synthesizer';

export type { LiveStatus };

export type RuntimeMessage =
  // popup → background
  | { type: 'live:start'; tabId: number; streamId: string }
  | { type: 'live:stop' }
  | { type: 'live:get-status' }
  // background → offscreen
  | { type: 'offscreen:start'; target: 'offscreen'; streamId: string; tabId: number; from: string; to: string }
  | { type: 'offscreen:stop'; target: 'offscreen' }
  // background → offscreen: ¿ya ha cargado su código? (responde true)
  | { type: 'offscreen:ping'; target: 'offscreen' }
  // offscreen → background
  | { type: 'live:status'; status: LiveStatus; tabId: number; error?: string }
  | { type: 'live:transcript'; tabId: number; original: string; translated: string; isFinal: boolean }
  // background → overlay del modo audio (en la pestaña)
  | { type: 'live:caption'; original: string; translated: string; isFinal: boolean }
  | { type: 'live:overlay-status'; status: LiveStatus; error?: string }
  // content script → background: doblaje con chrome.tts (respuesta: SpeakResult)
  | ({ type: 'tts:speak' } & SpeakRequest)
  | { type: 'tts:stop' }
  | { type: 'tts:pause' }
  | { type: 'tts:resume' }
  // voz neuronal (Piper) en el offscreen document
  | { type: 'neural:ensure' } // content/popup → background: crea el offscreen si hace falta
  | { type: 'neural:prepare'; target: 'offscreen'; req: PrepareRequest } // → PreparedSpeech | { error }
  | { type: 'neural:speak'; target: 'offscreen'; req: SpeakRequest } // → SpeakResult
  | { type: 'neural:stop' | 'neural:pause' | 'neural:resume'; target: 'offscreen' }
  | { type: 'neural:progress'; fraction: number }; // offscreen → popup: descarga de la voz

export interface LiveState {
  status: LiveStatus;
  tabId: number | null;
  error?: string;
}

export function sendRuntime(msg: RuntimeMessage): void {
  browser.runtime.sendMessage(msg).catch(() => {});
}
