import { ALARM_MIN_VOLUME, getAudioContext } from '@lindauria/shared';

/**
 * Alarme de emergência sintetizado na hora (Web Audio): não depende de arquivo, de rede nem de
 * carregamento. Som de sirene inconfundível, diferente de todos os sons da interface:
 * duas notas alternando (estilo "hi-lo") com harmônico para atravessar paredes.
 */
export class Siren {
  private nodes: { osc: OscillatorNode[]; gain: GainNode; lfo: OscillatorNode } | null = null;
  private fallback: HTMLAudioElement | null = null;

  get active() {
    return this.nodes !== null || this.fallback !== null;
  }

  start(volume = 1): boolean {
    if (this.active) return true;
    const vol = Math.max(ALARM_MIN_VOLUME, Math.min(1, volume));
    const ctx = getAudioContext();
    if (ctx) {
      try {
        const gain = ctx.createGain();
        gain.gain.value = 0.35 * vol;
        gain.connect(ctx.destination);
        // LFO quadrado alterna a frequência entre ~650 e ~950 Hz, 2x por segundo
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 1.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 150;
        lfo.connect(lfoGain);
        const osc: OscillatorNode[] = [];
        for (const [type, base] of [
          ['sawtooth', 800],
          ['square', 1600],
        ] as const) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = base;
          lfoGain.connect(o.frequency);
          const g = ctx.createGain();
          g.gain.value = type === 'square' ? 0.25 : 0.6;
          o.connect(g).connect(gain);
          o.start();
          osc.push(o);
        }
        lfo.start();
        this.nodes = { osc, gain, lfo };
        return true;
      } catch (err) {
        console.warn('[siren] Web Audio falhou, usando fallback', err);
      }
    }
    // fallback: WAV gerado em memória
    try {
      this.fallback = new Audio(makeSirenWav());
      this.fallback.loop = true;
      this.fallback.volume = vol;
      void this.fallback.play();
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    if (this.nodes) {
      for (const o of this.nodes.osc) o.stop();
      this.nodes.lfo.stop();
      this.nodes.gain.disconnect();
      this.nodes = null;
    }
    if (this.fallback) {
      this.fallback.pause();
      this.fallback = null;
    }
  }
}

/** Gera 1,2 s de sirene em WAV (data URI) para navegadores sem Web Audio. */
function makeSirenWav(): string {
  const rate = 22050;
  const n = Math.floor(rate * 1.25);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = (i / rate) % 0.625 < 0.3125 ? 650 : 950;
    phase += (2 * Math.PI * f) / rate;
    v.setInt16(44 + i * 2, Math.sin(phase) > 0 ? 9000 : -9000, true);
  }
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
