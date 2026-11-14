/**
 * Adaptador de VoiceActivityPort en el content script: guarda los tramos de voz
 * que el agente (MAIN world) va detectando en el audio de YouTube y enviando.
 */
import type { VoiceInterval } from '@/core/domain/timing';
import type { VoiceActivityPort } from '@/core/ports/voice-activity';

export class VoiceActivityStore implements VoiceActivityPort {
  /** Zona analizada (ms) y sus tramos con voz. */
  private covered: { from: number; to: number } | null = null;
  private list: VoiceInterval[] = [];

  update(from: number, to: number, intervals: VoiceInterval[]) {
    this.covered = { from, to };
    this.list = intervals;
  }

  clear() {
    this.covered = null;
    this.list = [];
  }

  intervals(fromMs: number, toMs: number): VoiceInterval[] {
    if (!this.covered || toMs < this.covered.from || fromMs > this.covered.to) return [];
    return this.list.filter((v) => v.end > fromMs && v.start < toMs);
  }
}
