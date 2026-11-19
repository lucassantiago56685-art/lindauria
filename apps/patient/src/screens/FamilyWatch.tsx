import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton, LogoMark, Wordmark } from '@lindauria/design-system';
import { getAudioContext, unlockAudio } from '@lindauria/shared';
import { useApp } from '../store/app';
import { sounds } from '../runtime/engine';
import {
  enableEverything,
  enableNotifications,
  keepAwake,
  prettyCode,
  replyOnMyWay,
  startAlarmSound,
  startWatching,
  stopAlarmSound,
  useWatch,
  type FeedMessage,
} from '../runtime/watch';
import { ScrollArea, TextField } from '../components/ScrollArea';

const fmt = (sec: number) =>
  new Date(sec * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const KIND_STYLE: Record<FeedMessage['kind'], { color: string; border: string }> = {
  alarm: { color: 'var(--danger-text)', border: 'var(--danger)' },
  update: { color: 'var(--danger-text)', border: 'var(--danger)' },
  photo: { color: 'var(--warning-text)', border: 'var(--warning)' },
  resolved: { color: 'var(--success-text)', border: 'var(--success)' },
  reply: { color: 'var(--accent-text)', border: 'var(--accent)' },
  test: { color: 'var(--primary-text)', border: 'var(--primary)' },
  reminder: { color: 'var(--warning-text)', border: 'var(--warning)' },
  other: { color: 'var(--text-primary)', border: 'var(--border-glow)' },
};

/** Tela cheia quando há emergência em andamento. */
function AlarmScreen({ msg, photos, onClose }: { msg: FeedMessage; photos: FeedMessage[]; onClose: () => void }) {
  const sounding = useWatch((s) => s.alarmSounding);
  const [myName, setMyName] = useState(() => localStorage.getItem('la-watch-name') ?? '');
  const [sent, setSent] = useState<'idle' | 'ok' | 'fail'>('idle');

  async function onMyWay() {
    try {
      localStorage.setItem('la-watch-name', myName);
    } catch {
      /* sem armazenamento: tudo bem */
    }
    try {
      await replyOnMyWay(msg.code, myName);
      setSent('ok');
      stopAlarmSound(msg.code); // respondeu: o alarme para (e os reenvios não tocam mais)
      sounds.sent();
    } catch {
      setSent('fail');
    }
  }

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-label="Emergência"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[1000] flex flex-col gap-3 overflow-auto p-4"
      style={{ background: 'radial-gradient(circle at center, color-mix(in srgb, var(--danger) 35%, var(--bg-deep)), var(--bg-deep) 80%)' }}
    >
      <GlassCard className="la-emergency p-5 text-center" style={{ borderColor: 'var(--danger)' }}>
        <h1 className="la-display text-[clamp(26px,6vw,2.2em)] font-bold" style={{ color: 'var(--danger-text)' }}>
          {msg.title}
        </h1>
        <p className="mt-2 whitespace-pre-line text-[1.1em] font-semibold">{msg.message}</p>
        <p className="mt-1 text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
          {fmt(msg.time)}
        </p>
      </GlassCard>

      {photos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <figure key={p.id} className="la-glass overflow-hidden p-1">
              <img src={p.photoUrl!} alt={p.title} className="w-full rounded-xl" />
              <figcaption className="p-2 text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
                {p.title} · {fmt(p.time)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <a href="tel:192" className="la-btn la-tone-danger min-h-[3.4em] flex-row text-[1.15em]" style={{ textDecoration: 'none' }}>
          📞 Ligar SAMU 192
        </a>
        {sounding ? (
          <GlowButton tone="neutral" icon="🔕" label="Silenciar alarme" className="min-h-[3.4em] flex-row text-[1.05em]" onClick={() => stopAlarmSound(msg.code)} />
        ) : (
          <GlowButton tone="neutral" icon="↩️" label="Fechar" className="min-h-[3.4em] flex-row text-[1.05em]" onClick={onClose} />
        )}
      </div>

      <GlassCard className="flex flex-col gap-2 p-4">
        <span className="font-bold">Avise que você está indo</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <TextField label="Seu nome" icon="👤" value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Ex.: Ana" />
          </div>
          <GlowButton tone="success" icon="🏃" label={sent === 'ok' ? 'Avisado ✔' : 'Estou indo'} className="flex-row self-end text-[1em] sm:min-w-[10em]" onClick={() => void onMyWay()} />
        </div>
        {sent === 'fail' && (
          <p role="alert" style={{ color: 'var(--danger-text)' }}>
            Não consegui avisar. Verifique a internet.
          </p>
        )}
      </GlassCard>
    </motion.div>
  );
}

/** Lista de conferência: som, notificações, tela acesa. Um toque ativa tudo. */
function ReadyCard({ perm, onEnable }: { perm: string; onEnable: () => Promise<void> }) {
  const awake = useWatch((s) => s.awake);
  const [, force] = useState(0);
  const sound = getAudioContext()?.state === 'running';
  const items = [
    { ok: sound, label: 'Som do alarme ligado' },
    { ok: perm === 'granted', label: perm === 'denied' ? 'Notificações bloqueadas — libere nas configurações do navegador' : 'Notificações permitidas' },
    { ok: awake, label: 'Tela acesa enquanto acompanha' },
  ];
  const allOk = items.every((i) => i.ok);
  return (
    <GlassCard className="flex flex-col gap-3 p-4" style={{ borderColor: allOk ? 'var(--success)' : 'var(--warning)' }}>
      <h2 className="font-bold" style={{ color: allOk ? 'var(--success-text)' : 'var(--warning-text)' }}>
        {allOk ? '✔ Pronto para receber alarmes' : '⚠ Falta pouco para receber alarmes'}
      </h2>
      <ul className="flex flex-col gap-1 text-[0.9em]">
        {items.map((i) => (
          <li key={i.label} style={{ color: i.ok ? 'var(--success-text)' : 'var(--text-primary)' }}>
            {i.ok ? '✔' : '○'} {i.label}
          </li>
        ))}
      </ul>
      {!allOk && (
        <GlowButton
          tone="warning"
          icon="🔔"
          label="Ativar tudo (um toque)"
          className="min-h-[3em] flex-row text-[1em]"
          onClick={async () => {
            await onEnable();
            force((n) => n + 1);
          }}
        />
      )}
      <p className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
        Deixe esta página aberta (pode bloquear a tela). Na emergência o alarme toca até você responder “Estou indo”.
      </p>
    </GlassCard>
  );
}

export function FamilyWatch() {
  const go = useApp((s) => s.go);
  const { patients, feed, conn, activeAlarm, add, remove } = useWatch();
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('familia') ?? '');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      await startWatching();
      // veio pelo link do convite: já conecta, sem precisar digitar nada
      const q = new URLSearchParams(location.search);
      const fromLink = q.get('familia');
      if (fromLink && (await add(fromLink, q.get('nome') ?? ''))) {
        setCode('');
        history.replaceState(null, '', location.pathname);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    await unlockAudio(); // o toque libera o som do alarme
    const p = await add(code, label);
    if (!p) {
      setError('Código inválido. Ele tem 15 letras e números (ex.: abcde-fghij-klmno). Confira com quem cadastrou.');
      sounds.error();
      return;
    }
    sounds.sent();
    setCode('');
    setLabel('');
    if (perm === 'default') setPerm(await enableNotifications());
    void keepAwake();
  }

  // emergência em andamento mais recente
  const alarm = Object.values(activeAlarm)
    .filter((m): m is FeedMessage => !!m)
    .sort((a, b) => b.time - a.time)[0];
  const alarmPhotos = alarm ? feed.filter((f) => f.code === alarm.code && f.kind === 'photo' && f.time >= alarm.time - 2).slice(0, 6) : [];

  return (
    <div className="relative z-10 mx-auto flex h-full w-full max-w-3xl flex-col gap-3 p-3 sm:p-4">
      <header className="flex shrink-0 items-center gap-3">
        <GlowButton tone="neutral" icon="←" label="Voltar" className="la-btn--bar" onClick={() => go('landing')} />
        <LogoMark size={30} />
        <Wordmark className="text-[1.1em]" />
      </header>

      <div className="shrink-0 px-1">
        <h1 className="la-display text-[clamp(22px,4vw,1.6em)] font-bold">👨‍👩‍👧 Acompanhar paciente</h1>
        <p className="text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
          Receba aqui os alertas de emergência e as fotos, na hora.
        </p>
      </div>

      <ScrollArea innerClassName="flex flex-col gap-3 pb-4">
        {/* pronto para receber alarmes? (primeiro da tela: é o que falta fazer) */}
        {patients.length > 0 && <ReadyCard perm={perm} onEnable={async () => setPerm((await enableEverything()).perm)} />}

        {/* cadastrar código */}
        <GlassCard className="flex flex-col gap-3 p-4">
          <h2 className="font-bold">🔑 {patients.length ? 'Adicionar outro paciente' : 'Digite o código de acesso'}</h2>
          <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
            <TextField
              label="Código de acesso"
              icon="🔑"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex.: abcde-fghij-klmno"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              hint="Quem cuida do paciente encontra o código em Família → Convite e teste."
            />
            <TextField label="Nome do paciente (para você reconhecer)" icon="🙂" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Vó Lindaura" />
            {error && (
              <p role="alert" className="font-semibold" style={{ color: 'var(--danger-text)' }}>
                {error}
              </p>
            )}
            <GlowButton type="submit" tone="primary" icon="📲" label="Acompanhar" className="min-h-[3em] flex-row text-[1.05em]" />
          </form>
        </GlassCard>


        {/* pacientes acompanhados */}
        {patients.map((p) => (
          <GlassCard key={p.code} className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid h-11 w-11 place-items-center rounded-full text-[1.2em]" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true">
              🙂
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{p.label}</div>
              <div className="text-[0.78em]" style={{ color: 'var(--text-secondary)' }}>
                código {prettyCode(p.code)} ·{' '}
                {conn[p.code] === 'online' ? (
                  <span style={{ color: 'var(--success-text)' }}>● conectado</span>
                ) : conn[p.code] === 'offline' ? (
                  <span style={{ color: 'var(--danger-text)' }}>● sem conexão, tentando…</span>
                ) : (
                  <span style={{ color: 'var(--warning-text)' }}>● conectando…</span>
                )}
              </div>
            </div>
            <GlowButton tone="neutral" icon="🔊" label="Testar alarme" className="la-btn--bar" onClick={() => {
              void unlockAudio();
              startAlarmSound();
              setTimeout(stopAlarmSound, 2000);
            }} />
            <GlowButton tone="danger" icon="🗑️" label="Remover" className="la-btn--bar" onClick={() => remove(p.code)} />
          </GlassCard>
        ))}

        {/* histórico */}
        {patients.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-[0.8em] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Últimas mensagens (12 horas)
            </h2>
            {feed.length === 0 && (
              <p className="la-glass p-4 text-center text-[0.9em]" style={{ color: 'var(--text-secondary)' }}>
                Nenhuma mensagem ainda. Tudo tranquilo. 💜
              </p>
            )}
            {feed.map((m) => (
              <GlassCard key={m.id} className="flex flex-col gap-2 p-3" style={{ borderColor: KIND_STYLE[m.kind].border }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold" style={{ color: KIND_STYLE[m.kind].color }}>
                    {m.title}
                  </span>
                  <span className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
                    {fmt(m.time)}
                  </span>
                </div>
                {m.message && <p className="whitespace-pre-line text-[0.9em]">{m.message}</p>}
                {m.photoUrl && <img src={m.photoUrl} alt={m.title} className="max-h-72 w-full rounded-xl object-contain" />}
              </GlassCard>
            ))}
          </section>
        )}

        <p className="px-1 text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
          Mantenha esta página aberta para receber os alertas. Para ser avisado com o celular bloqueado ou o navegador fechado,
          instale também o app gratuito <strong>ntfy</strong> e use o mesmo código.
        </p>
      </ScrollArea>

      {alarm && dismissed !== alarm.id && <AlarmScreen msg={alarm} photos={alarmPhotos} onClose={() => setDismissed(alarm.id)} />}
    </div>
  );
}
