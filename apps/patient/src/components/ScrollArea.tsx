import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type Ref, type ReactNode } from 'react';
import { GlowButton } from '@lindauria/design-system';

/**
 * Área com rolagem que funciona SEM as mãos.
 * Quando o conteúdo não cabe, aparecem os botões ▲ Subir / ▼ Descer ao lado.
 * Eles têm `data-dwell-repeat`: mantendo o cursor em cima, a tela continua rolando.
 * No toque e no mouse, a rolagem normal também funciona.
 */
export function ScrollArea({
  children,
  className = '',
  innerClassName = '',
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [can, setCan] = useState({ up: false, down: false });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () =>
      setCan({ up: el.scrollTop > 2, down: el.scrollTop + el.clientHeight < el.scrollHeight - 2 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const scroll = (dir: 1 | -1) => {
    const el = box.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.6, behavior: 'smooth' });
  };
  const overflow = can.up || can.down;

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-3 ${className}`}>
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y' }}>
        <div ref={inner} className={innerClassName}>
          {children}
        </div>
      </div>
      {overflow && (
        // celular: barra embaixo (Subir | Descer); tablet/computador: coluna à direita
        <div className="flex h-[3.2em] shrink-0 flex-row gap-3 sm:h-auto sm:w-[4.4em] sm:flex-col" aria-label="Rolar a tela">
          <GlowButton
            tone="secondary"
            icon="▲"
            label="Subir"
            data-dwell-repeat=""
            disabled={!can.up}
            className="flex-1 flex-row text-[0.8em] sm:flex-col"
            onClick={() => scroll(-1)}
          />
          <GlowButton
            tone="secondary"
            icon="▼"
            label="Descer"
            data-dwell-repeat=""
            disabled={!can.down}
            className="flex-1 flex-row text-[0.8em] sm:flex-col"
            onClick={() => scroll(1)}
          />
        </div>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  icon,
  trailing,
  ref,
  ...input
}: { label: string; hint?: string; icon?: ReactNode; trailing?: ReactNode; ref?: Ref<HTMLInputElement> } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={id} className="text-[0.9em] font-bold">
        {label}
      </label>
      <div className="la-field">
        {icon && (
          <span className="la-field__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <input ref={ref} id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="la-field__input" {...input} />
        {trailing}
      </div>
      {hint && (
        <span id={`${id}-hint`} className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}
