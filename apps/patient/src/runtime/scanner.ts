/**
 * VARREDURA (scanning) com UM acionador.
 * O app acende, um por vez, cada LINHA de botões; a pessoa aciona e ele passa a acender cada
 * BOTÃO daquela linha; aciona de novo e o botão é escolhido. Assim dá para usar o app inteiro com
 * um único movimento: piscada, sobrancelha, boca, uma tecla/acionador USB (espaço/Enter) ou um sopro/som.
 * Serve para as fases da ELA em que o movimento da cabeça já não é preciso.
 */

type Level = 'rows' | 'items';

const SELECTOR = 'button:not([disabled]), a[href], [data-dwell]:not([aria-disabled="true"])';
const ROW_TOLERANCE = 18;

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return false;
  if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
  if (el.closest('[aria-hidden="true"], .la-sr-only')) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
}

/** se houver uma janela por cima (diálogo, emergência), só varre dentro dela */
function scope(): ParentNode {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="alertdialog"], [role="dialog"], [aria-modal="true"]')).filter((d) => d.getBoundingClientRect().width > 0);
  return dialogs[dialogs.length - 1] ?? document;
}

function collectRows(): HTMLElement[][] {
  const seen = new Set<HTMLElement>();
  const els = Array.from(scope().querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
    // um botão dentro de outro alvo conta uma vez só
    const outer = el.parentElement?.closest<HTMLElement>(SELECTOR);
    if (outer && outer !== el) return false;
    if (seen.has(el)) return false;
    seen.add(el);
    return visible(el);
  });
  const rows: Array<{ top: number; items: HTMLElement[] }> = [];
  for (const el of els) {
    const top = el.getBoundingClientRect().top;
    const row = rows.find((r) => Math.abs(r.top - top) <= ROW_TOLERANCE);
    if (row) row.items.push(el);
    else rows.push({ top, items: [el] });
  }
  rows.sort((a, b) => a.top - b.top);
  for (const r of rows) r.items.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  return rows.map((r) => r.items);
}

export class Scanner {
  private level: Level = 'rows';
  private rows: HTMLElement[][] = [];
  private ri = -1;
  private ii = -1;
  private loops = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lit: HTMLElement[] = [];
  private lastSelect = 0;
  stepMs = 1500;
  /** som curto a cada passo (ajuda quem enxerga pouco) */
  onStep: () => void = () => undefined;
  onSelect: () => void = () => undefined;

  get running() {
    return this.timer !== null;
  }

  start(stepMs = this.stepMs) {
    this.stepMs = stepMs;
    this.stop();
    this.reset();
    this.timer = setInterval(() => this.tick(), this.stepMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.light([]);
  }

  private reset() {
    this.level = 'rows';
    this.ri = -1;
    this.ii = -1;
    this.loops = 0;
  }

  private light(els: HTMLElement[]) {
    for (const el of this.lit) el.removeAttribute('data-scan');
    this.lit = els;
    els.forEach((el, i) => el.setAttribute('data-scan', i === 0 && els.length === 1 ? 'item' : 'row'));
    els[0]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  private tick(): void {
    if (this.level === 'rows') {
      this.rows = collectRows();
      if (!this.rows.length) return this.light([]);
      this.ri = (this.ri + 1) % this.rows.length;
      this.light(this.rows[this.ri]);
    } else {
      const row = this.rows[this.ri] ?? [];
      this.ii++;
      if (this.ii >= row.length) {
        this.ii = 0;
        // duas voltas na linha sem escolher → volta para as linhas
        if (++this.loops >= 2) {
          this.reset();
          return this.tick();
        }
      }
      if (!row[this.ii]?.isConnected) {
        this.reset();
        return this.tick();
      }
      this.light([row[this.ii]]);
    }
    this.onStep();
  }

  /** o acionador foi usado */
  select() {
    const now = Date.now();
    if (!this.running || now - this.lastSelect < 350) return;
    this.lastSelect = now;
    if (this.level === 'rows') {
      const row = this.rows[this.ri];
      if (!row?.length) return;
      if (row.length === 1) return this.press(row[0]);
      this.level = 'items';
      this.ii = -1;
      this.loops = 0;
      this.restartTimer();
      this.tick();
      return;
    }
    const el = this.rows[this.ri]?.[this.ii];
    if (el) this.press(el);
  }

  private press(el: HTMLElement) {
    this.onSelect();
    this.light([]);
    el.click();
    this.reset();
    // dá tempo da tela mudar antes de recomeçar
    this.restartTimer(this.stepMs * 1.3);
  }

  private restartTimer(firstDelay = this.stepMs) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setTimeout(() => {
      this.tick();
      this.timer = setInterval(() => this.tick(), this.stepMs);
    }, firstDelay) as unknown as ReturnType<typeof setInterval>;
  }
}

// ---------------------------------------------------------------------------------------------
/** Acionador por SOPRO ou SOM: o microfone percebe um som forte e curto. */
export class SoundSwitch {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private above = 0;
  private last = 0;
  threshold = 0.18;
  onTrigger: () => void = () => undefined;

  async start() {
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false } });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (rms > this.threshold) {
        this.above ||= now;
        if (now - this.above > 120 && now - this.last > 900) {
          this.last = now;
          this.onTrigger();
        }
      } else this.above = 0;
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.stream = null;
  }
}
