/**
 * Núcleo do "dwell": selecionar um alvo mantendo o cursor parado sobre ele.
 *
 * Regras de segurança (critério "zero cliques acidentais com a pessoa parada"):
 *  1. REARME: depois de um clique, nada mais é clicado até o cursor andar `rearmPx` pixels.
 *     Assim, quando uma tela nova aparece embaixo do cursor parado, ela não é clicada sozinha.
 *  2. O motor começa DESARMADO: a pessoa precisa se mexer antes do primeiro clique.
 *  3. TOLERÂNCIA DE SAÍDA: se o cursor escapa do botão para uma área vazia por menos de
 *     `graceMs` (tremor) e volta, o progresso continua em vez de zerar.
 */

export interface DwellOptions {
  dwellMs: number;
  rearmPx: number;
  graceMs: number;
}

export interface DwellUpdate<T> {
  target: T | null;
  /** 0..1 */
  progress: number;
  armed: boolean;
  fired: T | null;
  /** true no quadro em que o alvo atual mudou (para o som de "foco") */
  focusChanged: boolean;
}

export class DwellTracker<T> {
  private current: T | null = null;
  private start = 0;
  private lostAt: number | null = null;
  private armed = false;
  private anchor: { x: number; y: number } | null = null;

  constructor(public opts: DwellOptions = { dwellMs: 1200, rearmPx: 40, graceMs: 150 }) {}

  /** Desarma até o cursor andar `rearmPx` (ao trocar de tela, ao voltar do descanso...). */
  disarm(x?: number, y?: number) {
    this.armed = false;
    this.anchor = x === undefined || y === undefined ? null : { x, y };
  }

  get isArmed() {
    return this.armed;
  }

  /**
   * @param hit alvo sob o cursor (ou null)
   * @param dwellMs tempo específico deste alvo (ex.: "Cancelar alarme" pede mais tempo)
   * @param repeat se true, o alvo dispara de novo a cada `dwellMs` enquanto o cursor
   *               continua nele (ex.: botões de rolar a tela). Sem precisar rearmar.
   */
  update(
    hit: T | null,
    x: number,
    y: number,
    t: number,
    dwellMs = this.opts.dwellMs,
    repeat = false,
  ): DwellUpdate<T> {
    // 1) rearme por movimento
    if (!this.armed) {
      if (this.anchor === null) this.anchor = { x, y };
      else if (Math.hypot(x - this.anchor.x, y - this.anchor.y) >= this.opts.rearmPx) {
        this.armed = true;
        this.anchor = null;
        this.start = t; // o tempo conta a partir do rearme
      }
    }

    // 2) qual é o alvo atual (com tolerância a tremor)
    let focusChanged = false;
    if (hit === this.current) {
      this.lostAt = null;
    } else if (hit !== null) {
      this.current = hit;
      this.start = t;
      this.lostAt = null;
      focusChanged = true;
    } else {
      this.lostAt ??= t;
      if (t - this.lostAt > this.opts.graceMs) {
        this.current = null;
        this.lostAt = null;
        focusChanged = true;
      }
    }

    const target = this.current;
    if (target === null || !this.armed) {
      return { target, progress: 0, armed: this.armed, fired: null, focusChanged };
    }

    // 3) progresso e disparo
    const progress = Math.min(1, Math.max(0, (t - this.start) / dwellMs));
    if (progress >= 1) {
      if (repeat) {
        this.start = t;
        return { target, progress: 1, armed: true, fired: target, focusChanged };
      }
      this.disarm(x, y);
      return { target, progress: 1, armed: false, fired: target, focusChanged };
    }
    return { target, progress, armed: true, fired: null, focusChanged };
  }

  reset() {
    this.current = null;
    this.lostAt = null;
  }
}
