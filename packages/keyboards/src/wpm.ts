/**
 * Medidor de palavras por minuto (padrão da área: 1 palavra = 5 caracteres).
 * Considera só o tempo ATIVO: pausas maiores que `idleMs` não contam (a pessoa descansou).
 */
export class WpmMeter {
  private chars = 0;
  private activeMs = 0;
  private lastT: number | null = null;

  constructor(private idleMs = 15_000) {}

  /** registra n caracteres inseridos no instante t (ms) */
  add(n: number, t: number) {
    if (this.lastT !== null) {
      const gap = t - this.lastT;
      if (gap < this.idleMs) this.activeMs += gap;
    }
    this.lastT = t;
    this.chars += n;
  }

  get wpm(): number {
    if (this.activeMs < 5000) return 0;
    return this.chars / 5 / (this.activeMs / 60_000);
  }

  reset() {
    this.chars = 0;
    this.activeMs = 0;
    this.lastT = null;
  }
}
