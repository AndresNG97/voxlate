/**
 * Voces de Piper descargadas. La librería las guarda en el almacenamiento
 * privado de la extensión (OPFS, carpeta "piper"), ~60 MB cada una, y nunca las
 * borra. Aquí llevamos la cuenta de cuándo se usó cada voz y conservamos como
 * mucho MAX_STORED_VOICES (la que se usa y la anterior); las demás se borran.
 *
 * Funciona en cualquier página de la extensión (offscreen, popup): todas
 * comparten el mismo OPFS. No usa chrome.storage porque el offscreen document
 * no tiene acceso a él.
 */
import { remove } from '@mintplex-labs/piper-tts-web';

export const MAX_STORED_VOICES = 2;
const DIR = 'piper';
/** Fichero propio con la última vez que se usó cada voz. */
const USAGE_FILE = 'voxlate-usage.json';

export interface StoredVoice {
  id: string;
  bytes: number;
  /** Última vez que se usó (ms), si lo sabemos. */
  lastUsed: number | null;
}

type DirHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function piperDir(): Promise<DirHandle> {
  const root = await navigator.storage.getDirectory();
  return (await root.getDirectoryHandle(DIR, { create: true })) as DirHandle;
}

async function readUsage(): Promise<Record<string, number>> {
  try {
    const file = await (await piperDir()).getFileHandle(USAGE_FILE);
    return JSON.parse(await (await file.getFile()).text()) as Record<string, number>;
  } catch {
    return {};
  }
}

async function writeUsage(usage: Record<string, number>) {
  const file = await (await piperDir()).getFileHandle(USAGE_FILE, { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(usage));
  await writable.close();
}

/** Voces descargadas con su tamaño, de la más reciente a la más antigua. */
export async function listStoredVoices(): Promise<StoredVoice[]> {
  const dir = await piperDir();
  const usage = await readUsage();
  const sizes = new Map<string, number>();
  // Cada voz son dos ficheros: <voz>.onnx y <voz>.onnx.json
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file' || !name.includes('.onnx')) continue;
    const id = name.split('.onnx')[0]!;
    const size = (await (handle as FileSystemFileHandle).getFile()).size;
    sizes.set(id, (sizes.get(id) ?? 0) + size);
  }
  return [...sizes]
    .map(([id, bytes]) => ({ id, bytes, lastUsed: usage[id] ?? null }))
    .sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));
}

export async function removeStoredVoice(id: string): Promise<void> {
  await remove(id);
  const usage = await readUsage();
  delete usage[id];
  await writeUsage(usage);
}

/**
 * Apunta que `id` se acaba de usar y borra las voces que sobran (las menos
 * recientes), dejando como mucho MAX_STORED_VOICES. Devuelve las borradas.
 */
export async function markUsedAndPrune(id: string): Promise<string[]> {
  const usage = await readUsage();
  usage[id] = Date.now();
  await writeUsage(usage);
  const others = (await listStoredVoices()).filter((v) => v.id !== id);
  const extra = others.slice(MAX_STORED_VOICES - 1);
  for (const v of extra) await removeStoredVoice(v.id);
  return extra.map((v) => v.id);
}
