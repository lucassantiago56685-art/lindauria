import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { EmergencyPulse, GlassCard, GlowButton, NeuralMesh, type MeshFrameLike } from '@lindauria/design-system';
import { FACE_OVAL_CONNECTIONS } from '@lindauria/input-engine';
import { CANCEL_WINDOW_MS, EMERGENCY_PHRASES, type EmergencyKind } from '@lindauria/safety';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { emergency, getHead } from '../runtime/engine';
import { canReceiveAlerts, useFamily } from '../runtime/family';
import { useOutbox } from '../runtime/outbox';

/** Na tela de emergência: quem da família já foi avisado. */
function FamilyDeliveryStatus() {
  const all = useFamily((s) => s.list);
  const resends = useFamily((s) => s.resends);
  const list = all.filter(canReceiveAlerts);
  const delivery = useFamily((s) => s.delivery);
  const photos = useSettings((s) => s.settings.emergencyPhotos);
  const online = useOutbox((s) => s.online);
  if (!list.length) {
    return (
      <p className="mt-2 text-[0.95em] font-semibold" style={{ color: 'var(--warning-text)' }}>
        Nenhum familiar autorizado para receber o aviso no celular (cadastre em Família).
      </p>
    );
  }
  const anyOnTheWay = list.some((m) => delivery[m.id]?.onTheWay);
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-2 text-[0.9em] font-semibold" role="status" aria-live="polite">
      {!online && (
        <span className="w-full rounded-xl px-3 py-2 text-center text-[1.05em]" style={{ background: 'var(--danger)', color: '#fff' }}>
          📵 SEM INTERNET — o alarme está tocando só AQUI. Chame alguém por perto! A família será avisada assim que a conexão voltar.
        </span>
      )}
      {!anyOnTheWay && resends > 0 && (
        <span className="w-full text-center" style={{ color: 'var(--warning-text)' }}>
          🔁 Ninguém respondeu ainda — alarme reenviado {resends}x (a cada 1 minuto)
        </span>
      )}
      {list.map((m) => {
        const d = delivery[m.id];
        const label = d?.onTheWay
          ? '🏃 está a caminho!'
          : d?.text === 'sent'
            ? '✔ avisado(a)'
            : d?.text === 'queued'
              ? '📵 ainda NÃO avisado(a): sai quando a internet voltar'
              : d?.text === 'failed'
                ? '⚠ falhou, tentando de novo'
                : '⏳ avisando…';
        const color = d?.text === 'sent' ? 'var(--success-text)' : d?.text === 'failed' || d?.text === 'queued' ? 'var(--danger-text)' : 'var(--warning-text)';
        return (
          <span key={m.id} className="la-glass px-3 py-1" style={{ color }}>
            📲 {m.name}: {label}
            {photos && m.permissions.photos && d?.photos ? ` · 📷 ${d.photos}` : ''}
          </span>
        );
      })}
    </div>
  );
}

/** Para o NeuralMesh: assina os quadros do rastreador de cabeça (se ligado). */
export const subscribeFrames = (cb: (f: MeshFrameLike) => void) => getHead()?.onFrame(cb) ?? (() => undefined);

// ---------------------------------------------------------------------------------------------
export function StatusPill({ className }: { className?: string }) {
  const t = useApp((s) => s.tracking);
  const go = useApp((s) => s.go);
  const showMesh = useSettings((s) => s.settings.showMeshPreview);
  let dot = 'var(--text-secondary)';
  let text = 'Câmera desligada';
  if (t.mode === 'pointer' && t.status === 'on') {
    dot = 'var(--primary)';
    text = 'Mouse / toque';
  } else if (t.status === 'starting') {
    dot = 'var(--warning)';
    text = 'Ligando a câmera…';
  } else if (t.status === 'on') {
    dot = t.detected ? 'var(--success)' : 'var(--warning)';
    text = t.detected ? 'Vendo você' : 'Não encontro seu rosto';
  } else if (t.status === 'error') {
    dot = 'var(--danger)';
    text = 'Câmera com problema';
  }
  // tocar no status (ou mirar nele) abre a calibração — atalho para "a seta não acompanha"
  const canCalibrate = t.mode === 'head' && t.status === 'on';
  return (
    <GlassCard
      className={`flex min-w-0 items-center gap-3 px-3 ${canCalibrate ? 'cursor-pointer' : ''} ${className ?? ''}`}
      role={canCalibrate ? 'button' : 'status'}
      aria-live="polite"
      aria-label={canCalibrate ? `${text}. Toque para ajustar o cursor` : undefined}
      data-dwell={canCalibrate ? '' : undefined}
      data-dwell-ms={canCalibrate ? 2500 : undefined}
      onClick={canCalibrate ? () => go('calibration') : undefined}
    >
      {t.mode === 'head' && t.status === 'on' && showMesh && (
        <NeuralMesh
          subscribe={subscribeFrames}
          connections={FACE_OVAL_CONNECTIONS}
          width={72}
          height={54}
          dense={false}
          className="hidden shrink-0 rounded-lg sm:block"
        />
      )}
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ background: dot, boxShadow: `0 0 calc(12px * var(--glow)) ${dot}` }}
        aria-hidden="true"
      />
      <span className="truncate text-[0.85em] font-semibold" style={{ color: 'var(--text-primary)' }}>
        {text}
      </span>
      {canCalibrate && (
        <span className="ml-auto hidden shrink-0 text-[0.75em] font-bold md:inline" style={{ color: 'var(--primary-text)' }}>
          🎯 ajustar
        </span>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------------------------
// botões da barra: ícone ao lado do texto; em celular em pé, só o ícone (nome no aria-label)
const BAR_BTN = 'la-btn--bar';
const BAR_LABEL = 'la-btn--compact';

export function TopBar({ home = true, settings = false }: { home?: boolean; settings?: boolean }) {
  const go = useApp((s) => s.go);
  return (
    <header className="relative z-10 flex h-[3.4em] shrink-0 items-stretch gap-2 px-3 pt-3 sm:gap-3 sm:px-4">
      {home && <GlowButton tone="neutral" icon="🏠" label="Início" aria-label="Início" className={`${BAR_BTN} ${BAR_LABEL}`} onClick={() => go('hub')} />}
      <StatusPill className="min-w-0 flex-1" />
      <GlowButton
        tone="secondary"
        icon="😴"
        label="Descansar"
        aria-label="Descansar"
        className={`${BAR_BTN} ${BAR_LABEL}`}
        onClick={() => useApp.setState({ resting: true })}
      />
      {settings && (
        <GlowButton tone="neutral" icon="⚙️" label="Ajustes" aria-label="Ajustes" className={`${BAR_BTN} ${BAR_LABEL}`} onClick={() => go('settings')} />
      )}
      <EmergencyPulse className={BAR_BTN} onClick={() => emergency.trigger('button')} />
    </header>
  );
}

// ---------------------------------------------------------------------------------------------
/**
 * Moldura de toda tela: barra do topo + título da tela (onde você está) + conteúdo.
 */
export function ScreenShell({
  children,
  home = true,
  settings = false,
  title,
  icon,
  subtitle,
}: {
  children: ReactNode;
  home?: boolean;
  settings?: boolean;
  title?: string;
  icon?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <TopBar home={home} settings={settings} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        {title && (
          <div className="flex shrink-0 items-baseline gap-2 px-1">
            <h1 className="la-display truncate text-[clamp(18px,2.6vw,1.3em)] font-bold">
              {icon && <span aria-hidden="true">{icon} </span>}
              {title}
            </h1>
            {subtitle && (
              <span className="hidden truncate text-[0.8em] sm:inline" style={{ color: 'var(--text-secondary)' }}>
                · {subtitle}
              </span>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function Overlay({ children, label, tone = 'deep' }: { children: ReactNode; label: string; tone?: 'deep' | 'danger' }) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{
        background:
          tone === 'danger'
            ? 'radial-gradient(circle at center, color-mix(in srgb, var(--danger) 30%, var(--bg-deep)), var(--bg-deep) 75%)'
            : 'color-mix(in srgb, var(--bg-deep) 92%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
/** Descanso: nada é clicado sem querer (ver TV, conversar). Gesto de emergência continua ativo. */
export function RestOverlay() {
  const emergencyGesture = useSettings((s) => s.settings.emergencyGesture);
  const count = useSettings((s) => s.settings.emergencyCount);
  return (
    <Overlay label="Modo descanso">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <div className="text-[3em]" aria-hidden="true">
          🌙
        </div>
        <h2 className="text-[1.8em] font-bold">Modo descanso</h2>
        <p className="text-[1.05em]" style={{ color: 'var(--text-secondary)' }}>
          O app não vai clicar em nada. Para voltar, mire no botão abaixo por 3 segundos.
          {emergencyGesture !== 'off' && (
            <strong style={{ color: 'var(--danger-text)' }}>
              {' '}A emergência continua ligada: {count} {emergencyGesture === 'longBlink3' ? 'piscadas longas' : 'vezes as sobrancelhas'} ou o botão vermelho.
            </strong>
          )}
        </p>
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <GlowButton
            tone="primary"
            icon="☀️"
            label="Voltar a usar"
            hint="segure 3 segundos"
            dwellMs={3000}
            className="min-h-[5em] text-[1.3em]"
            onClick={() => useApp.setState({ resting: false })}
          />
          <EmergencyPulse className="min-h-[5em] text-[1.1em]" onClick={() => emergency.trigger('button')} />
        </div>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------------------------
const KIND_BUTTONS: Array<{ kind: EmergencyKind; icon: string; label: string }> = [
  { kind: 'falta-de-ar', icon: '🫁', label: 'Falta de ar' },
  { kind: 'engasgo', icon: '😮‍💨', label: 'Engasgo' },
  { kind: 'dor', icon: '⚡', label: 'Dor forte' },
  { kind: 'aspiracao', icon: '💨', label: 'Aspiração' },
  { kind: 'posicao', icon: '🛏️', label: 'Mudar posição' },
  { kind: 'medo', icon: '🫂', label: 'Estou com medo' },
];

export function EmergencyOverlay() {
  const e = useApp((s) => s.emergency);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (!e) return null;
  const left = Math.max(0, Math.ceil((CANCEL_WINDOW_MS - (now - e.at)) / 1000));
  return (
    <Overlay label="Emergência ativa" tone="danger">
      <div className="flex h-full w-full max-w-5xl flex-col gap-4 overflow-auto py-2">
        <GlassCard className="la-emergency px-6 py-5 text-center" style={{ borderColor: 'var(--danger)' }}>
          <h2 className="text-[2.2em] font-bold" style={{ color: 'var(--danger-text)' }}>
            🆘 Pedindo ajuda
          </h2>
          <p className="mt-1 text-[1.2em] font-semibold">“{EMERGENCY_PHRASES[e.kind]}”</p>
          <p className="mt-2 text-[0.95em]" style={{ color: 'var(--text-secondary)' }}>
            O alarme está tocando neste aparelho.
          </p>
          <FamilyDeliveryStatus />
          <p className="mt-2 text-[1.3em] font-bold" style={{ color: 'var(--text-primary)' }}>
            Em risco de vida, ligue <span style={{ color: 'var(--danger-text)' }}>SAMU 192</span>
          </p>
        </GlassCard>

        <p className="text-center text-[0.95em]" style={{ color: 'var(--text-secondary)' }}>
          O que está acontecendo? (opcional)
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {KIND_BUTTONS.map((k) => (
            <GlowButton
              key={k.kind}
              tone={e.kind === k.kind ? 'danger' : 'warning'}
              aria-pressed={e.kind === k.kind}
              icon={k.icon}
              label={k.label}
              className="min-h-[3.4em] text-[1em]"
              onClick={() => emergency.trigger('button', k.kind)}
            />
          ))}
        </div>

        <GlowButton
          tone="neutral"
          icon="✖️"
          label={left > 0 ? `Foi sem querer? Cancelar (${left}s)` : 'Cancelar alarme'}
          hint="segure 3 segundos ou toque"
          dwellMs={3000}
          className="mt-auto min-h-[3.6em] text-[1.05em]"
          onClick={() => emergency.cancel()}
        />
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------------------------
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Sim',
  cancelLabel = 'Não',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay label={title}>
      <GlassCard className="flex w-full max-w-2xl flex-col gap-5 p-6 text-center">
        <h2 className="text-[1.6em] font-bold">{title}</h2>
        {message && (
          <div className="text-[1em]" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <GlowButton tone={danger ? 'danger' : 'success'} icon="✔️" label={confirmLabel} className="min-h-[4em] text-[1.2em]" onClick={onConfirm} />
          <GlowButton tone="neutral" icon="↩️" label={cancelLabel} className="min-h-[4em] text-[1.2em]" onClick={onCancel} />
        </div>
      </GlassCard>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------------------------
/** "Piscada longa 1 de 3": a pessoa sabe que o gesto está sendo contado. */
export function EmergencyHitsToast() {
  const hits = useApp((s) => s.emergencyHits);
  const g = useSettings((s) => s.settings.emergencyGesture);
  const total = useSettings((s) => s.settings.emergencyCount);
  if (!hits || g === 'off') return null;
  const name = g === 'longBlink3' ? 'Piscada longa' : 'Sobrancelhas';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[900] flex justify-center px-4" role="status" aria-live="assertive">
      <GlassCard className="px-5 py-3 text-[1em] font-bold" style={{ borderColor: 'var(--warning)', color: 'var(--warning-text)' }}>
        {name} {hits} de {total} — mais {total - hits} para chamar ajuda
      </GlassCard>
    </div>
  );
}

/**
 * Aviso FIXO e bem visível quando a internet cai: a emergência continua tocando no aparelho,
 * mas a família só é avisada quando a conexão voltar.
 */
export function OfflineBanner() {
  const online = useOutbox((s) => s.online);
  const queued = useOutbox((s) => s.items.length);
  const hasFamily = useFamily((s) => s.list.some(canReceiveAlerts));
  const inEmergency = useApp((s) => !!s.emergency); // a tela de emergência já mostra o aviso dela
  if ((online && !queued) || inEmergency) return null;
  return (
    <div role="alert" className="pointer-events-none fixed inset-x-0 top-0 z-[1200] flex justify-center p-2">
      <div className="max-w-3xl rounded-2xl px-4 py-2 text-center text-[0.85em] font-bold shadow-lg" style={{ background: online ? 'var(--warning)' : 'var(--danger)', color: online ? '#060A17' : '#fff' }}>
        {!online
          ? `📵 Sem internet. A emergência toca o alarme AQUI, mas ${hasFamily ? 'a família NÃO recebe o aviso agora' : 'ninguém é avisado no celular'}${queued ? ` (${queued} aviso(s) na fila, saem quando a conexão voltar)` : ''}.`
          : `⏳ Enviando ${queued} aviso(s) que ficaram na fila…`}
      </div>
    </div>
  );
}
