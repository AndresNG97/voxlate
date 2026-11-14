/**
 * Canal entre el content script aislado (UI, ajustes, chrome.storage) y el
 * script en el MAIN world de YouTube (acceso al reproductor, a las peticiones
 * de subtítulos y a la Translator API de la página).
 */

import type { VoiceInterval } from '@/core/domain/timing';

export const AGENT = 'vt-agent';
export const CONTENT = 'vt-content';

/** Mensajes que manda el agente (MAIN world) → content script. */
export type AgentMessage =
  | { source: typeof AGENT; type: 'ready' }
  | {
      source: typeof AGENT;
      type: 'captions';
      videoId: string;
      lang: string;
      auto: boolean;
      /** URL original (con el token `pot`) para poder repedir con &tlang=xx. */
      url: string;
      body: string;
    }
  | { source: typeof AGENT; type: 'no-captions'; videoId: string }
  | { source: typeof AGENT; type: 'rpc-result'; id: number; ok: true; value: unknown }
  | { source: typeof AGENT; type: 'rpc-result'; id: number; ok: false; error: string }
  | { source: typeof AGENT; type: 'download-progress'; fraction: number }
  /** Tramos con voz detectados en el audio (opción de precisión), en la zona from-to (ms). */
  | { source: typeof AGENT; type: 'voice-activity'; from: number; to: number; intervals: VoiceInterval[] };

/** Llamadas que el content script hace al agente. */
export interface AgentRpc {
  /** Activa la pista de subtítulos en `lang` para forzar que YouTube la descargue. */
  enableCaptions: { args: { lang: string }; result: void };
  translatorStatus: { args: { from: string; to: string }; result: string };
  /** Debe llamarse justo después de un clic del usuario si hay que descargar el modelo. */
  prepareTranslator: { args: { from: string; to: string }; result: void };
  translate: { args: { texts: string[]; from: string; to: string }; result: string[] };
  /** Repide la pista con la traducción automática de YouTube (&tlang=). */
  fetchYoutubeTranslation: { args: { url: string; tlang: string }; result: string };
  /** Activa/desactiva el análisis del audio (opción de precisión). Devuelve si el navegador puede. */
  setVoiceAnalysis: { args: { enabled: boolean }; result: boolean };
}

export type RpcMethod = keyof AgentRpc;

export type ContentMessage = {
  source: typeof CONTENT;
  type: 'rpc';
  id: number;
  method: RpcMethod;
  args: unknown;
};

export function isAgentMessage(data: unknown): data is AgentMessage {
  return typeof data === 'object' && data !== null && (data as { source?: unknown }).source === AGENT;
}

export function isContentMessage(data: unknown): data is ContentMessage {
  return typeof data === 'object' && data !== null && (data as { source?: unknown }).source === CONTENT;
}
