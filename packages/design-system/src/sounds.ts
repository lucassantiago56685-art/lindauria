import { getAudioContext } from '@lindauria/shared';

/**
 * Design sonoro da interface, sintetizado (sem arquivos, funciona offline).
 *  - foco: "respiração" grave e curtinha quando o cursor mira um botão
 *  - clique: "cristal" — duas notas agudas que somem rápido
 *  - enviado: duas notas subindo (frase falada / mensagem enviada)
 *  - erro: nota descendo, suave
 * O alarme de emergência é outro som, propositalmente diferente (ver @lindauria/safety).
 */

export interface UiVolumes {
  focus: number;
  click: number;
  sent: number;
}

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine', endFreq?: number) {
  const ctx = getAudioContext();
  if (!ctx || vol <= 0) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export class UiSounds {
  constructor(public volumes: UiVolumes = { focus: 0.25, click: 0.5, sent: 0.5 }) {}

  focus() {
    tone(520, 0, 0.09, 0.08 * this.volumes.focus, 'sine', 610);
  }
  click() {
    const v = 0.16 * this.volumes.click;
    tone(1568, 0, 0.18, v, 'sine');
    tone(2349, 0.025, 0.22, v * 0.6, 'sine');
  }
  sent() {
    const v = 0.16 * this.volumes.sent;
    tone(784, 0, 0.16, v, 'triangle');
    tone(1175, 0.12, 0.26, v, 'triangle');
  }
  error() {
    tone(440, 0, 0.25, 0.12 * this.volumes.click, 'triangle', 300);
  }
}
