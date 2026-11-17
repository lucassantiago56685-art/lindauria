import { DwellTracker } from './dwell';
import type { PointerSample } from './providers';

/**
 * Liga o DwellTracker ao DOM.
 *
 * Qualquer elemento com o atributo `data-dwell` vira alvo. Atributos opcionais:
 *  - data-dwell-ms="3000"  → tempo próprio (ex.: cancelar alarme, sair do descanso)
 *  - data-dwell-repeat     → repete enquanto o cursor fica em cima (ex.: rolar a tela)
 *
 * O motor escreve no alvo:
 *  - data-dwell-state="aim" | "fired"  → estilos de mira / ativado
 *  - --dwell-progress (0..1)            → anel/borda de progresso
 *  - --prox (0..1)                      → "brilho reativo" quando o cursor se aproxima
 */

export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  progress: number;
  armed: boolean;
  hasTarget: boolean;
}

export interface DwellEngineOptions {
  dwellMs: number;
  rearmPx: number;
  onFocus?: (el: HTMLElement) => void;
  onSelect?: (el: HTMLElement) => void;
}

const PROX_RADIUS = 220;
/** já mirando: só solta o botão quando a seta sai mais que isso da borda (tremor não tira a mira) */
const STICKY_PX = 24;
/** ímã: se a seta está perto de um botão (sem estar em cima de nenhum), ele é escolhido */
const MAGNET_PX = 30;

const distToRect = (r: DOMRect, x: number, y: number) =>
  Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));

const isUsable = (t: HTMLElement) =>
  t.isConnected && !(t as HTMLButtonElement).disabled && t.getAttribute('aria-disabled') !== 'true';

/** o botão está visível (não coberto por um diálogo/alarme aberto por cima)? */
function isOnTop(t: HTMLElement, r: DOMRect) {
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!top && t.contains(top);
}

export class DwellEngine {
  private tracker: DwellTracker<HTMLElement>;
  private listeners = new Set<(s: CursorState) => void>();
  private current: HTMLElement | null = null;
  private targets: HTMLElement[] = [];
  private targetsAt = 0;
  private proxSet = new Set<HTMLElement>();
  private last: PointerSample = { x: 0, y: 0, visible: false, t: 0 };
  enabled = true;

  constructor(public opts: DwellEngineOptions) {
    this.tracker = new DwellTracker({ dwellMs: opts.dwellMs, rearmPx: opts.rearmPx, graceMs: 150 });
    // clique físico (mouse/toque) também desarma: evita clique duplo (físico + dwell)
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.isTrusted) this.tracker.disarm(e.clientX, e.clientY);
      },
      { capture: true },
    );
  }

  configure(dwellMs: number, rearmPx: number) {
    this.opts.dwellMs = dwellMs;
    this.opts.rearmPx = rearmPx;
    this.tracker.opts = { ...this.tracker.opts, dwellMs, rearmPx };
  }

  subscribe(cb: (s: CursorState) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Força o rearme (ex.: ao abrir/fechar um alarme ou voltar do descanso). */
  disarm() {
    this.tracker.disarm(this.last.x, this.last.y);
  }

  /** Seleção por gesto: clica no alvo sob o cursor agora, sem esperar o dwell. */
  selectCurrent(): boolean {
    const el = this.current;
    if (!el || !this.last.visible) return false;
    this.fire(el);
    this.tracker.disarm(this.last.x, this.last.y);
    return true;
  }

  private hitTest(x: number, y: number): HTMLElement | null {
    // 1) histerese: mantém o alvo atual enquanto a seta estiver perto dele
    const cur = this.current;
    if (cur && isUsable(cur)) {
      const r = cur.getBoundingClientRect();
      if (distToRect(r, x, y) <= STICKY_PX && isOnTop(cur, r)) return cur;
    }
    // 2) acerto direto
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const direct = el?.closest<HTMLElement>('[data-dwell]') ?? null;
    if (direct) return isUsable(direct) ? direct : null;
    // 3) ímã: o botão mais próximo, se estiver bem pertinho e visível
    let best: HTMLElement | null = null;
    let bestD = MAGNET_PX;
    for (const t of this.targets) {
      if (!isUsable(t)) continue;
      const r = t.getBoundingClientRect();
      const d = distToRect(r, x, y);
      if (d < bestD && isOnTop(t, r)) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  private refreshTargets(t: number) {
    if (t - this.targetsAt < 300) return;
    this.targetsAt = t;
    this.targets = Array.from(document.querySelectorAll<HTMLElement>('[data-dwell]'));
  }

  private setCurrent(el: HTMLElement | null) {
    if (el === this.current) return;
    if (this.current) {
      this.current.removeAttribute('data-dwell-state');
      this.current.style.removeProperty('--dwell-progress');
    }
    this.current = el;
    if (el) {
      el.setAttribute('data-dwell-state', 'aim');
      this.opts.onFocus?.(el);
    }
  }

  private fire(el: HTMLElement) {
    el.setAttribute('data-dwell-state', 'fired');
    setTimeout(() => {
      if (el.getAttribute('data-dwell-state') === 'fired') el.setAttribute('data-dwell-state', 'aim');
    }, 350);
    this.opts.onSelect?.(el);
    el.click();
  }

  private updateProximity(x: number, y: number, visible: boolean) {
    const next = new Set<HTMLElement>();
    if (visible) {
      for (const el of this.targets) {
        const r = el.getBoundingClientRect();
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d < PROX_RADIUS) {
          el.style.setProperty('--prox', (1 - d / PROX_RADIUS).toFixed(2));
          next.add(el);
        }
      }
    }
    for (const el of this.proxSet) if (!next.has(el)) el.style.removeProperty('--prox');
    this.proxSet = next;
  }

  /** Chamado a cada amostra do provedor de entrada. */
  feed(p: PointerSample) {
    this.last = p;
    const t = p.t;
    this.refreshTargets(t);
    const hit = p.visible && this.enabled ? this.hitTest(p.x, p.y) : null;
    const ms = Number(hit?.dataset.dwellMs) || this.opts.dwellMs;
    const repeat = hit?.dataset.dwellRepeat !== undefined;
    const u = this.tracker.update(hit, p.x, p.y, t, ms, repeat);

    this.setCurrent(u.target && u.target.isConnected ? u.target : null);
    if (this.current) this.current.style.setProperty('--dwell-progress', u.progress.toFixed(3));
    if (u.fired && u.fired.isConnected) this.fire(u.fired);
    this.updateProximity(p.x, p.y, p.visible);

    const state: CursorState = {
      x: p.x,
      y: p.y,
      visible: p.visible,
      progress: u.progress,
      armed: u.armed,
      hasTarget: !!this.current,
    };
    for (const l of this.listeners) l(state);
  }
}
