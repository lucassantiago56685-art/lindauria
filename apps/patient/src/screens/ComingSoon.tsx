import { GlassCard, GlowButton } from '@lindauria/design-system';
import { useApp } from '../store/app';
import { ScreenShell } from '../components/common';

/** Tela honesta para funções das próximas fases: nada de botão que finge funcionar. */
export function ComingSoon() {
  const soon = useApp((s) => s.soon);
  const go = useApp((s) => s.go);
  return (
    <ScreenShell>
      <div className="flex flex-1 items-center justify-center">
        <GlassCard className="flex w-full max-w-3xl flex-col items-center gap-5 p-8 text-center">
          <div className="text-[4em]" aria-hidden="true">
            {soon?.icon ?? '✨'}
          </div>
          <h1 className="text-[2em] font-bold">{soon?.title ?? 'Em breve'}</h1>
          <p className="text-[1.1em]" style={{ color: 'var(--text-secondary)' }}>
            {soon?.description}
          </p>
          <p className="text-[1em] font-semibold" style={{ color: 'var(--secondary-text)' }}>
            Ainda não está pronto: chega na Fase {soon?.phase ?? '?'} do LindaurIA.
          </p>
          <GlowButton tone="primary" icon="🏠" label="Voltar ao início" className="min-h-[3.5em] w-full max-w-md text-[1.2em]" onClick={() => go('hub')} />
        </GlassCard>
      </div>
    </ScreenShell>
  );
}
