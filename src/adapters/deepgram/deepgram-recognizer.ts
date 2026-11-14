/** Adaptador de SpeechRecognizerPort sobre Deepgram (WebSocket nova-3, parciales + finales). */
import type { RecognitionSession, SpeechRecognizerPort } from '@/core/ports/speech-recognizer';

/**
 * Credencial para abrir el WebSocket.
 * - Producción: tu backend (p. ej. el gateway en Rust) llama a Deepgram
 *   `POST /v1/auth/grant` y devuelve un token temporal → protocolo 'bearer'.
 * - Desarrollo: API key en .env.local → protocolo 'token'. NUNCA en una build pública.
 */
async function getCredential(): Promise<{ scheme: 'bearer' | 'token'; value: string }> {
  const tokenUrl = import.meta.env.WXT_STT_TOKEN_URL as string | undefined;
  if (tokenUrl) {
    const res = await fetch(tokenUrl, { method: 'POST' });
    if (!res.ok) throw new Error(`Token STT: HTTP ${res.status}`);
    const { access_token } = (await res.json()) as { access_token: string };
    return { scheme: 'bearer', value: access_token };
  }
  const devKey = import.meta.env.WXT_DEEPGRAM_DEV_KEY as string | undefined;
  if (devKey) return { scheme: 'token', value: devKey };
  throw new Error('Falta WXT_STT_TOKEN_URL (o WXT_DEEPGRAM_DEV_KEY en desarrollo). Mira .env.example');
}

interface DeepgramResult {
  type?: string;
  is_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
}

export const deepgramRecognizer: SpeechRecognizerPort = {
  async connect({ language, onTranscript, onError, onOpen, onClose }) {
    const cred = await getCredential();
    const params = new URLSearchParams({
      model: 'nova-3',
      language,
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      // Corta frases antes en pausas cortas → subtítulos más ágiles.
      endpointing: '300',
    });
    // En navegador no se pueden poner cabeceras al WebSocket: Deepgram acepta
    // la credencial como subprotocolo.
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, [cred.scheme, cred.value]);
    ws.binaryType = 'arraybuffer';

    const queue: ArrayBuffer[] = [];
    let keepAlive: ReturnType<typeof setInterval> | undefined;

    ws.onopen = () => {
      queue.splice(0).forEach((c) => ws.send(c));
      // Si el vídeo está en pausa no llega audio; Deepgram corta a los ~10 s.
      keepAlive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"KeepAlive"}'), 5000);
      onOpen();
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const msg = JSON.parse(e.data) as DeepgramResult;
      if (msg.type !== 'Results') return;
      const text = msg.channel?.alternatives?.[0]?.transcript ?? '';
      if (text) onTranscript({ text, isFinal: !!msg.is_final });
    };
    ws.onerror = () => onError(new Error('Error en la conexión con Deepgram'));
    ws.onclose = () => {
      clearInterval(keepAlive);
      onClose();
    };

    const session: RecognitionSession = {
      sendAudio(chunk) {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
        else if (ws.readyState === WebSocket.CONNECTING && queue.length < 50) queue.push(chunk);
      },
      close() {
        clearInterval(keepAlive);
        if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"CloseStream"}');
        setTimeout(() => ws.close(), 500);
      },
    };
    return session;
  },
};
