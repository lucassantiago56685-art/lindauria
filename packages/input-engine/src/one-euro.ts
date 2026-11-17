/**
 * One Euro Filter (Casiez, Roussel & Vogel, CHI 2012).
 *
 * Suaviza muito quando a cabeça está quase parada (tira o tremor) e quase nada quando ela se
 * move rápido (sem atraso). É o filtro ideal para cursor por cabeça.
 *  - minCutoff: menor = mais suave parado.
 *  - beta: maior = responde mais rápido a movimentos grandes.
 */

class LowPass {
  private y: number | null = null;
  get last() {
    return this.y;
  }
  filter(x: number, alpha: number) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  reset() {
    this.y = null;
  }
}

const alpha = (rate: number, cutoff: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  const te = 1 / rate;
  return 1 / (1 + tau / te);
};

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT: number | null = null;

  constructor(
    public minCutoff = 1.0,
    public beta = 0.01,
    public dCutoff = 1.0,
  ) {}

  /** @param tMs tempo em milissegundos */
  filter(value: number, tMs: number): number {
    if (this.lastT === null) {
      this.lastT = tMs;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max((tMs - this.lastT) / 1000, 1e-3);
    this.lastT = tMs;
    const rate = 1 / dt;
    const prev = this.x.last ?? value;
    const edx = this.dx.filter((value - prev) * rate, alpha(rate, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(rate, cutoff));
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastT = null;
  }
}

/** Converte o controle "suavidade" (0..1) da interface em parâmetros do filtro. */
export function smoothingToParams(smoothing: number) {
  const s = Math.min(1, Math.max(0, smoothing));
  // 0 → minCutoff 4 Hz (quase sem filtro), 1 → 0.8 Hz (bem estável parado).
  // beta alto: em movimentos rápidos o filtro "abre" e o cursor acompanha a cabeça sem atraso.
  const minCutoff = 4 * Math.pow(0.2, s);
  return { minCutoff, beta: 0.03 };
}
