/**
 * Catálogo de voces de Piper por idioma (las más naturales de cada uno).
 * Cada voz se descarga una vez de Hugging Face (~60 MB) y queda guardada.
 */

export interface NeuralVoice {
  id: string;
  label: string;
}

const VOICES: Record<string, NeuralVoice[]> = {
  es: [
    { id: 'es_ES-davefx-medium', label: 'Dave (España)' },
    { id: 'es_ES-sharvard-medium', label: 'Sharvard (España)' },
    { id: 'es_MX-claude-high', label: 'Claude (México, alta calidad)' },
    { id: 'es_MX-ald-medium', label: 'Ald (México)' },
  ],
  en: [
    { id: 'en_US-lessac-medium', label: 'Lessac (EE. UU.)' },
    { id: 'en_US-hfc_female-medium', label: 'HFC mujer (EE. UU.)' },
    { id: 'en_US-ryan-medium', label: 'Ryan (EE. UU.)' },
    { id: 'en_GB-alan-medium', label: 'Alan (Reino Unido)' },
  ],
  fr: [
    { id: 'fr_FR-siwis-medium', label: 'Siwis' },
    { id: 'fr_FR-tom-medium', label: 'Tom' },
  ],
  de: [
    { id: 'de_DE-thorsten-medium', label: 'Thorsten' },
    { id: 'de_DE-eva_k-x_low', label: 'Eva' },
  ],
  it: [{ id: 'it_IT-riccardo-x_low', label: 'Riccardo' }],
  pt: [
    { id: 'pt_BR-faber-medium', label: 'Faber (Brasil)' },
    { id: 'pt_PT-tugão-medium', label: 'Tugão (Portugal)' },
  ],
  ca: [{ id: 'ca_ES-upc_ona-medium', label: 'Ona' }],
  nl: [{ id: 'nl_NL-mls-medium', label: 'MLS' }],
  pl: [{ id: 'pl_PL-gosia-medium', label: 'Gosia' }],
  ru: [{ id: 'ru_RU-irina-medium', label: 'Irina' }],
  uk: [{ id: 'uk_UA-ukrainian_tts-medium', label: 'Ukrainian TTS' }],
  tr: [{ id: 'tr_TR-fettah-medium', label: 'Fettah' }],
  zh: [{ id: 'zh_CN-huayan-medium', label: 'Huayan' }],
};

function baseLang(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0]!;
}

export function neuralVoicesFor(lang: string): NeuralVoice[] {
  return VOICES[baseLang(lang)] ?? [];
}

/** La voz pedida si es de ese idioma; si no, la recomendada (la primera). */
export function pickNeuralVoice(lang: string, preferred: string): string | undefined {
  const list = neuralVoicesFor(lang);
  return list.find((v) => v.id === preferred)?.id ?? list[0]?.id;
}
