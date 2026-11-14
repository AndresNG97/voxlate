/**
 * Descompositor (demuxer) WebM en streaming, mínimo: saca los paquetes de audio
 * (SimpleBlock/Block) con su instante absoluto en ms. Es lo que YouTube mete en
 * el SourceBuffer de audio (Opus en WebM, itag 251), troceado de cualquier forma:
 * un cluster puede llegar partido en varias entregas, así que guardamos lo que
 * sobra y seguimos cuando llega más. Si empezamos a mitad de flujo (opción
 * activada con el vídeo en marcha), nos sincronizamos con el siguiente Cluster.
 */

export interface EncodedFrame {
  timestampMs: number;
  data: Uint8Array;
}

const ID = {
  EBML: 0x1a45dfa3,
  SEGMENT: 0x18538067,
  INFO: 0x1549a966,
  TIMECODE_SCALE: 0x2ad7b1,
  CLUSTER: 0x1f43b675,
  CLUSTER_TIMECODE: 0xe7,
  SIMPLE_BLOCK: 0xa3,
  BLOCK_GROUP: 0xa0,
  BLOCK: 0xa1,
} as const;

/** Elementos en los que "entramos" en vez de saltarlos. */
const CONTAINERS = new Set<number>([ID.SEGMENT, ID.INFO, ID.CLUSTER, ID.BLOCK_GROUP]);
const CLUSTER_MAGIC = [0x1f, 0x43, 0xb6, 0x75];
/** Más de esto pendiente sin poder avanzar = algo va mal: resincronizamos. */
const MAX_PENDING = 4 * 1024 * 1024;

export class WebmOpusDemuxer {
  private buf: Uint8Array = new Uint8Array(0);
  private synced = false;
  private clusterTimecode = 0;
  /** Nanosegundos por unidad de timecode (WebM por defecto: 1 ms). */
  private timecodeScaleNs = 1_000_000;

  push(chunk: Uint8Array): EncodedFrame[] {
    this.buf = concat(this.buf, chunk);
    const frames: EncodedFrame[] = [];
    let p = 0;

    if (!this.synced) {
      // Un flujo completo empieza por la cabecera EBML; si no, buscamos un Cluster.
      const start = readId(this.buf, 0)?.v === ID.EBML ? 0 : indexOfMagic(this.buf, CLUSTER_MAGIC, 0);
      if (start < 0) {
        this.keepTail(Math.max(0, this.buf.length - 3));
        return frames;
      }
      p = start;
      this.synced = true;
    }

    while (p < this.buf.length) {
      const id = readId(this.buf, p);
      const size = id && readSize(this.buf, p + id.len);
      if (!id || !size) break; // cabecera incompleta: esperamos más datos
      const dataStart = p + id.len + size.len;

      if (CONTAINERS.has(id.v)) {
        p = dataStart; // entramos: sus hijos vienen a continuación
        continue;
      }
      if (size.unknown || dataStart + size.v > this.buf.length) break; // cuerpo incompleto

      const body = this.buf.subarray(dataStart, dataStart + size.v);
      if (id.v === ID.CLUSTER_TIMECODE) this.clusterTimecode = readUint(body);
      else if (id.v === ID.TIMECODE_SCALE) this.timecodeScaleNs = readUint(body) || 1_000_000;
      else if (id.v === ID.SIMPLE_BLOCK || id.v === ID.BLOCK) {
        const track = readSize(body, 0);
        if (track && body.length > track.len + 3) {
          const rel = (body[track.len]! << 24) >> 16 | body[track.len + 1]!; // int16 con signo
          const ms = ((this.clusterTimecode + rel) * this.timecodeScaleNs) / 1_000_000;
          frames.push({ timestampMs: ms, data: body.slice(track.len + 3) });
        }
      }
      p = dataStart + size.v;
    }

    this.keepTail(p);
    if (this.buf.length > MAX_PENDING) {
      this.buf = new Uint8Array(0);
      this.synced = false;
    }
    return frames;
  }

  /** Tras un salto en el vídeo los datos ya no siguen: empezamos de cero. */
  reset() {
    this.buf = new Uint8Array(0);
    this.synced = false;
  }

  private keepTail(from: number) {
    this.buf = this.buf.slice(from);
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.length) return b.slice();
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function indexOfMagic(b: Uint8Array, magic: number[], from: number): number {
  for (let i = from; i <= b.length - magic.length; i++) {
    if (magic.every((m, k) => b[i + k] === m)) return i;
  }
  return -1;
}

/** ID de elemento EBML (se conserva el bit marcador). */
function readId(b: Uint8Array, p: number): { v: number; len: number } | null {
  const first = b[p];
  if (first === undefined) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 4 && !(first & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 4 || p + len > b.length) return null;
  let v = first;
  for (let i = 1; i < len; i++) v = v * 256 + b[p + i]!;
  return { v, len };
}

/** Tamaño EBML (vint sin marcador). `unknown` = tamaño indefinido (streaming). */
function readSize(b: Uint8Array, p: number): { v: number; len: number; unknown: boolean } | null {
  const first = b[p];
  if (first === undefined) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 8 || p + len > b.length) return null;
  let v = first & (mask - 1);
  let allOnes = v === mask - 1;
  for (let i = 1; i < len; i++) {
    v = v * 256 + b[p + i]!;
    if (b[p + i] !== 0xff) allOnes = false;
  }
  return { v, len, unknown: allOnes };
}

function readUint(b: Uint8Array): number {
  let v = 0;
  for (const x of b) v = v * 256 + x;
  return v;
}
