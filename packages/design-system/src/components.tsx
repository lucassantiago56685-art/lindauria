import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

/* =============================================================================================
   Componentes do Neural Aurora. Todos acessíveis por: cabeça (dwell), toque, mouse e teclado.
   ============================================================================================= */

export type Tone = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------------------------
export function AuroraBackground() {
  return (
    <div className="la-aurora" aria-hidden="true">
      <div className="la-aurora__blob" />
      <div className="la-aurora__blob" />
      <div className="la-aurora__blob" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function GlassCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('la-glass', className)} {...rest} />;
}

// ---------------------------------------------------------------------------------------------
export interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  icon?: ReactNode;
  label?: ReactNode;
  hint?: ReactNode;
  /** tempo de dwell específico (ms). Ex.: ações perigosas pedem mais tempo. */
  dwellMs?: number;
  /** false = não pode ser selecionado por dwell (só toque/clique) */
  dwell?: boolean;
}

/**
 * Botão com 5 estados: repouso → aproximação (--prox) → mira → progresso (anel) → ativado.
 * Os estados de mira/progresso são escritos pelo DwellEngine via atributos.
 */
export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(function GlowButton(
  { tone = 'primary', icon, label, hint, dwellMs, dwell = true, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('la-btn', `la-tone-${tone}`, className)}
      data-dwell={dwell ? '' : undefined}
      data-dwell-ms={dwellMs}
      {...rest}
    >
      {icon && (
        <span className="la-btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {label && <span className="la-btn__label">{label}</span>}
      {hint && <span className="la-btn__hint">{hint}</span>}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------------------------
export function EmergencyPulse({ className, label = 'Emergência', ...rest }: GlowButtonProps) {
  return (
    <GlowButton
      tone="danger"
      icon="🆘"
      label={label}
      aria-label="Emergência: chamar ajuda"
      className={cx('la-emergency', className)}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------------------------
export interface CursorStateLike {
  x: number;
  y: number;
  visible: boolean;
  progress: number;
  armed: boolean;
  hasTarget: boolean;
}

/**
 * Cursor em forma de orbe de luz com rastro. Ao mirar num alvo, vira um anel de progresso.
 * Atualizado direto no DOM (sem re-render do React) para manter 60 fps.
 */
export function OrbCursor({
  subscribe,
  variant = 'orb',
}: {
  subscribe: (cb: (s: CursorStateLike) => void) => () => void;
  /** orb = orbe de luz; arrow = seta (a ponta é o ponto exato que escolhe) */
  variant?: 'orb' | 'arrow';
}) {
  const orb = useRef<HTMLDivElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const trails = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const pts = [0, 0, 0].map(() => ({ x: 0, y: 0 }));
    const C = 2 * Math.PI * 30;
    return subscribe((s) => {
      const o = orb.current;
      if (!o) return;
      o.hidden = !s.visible;
      o.dataset.target = String(s.hasTarget);
      o.dataset.armed = String(s.armed);
      o.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      if (arc.current) arc.current.style.strokeDashoffset = String(C * (1 - s.progress));
      // rastro: cada ponto segue o anterior
      let lead = { x: s.x, y: s.y };
      pts.forEach((p, i) => {
        p.x += (lead.x - p.x) * 0.35;
        p.y += (lead.y - p.y) * 0.35;
        lead = p;
        const el = trails.current[i];
        if (el) {
          el.hidden = !s.visible;
          el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${1 - i * 0.25})`;
        }
      });
    });
  }, [subscribe]);

  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} ref={(el) => void (trails.current[i] = el)} className="la-orb__trail" hidden aria-hidden="true" />
      ))}
      <div ref={orb} className="la-orb" data-variant={variant} hidden aria-hidden="true">
        <svg className="la-orb__ring" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border-glow)" strokeWidth="5" />
          <circle
            ref={arc}
            cx="36"
            cy="36"
            r="30"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 30}
            strokeDashoffset={2 * Math.PI * 30}
            transform="rotate(-90 36 36)"
            style={{ filter: 'drop-shadow(0 0 6px var(--primary))' }}
          />
        </svg>
        <div className="la-orb__core" />
        <svg className="la-orb__arrow" width="34" height="40" viewBox="0 0 34 40">
          <path
            d="M2 2 L2 32 L10 25 L16 38 L22 35 L16 22 L27 22 Z"
            fill="var(--primary)"
            stroke="var(--bg-deep)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 6px var(--primary))' }}
          />
        </svg>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
export interface MeshFrameLike {
  landmarks: ArrayLike<{ x: number; y: number }> | null;
}

/**
 * "Malha neural": desenha os pontos do rosto para mostrar que o app está vendo a pessoa.
 * Espelhado (como um espelho), que é o que as pessoas esperam ver.
 */
export function NeuralMesh({
  subscribe,
  connections,
  className,
  width = 320,
  height = 240,
  dense = true,
}: {
  subscribe: (cb: (f: MeshFrameLike) => void) => () => void;
  connections: ArrayLike<{ start: number; end: number }>;
  className?: string;
  width?: number;
  height?: number;
  dense?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const primary = css.getPropertyValue('--primary').trim() || '#5EEAFF';
    const secondary = css.getPropertyValue('--secondary').trim() || '#A78BFA';
    const glow = Number(css.getPropertyValue('--glow')) || 0;
    let latest: MeshFrameLike | null = null;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!latest) return;
      const lm = latest.landmarks;
      latest = null;
      ctx.clearRect(0, 0, c.width, c.height);
      if (!lm) return;
      const W = c.width;
      const H = c.height;
      const px = (i: number) => (1 - lm[i].x) * W;
      const py = (i: number) => lm[i].y * H;
      ctx.save();
      ctx.shadowColor = primary;
      ctx.shadowBlur = 8 * glow;
      ctx.strokeStyle = primary;
      ctx.globalAlpha = dense ? 0.28 : 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < connections.length; k++) {
        const { start, end } = connections[k];
        if (!lm[start] || !lm[end]) continue;
        ctx.moveTo(px(start), py(start));
        ctx.lineTo(px(end), py(end));
      }
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = secondary;
      const step = dense ? 3 : 6;
      for (let i = 0; i < lm.length; i += step) {
        ctx.fillRect(px(i) - 1, py(i) - 1, 2, 2);
      }
      ctx.restore();
    };
    draw();
    const unsub = subscribe((f) => {
      latest = f;
    });
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [subscribe, connections, dense]);

  return <canvas ref={canvas} width={width} height={height} className={className} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------------------------
export function SpeechBar({
  text,
  placeholder = 'Escolha letras ou frases. O texto aparece aqui.',
  actions,
  className,
}: {
  text: string;
  placeholder?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={cx('flex items-center gap-3 px-4 py-2', className)}>
      <div className="la-speechbar__text min-w-0 flex-1" aria-live="polite" aria-label="Texto a ser falado">
        {text ? (
          <>
            {text}
            <span className="la-caret" aria-hidden="true" />
          </>
        ) : (
          <span className="la-speechbar__placeholder">{placeholder}</span>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------------------------
export type QuickAnswer = 'sim' | 'nao' | 'nao-sei' | 'espera';

export function QuickYesNo({ onAnswer }: { onAnswer: (a: QuickAnswer) => void }) {
  return (
    <div className="grid h-full grid-cols-2 grid-rows-[1fr_auto] gap-4">
      <GlowButton tone="success" className="text-[2.4em]" icon="👍" label="Sim" onClick={() => onAnswer('sim')} />
      <GlowButton tone="danger" className="text-[2.4em]" icon="✋" label="Não" onClick={() => onAnswer('nao')} />
      <GlowButton tone="neutral" className="min-h-[3.2em] text-[1.2em]" icon="🤷" label="Não sei" onClick={() => onAnswer('nao-sei')} />
      <GlowButton tone="warning" className="min-h-[3.2em] text-[1.2em]" icon="⏳" label="Espera" onClick={() => onAnswer('espera')} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
/** Logo: a letra L desenhada por uma linha de luz que vira uma onda sonora (voz). */
export function LogoMark({ size = 64, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="LindaurIA">
      <defs>
        <linearGradient id="la-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5EEAFF" />
          <stop offset="0.55" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#F0ABFC" />
        </linearGradient>
        <filter id="la-logo-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M26 10 V64 Q26 74 36 74 H46 L51 62 L57 84 L63 52 L69 80 L74 66 L78 74 H88"
        fill="none"
        stroke="url(#la-logo-g)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#la-logo-glow)"
        pathLength={1}
        style={
          animated
            ? { strokeDasharray: 1, strokeDashoffset: 1, animation: 'la-draw 1.6s 0.2s cubic-bezier(.65,0,.35,1) forwards' }
            : undefined
        }
      />
      <style>{'@keyframes la-draw { to { stroke-dashoffset: 0; } }'}</style>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('la-display font-bold', className)}>
      Lindaur<span className="la-gradient-text">IA</span>
    </span>
  );
}
