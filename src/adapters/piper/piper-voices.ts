/**
 * Catálogo de voces de Piper por idioma (las más naturales de cada uno).
 * Cada voz se descarga una vez de Hugging Face (~60 MB) y queda guardada.
 */
import { regionName, t } from '@/i18n';

export interface NeuralVoice {
  id: string;
  /** Nombre corto ("Dave"). */
  name: string;
  /** Nombre para mostrar, en el idioma de la interfaz ("Dave (España)" / "Dave (Spain)"). */
  label: string;
}

interface VoiceDef {
  id: string;
  name: string;
  /** País (ISO 3166) cuando el idioma tiene variantes: "ES", "MX"… */
  region?: string;
  /** Modelo "high" (mejor calidad, más pesado). */
  hq?: boolean;
  female?: boolean;
}

function v(d: VoiceDef): NeuralVoice {
  const name = d.female ? `${d.name} (${t.voice.female})` : d.name;
  const extra = [d.region && regionName(d.region), d.hq && t.voice.highQuality].filter(Boolean).join(", ");
  return { id: d.id, name: d.name, label: extra ? `${name} (${extra})` : name };
}

// Las etiquetas se calculan al pedirlas: así siguen el idioma de la interfaz si cambia.
const VOICES: Record<string, VoiceDef[]> = {
  es: [
    { id: 'es_ES-davefx-medium', name: 'Dave', region: 'ES' },
    { id: 'es_ES-sharvard-medium', name: 'Sharvard', region: 'ES' },
    { id: 'es_MX-claude-high', name: 'Claude', region: 'MX', hq: true },
    { id: 'es_MX-ald-medium', name: 'Ald', region: 'MX' },
  ],
  en: [
    { id: 'en_US-lessac-medium', name: 'Lessac', region: 'US' },
    { id: 'en_US-hfc_female-medium', name: 'HFC', region: 'US', female: true },
    { id: 'en_US-ryan-medium', name: 'Ryan', region: 'US' },
    { id: 'en_GB-alan-medium', name: 'Alan', region: 'GB' },
  ],
  fr: [
    { id: 'fr_FR-siwis-medium', name: 'Siwis' },
    { id: 'fr_FR-tom-medium', name: 'Tom' },
  ],
  de: [
    { id: 'de_DE-thorsten-medium', name: 'Thorsten' },
    { id: 'de_DE-eva_k-x_low', name: 'Eva' },
  ],
  it: [{ id: 'it_IT-riccardo-x_low', name: 'Riccardo' }],
  pt: [
    { id: 'pt_BR-faber-medium', name: 'Faber', region: 'BR' },
    { id: 'pt_PT-tugão-medium', name: 'Tugão', region: 'PT' },
  ],
  ca: [{ id: 'ca_ES-upc_ona-medium', name: 'Ona' }],
  nl: [{ id: 'nl_NL-mls-medium', name: 'MLS' }],
  pl: [{ id: 'pl_PL-gosia-medium', name: 'Gosia' }],
  ru: [{ id: 'ru_RU-irina-medium', name: 'Irina' }],
  uk: [{ id: 'uk_UA-ukrainian_tts-medium', name: 'Ukrainian TTS' }],
  tr: [{ id: 'tr_TR-fettah-medium', name: 'Fettah' }],
  zh: [{ id: 'zh_CN-huayan-medium', name: 'Huayan' }],
};

function baseLang(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0]!;
}

export function neuralVoicesFor(lang: string): NeuralVoice[] {
  return (VOICES[baseLang(lang)] ?? []).map(v);
}

/** Nombre legible de una voz por su id (o el id si no está en el catálogo). */
export function neuralVoiceLabel(id: string): string {
  for (const list of Object.values(VOICES)) {
    const def = list.find((x) => x.id === id);
    if (def) return v(def).label;
  }
  return id;
}

/** La voz pedida si es de ese idioma; si no, la recomendada (la primera). */
export function pickNeuralVoice(lang: string, preferred: string): string | undefined {
  const list = VOICES[baseLang(lang)] ?? [];
  return list.find((d) => d.id === preferred)?.id ?? list[0]?.id;
}
