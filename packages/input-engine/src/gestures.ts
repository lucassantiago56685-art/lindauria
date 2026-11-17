/**
 * Detecção de gestos faciais a partir dos 52 blendshapes do MediaPipe.
 *
 * Cada gesto é "segurar uma expressão" por um tempo: fechar os olhos, levantar sobrancelhas,
 * abrir a boca. Usamos histerese (limiar de entrada > limiar de saída) para não piscar o estado,
 * e um tempo mínimo E máximo: piscadas naturais (100–300 ms) são ignoradas, e olhos fechados por
 * muito tempo (cochilo, descanso) também não contam.
 *
 * O evento dispara quando a pessoa SOLTA o gesto (abre os olhos). Isso evita que um cochilo
 * de olhos fechados dispare qualquer coisa.
 */

export type Blendshapes = Record<string, number>;

export interface HoldGestureConfig {
  name: string;
  /** blendshapes combinados com "min" (todos precisam estar ativos) */
  shapes: string[];
  onThreshold: number;
  offThreshold: number;
  minMs: number;
  maxMs: number;
}

export const GESTURE_PRESETS = {
  longBlink: (minMs = 700, threshold = 0.45): HoldGestureConfig => ({
    name: 'longBlink',
    shapes: ['eyeBlinkLeft', 'eyeBlinkRight'],
    onThreshold: threshold,
    offThreshold: threshold * 0.7,
    minMs,
    maxMs: Math.max(minMs + 1500, 3000),
  }),
  browRaise: (minMs = 500): HoldGestureConfig => ({
    name: 'browRaise',
    shapes: ['browInnerUp'],
    onThreshold: 0.55,
    offThreshold: 0.35,
    minMs,
    maxMs: 3000,
  }),
  mouthOpen: (minMs = 600): HoldGestureConfig => ({
    name: 'mouthOpen',
    shapes: ['jawOpen'],
    onThreshold: 0.5,
    offThreshold: 0.3,
    minMs,
    maxMs: 3000,
  }),
};

export type HoldPhase = 'idle' | 'holding' | 'ready';

export class HoldGestureDetector {
  private active = false;
  private since = 0;
  constructor(public config: HoldGestureConfig) {}

  /** score combinado (mínimo entre os blendshapes do gesto) */
  score(bs: Blendshapes): number {
    let m = Infinity;
    for (const s of this.config.shapes) m = Math.min(m, bs[s] ?? 0);
    return m === Infinity ? 0 : m;
  }

  /**
   * @returns true no quadro em que um gesto válido é concluído (soltou dentro da janela).
   */
  update(bs: Blendshapes | null, t: number): boolean {
    if (!bs) {
      // rosto perdido: cancela qualquer gesto em andamento
      this.active = false;
      return false;
    }
    const v = this.score(bs);
    if (!this.active) {
      if (v >= this.config.onThreshold) {
        this.active = true;
        this.since = t;
      }
      return false;
    }
    if (v <= this.config.offThreshold) {
      this.active = false;
      const dur = t - this.since;
      return dur >= this.config.minMs && dur <= this.config.maxMs;
    }
    return false;
  }

  /** Para feedback visual: 'holding' enquanto segura, 'ready' quando já passou do tempo mínimo. */
  phase(t: number): HoldPhase {
    if (!this.active) return 'idle';
    const dur = t - this.since;
    if (dur > this.config.maxMs) return 'idle';
    return dur >= this.config.minMs ? 'ready' : 'holding';
  }

  reset() {
    this.active = false;
  }
}

/**
 * Detecta N repetições de um gesto dentro de uma janela de tempo.
 * Ex.: 3 piscadas longas em até 8 s = emergência.
 */
export class SequenceDetector {
  private hits: number[] = [];
  constructor(
    public count = 3,
    public windowMs = 8000,
  ) {}

  /** registra uma ocorrência; retorna true quando completou a sequência */
  hit(t: number): boolean {
    this.hits = this.hits.filter((h) => t - h <= this.windowMs);
    this.hits.push(t);
    if (this.hits.length >= this.count) {
      this.hits = [];
      return true;
    }
    return false;
  }

  /** quantas já foram contadas na janela atual (para mostrar "1 de 3") */
  progress(t: number): number {
    return this.hits.filter((h) => t - h <= this.windowMs).length;
  }

  reset() {
    this.hits = [];
  }
}
