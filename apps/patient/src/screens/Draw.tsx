import { useCallback, useEffect, useRef, useState } from 'react';
import { GlowButton } from '@lindauria/design-system';
import { secureGet, secureSet } from '@lindauria/shared';
import { dwell, sounds } from '../runtime/engine';
import { ConfirmDialog, ScreenShell } from '../components/common';

/* =============================================================================================
   Desenhar / escrever à mão.
   - COM A CABEÇA: ligue "Caneta" e mova a seta dentro do quadro — ela desenha. Ao sair do quadro
     (para apertar um botão), a caneta para de riscar sozinha.
   - COM O DEDO/MOUSE: é só desenhar no quadro.
   O desenho fica SALVO (criptografado) e só some quando a pessoa aperta "Apagar tudo".
   ============================================================================================= */

interface Stroke {
  color: string;
  width: number; // relativo à largura do quadro (0..1)
  points: Array<[number, number]>; // 0..1
}

const KEY = 'drawing';
const COLORS = [
  { value: '#F1F5FF', label: 'Branco' },
  { value: '#5EEAFF', label: 'Azul' },
  { value: '#F0ABFC', label: 'Rosa' },
  { value: '#FCD34D', label: 'Amarelo' },
  { value: '#4ADE80', label: 'Verde' },
  { value: '#FF4D6D', label: 'Vermelho' },
];
const WIDTHS = [
  { value: 0.004, label: 'Fina' },
  { value: 0.009, label: 'Média' },
  { value: 0.018, label: 'Grossa' },
];

export function Draw() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [penDown, setPenDown] = useState(false); // caneta pela cabeça
  const [color, setColor] = useState(COLORS[1].value);
  const [width, setWidth] = useState(WIDTHS[1].value);
  const [count, setCount] = useState(0); // força re-render dos botões
  const [confirmClear, setConfirmClear] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void secureSet(KEY, strokes.current), 500);
    setCount(strokes.current.length);
  }, []);

  /** redesenha tudo (ao abrir, ao redimensionar, ao desfazer) */
  const redraw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = current.current ? [...strokes.current, current.current] : strokes.current;
    for (const s of all) {
      if (!s.points.length) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1.5, s.width * c.width);
      ctx.beginPath();
      const [x0, y0] = s.points[0];
      ctx.moveTo(x0 * c.width, y0 * c.height);
      if (s.points.length === 1) ctx.lineTo(x0 * c.width + 0.1, y0 * c.height);
      // curva suave entre pontos (tira o "tremido" da cabeça)
      for (let i = 1; i < s.points.length - 1; i++) {
        const [x1, y1] = s.points[i];
        const [x2, y2] = s.points[i + 1];
        ctx.quadraticCurveTo(x1 * c.width, y1 * c.height, ((x1 + x2) / 2) * c.width, ((y1 + y2) / 2) * c.height);
      }
      const last = s.points[s.points.length - 1];
      ctx.lineTo(last[0] * c.width, last[1] * c.height);
      ctx.stroke();
    }
  }, []);

  // carrega o desenho salvo
  useEffect(() => {
    void secureGet<Stroke[]>(KEY).then((s) => {
      strokes.current = s ?? [];
      setCount(strokes.current.length);
      setLoaded(true);
      redraw();
    });
    const ro = new ResizeObserver(redraw);
    if (canvas.current) ro.observe(canvas.current);
    return () => ro.disconnect();
  }, [redraw]);

  const toLocal = (x: number, y: number): [number, number] | null => {
    const r = canvas.current?.getBoundingClientRect();
    if (!r) return null;
    const px = (x - r.left) / r.width;
    const py = (y - r.top) / r.height;
    if (px < 0 || px > 1 || py < 0 || py > 1) return null;
    return [px, py];
  };

  const addPoint = useCallback(
    (p: [number, number]) => {
      if (!current.current) current.current = { color, width, points: [] };
      const pts = current.current.points;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.002) pts.push(p);
      redraw();
    },
    [color, width, redraw],
  );

  const endStroke = useCallback(() => {
    if (current.current && current.current.points.length) {
      strokes.current.push(current.current);
      save();
    }
    current.current = null;
  }, [save]);

  // ---- caneta pela CABEÇA: segue a seta enquanto estiver dentro do quadro ----
  useEffect(() => {
    if (!penDown) return;
    return dwell.subscribe((s) => {
      const p = s.visible ? toLocal(s.x, s.y) : null;
      if (p) addPoint(p);
      else endStroke(); // saiu do quadro (foi apertar um botão): para de riscar
    });
  }, [penDown, addPoint, endStroke]);

  // ---- dedo / mouse ----
  const drawing = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    drawing.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toLocal(e.clientX, e.clientY);
    if (p) addPoint(p);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = toLocal(e.clientX, e.clientY);
    if (p) addPoint(p);
  };
  const onUp = () => {
    drawing.current = false;
    endStroke();
  };

  return (
    <ScreenShell icon="✏️" title="Desenhar e escrever" subtitle="o desenho fica salvo até você apagar">
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* quadro */}
        <div className="la-glass relative min-h-[40vh] flex-1 overflow-hidden p-0" style={{ borderColor: penDown ? 'var(--primary)' : undefined, background: 'color-mix(in srgb, var(--bg-deep) 70%, var(--bg-surface))' }}>
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Quadro de desenho com ${count} traços`}
            className="absolute inset-0 h-full w-full"
            style={{ touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
          />
          {loaded && count === 0 && !penDown && (
            <p className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-[1.1em]" style={{ color: 'var(--text-secondary)' }}>
              Desenhe aqui com o dedo, o mouse — ou ligue a ✏️ Caneta e desenhe com a cabeça.
            </p>
          )}
          {penDown && (
            <span className="la-glass pointer-events-none absolute left-3 top-3 px-3 py-1 text-[0.8em] font-bold" style={{ color: 'var(--primary-text)' }}>
              ✏️ Caneta ligada: a seta desenha dentro do quadro
            </span>
          )}
        </div>

        {/* ferramentas (fora do quadro: ir até elas não risca nada) */}
        <div className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-6 lg:w-[30%] lg:grid-cols-2 lg:content-start">
          <GlowButton
            tone={penDown ? 'success' : 'primary'}
            aria-pressed={penDown}
            icon="✏️"
            label={penDown ? 'Caneta ligada' : 'Ligar caneta'}
            hint="desenhar com a cabeça"
            className="col-span-3 min-h-[3.6em] text-[0.95em] sm:col-span-2 lg:col-span-2"
            onClick={() => {
              endStroke();
              setPenDown((v) => !v);
              dwell.disarm();
            }}
          />
          {COLORS.map((c) => (
            <GlowButton
              key={c.value}
              tone="neutral"
              aria-pressed={color === c.value}
              aria-label={`Cor ${c.label}`}
              label={<span className="inline-block h-6 w-6 rounded-full" style={{ background: c.value, border: '2px solid var(--bg-deep)' }} />}
              hint={c.label}
              className="text-[0.75em]"
              onClick={() => setColor(c.value)}
            />
          ))}
          {WIDTHS.map((w) => (
            <GlowButton key={w.value} tone="neutral" aria-pressed={width === w.value} label={w.label} hint="espessura" className="text-[0.75em]" onClick={() => setWidth(w.value)} />
          ))}
          <GlowButton
            tone="warning"
            icon="↩️"
            label="Desfazer"
            disabled={!count}
            className="text-[0.8em]"
            onClick={() => {
              strokes.current.pop();
              save();
              redraw();
            }}
          />
          <GlowButton tone="danger" icon="🗑️" label="Apagar tudo" disabled={!count} className="col-span-2 text-[0.8em] lg:col-span-2" onClick={() => setConfirmClear(true)} />
        </div>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Apagar todo o desenho?"
          message="Isso não pode ser desfeito."
          confirmLabel="Sim, apagar"
          cancelLabel="Não"
          danger
          onConfirm={() => {
            strokes.current = [];
            current.current = null;
            save();
            redraw();
            sounds.click();
            setConfirmClear(false);
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </ScreenShell>
  );
}
