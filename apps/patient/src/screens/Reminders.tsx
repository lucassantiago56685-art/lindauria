import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { useCare } from '../runtime/care';
import { REMINDER_KINDS, isValidTime, nextOccurrence, type Reminder, type ReminderKind } from '../runtime/care-logic';
import { canReceiveAlerts, useFamily } from '../runtime/family';
import { sounds } from '../runtime/engine';
import { ConfirmDialog, ScreenShell } from '../components/common';
import { ScrollArea, TextField } from '../components/ScrollArea';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function ReminderForm({ reminder, onClose }: { reminder?: Reminder; onClose: () => void }) {
  const saveReminder = useCare((s) => s.saveReminder);
  const family = useFamily((s) => s.list);
  const members = family.filter(canReceiveAlerts);
  const [kind, setKind] = useState<ReminderKind>(reminder?.kind ?? 'remedio');
  const [title, setTitle] = useState(reminder?.title ?? '');
  const [times, setTimes] = useState<string[]>(reminder?.times ?? ['08:00']);
  const [newTime, setNewTime] = useState('12:00');
  const [days, setDays] = useState<number[]>(reminder?.days ?? []);
  const [note, setNote] = useState(reminder?.note ?? '');
  const [notify, setNotify] = useState<string[]>(reminder?.notify ?? members.map((m) => m.id));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const t = title.trim() || REMINDER_KINDS.find((k) => k.id === kind)!.label;
    const valid = [...new Set(times.filter(isValidTime))].sort();
    if (!valid.length) return setError('Adicione pelo menos um horário.');
    saveReminder({ id: reminder?.id, kind, title: t, times: valid, days, note: note.trim(), notify, active: reminder?.active ?? true });
    sounds.sent();
    onClose();
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Lembrete"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[1000] flex items-stretch justify-center p-3 sm:items-center sm:p-6"
      style={{ background: 'color-mix(in srgb, var(--bg-deep) 94%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <GlassCard className="flex max-h-full w-full max-w-2xl flex-col gap-3 p-4 sm:p-6">
        <h2 className="shrink-0 text-center text-[1.4em] font-bold">{reminder ? '✏️ Editar lembrete' : '➕ Novo lembrete'}</h2>
        <ScrollArea innerClassName="flex flex-col gap-4 pb-2">
          <div className="flex flex-col gap-2">
            <span className="font-bold">Tipo</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REMINDER_KINDS.map((k) => (
                <GlowButton key={k.id} tone="primary" aria-pressed={kind === k.id} icon={k.icon} label={k.label} className="text-[0.8em]" onClick={() => setKind(k.id)} />
              ))}
            </div>
          </div>
          <TextField
            label={kind === 'remedio' ? 'Nome do remédio e dose (como está na receita)' : 'O que lembrar'}
            icon={REMINDER_KINDS.find((k) => k.id === kind)!.icon}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'remedio' ? 'Ex.: Riluzol 50 mg — 1 comprimido' : 'Ex.: Lanche da tarde'}
            hint={kind === 'remedio' ? 'O app NUNCA sugere remédio nem dose: copie exatamente o que a equipe de saúde receitou.' : undefined}
          />
          <div className="flex flex-col gap-2">
            <span className="font-bold">Horários</span>
            <div className="flex flex-wrap gap-2">
              {times.map((t) => (
                <span key={t} className="la-glass flex items-center gap-2 px-3 py-1 font-bold">
                  ⏰ {t}
                  <button type="button" aria-label={`Remover ${t}`} className="la-field__action" onClick={() => setTimes(times.filter((x) => x !== t))}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="w-40">
                <TextField label="Novo horário" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              </div>
              <GlowButton tone="success" dwell={false} icon="➕" label="Adicionar" className="la-btn--bar" onClick={() => isValidTime(newTime) && !times.includes(newTime) && setTimes([...times, newTime].sort())} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-bold">Dias <span className="text-[0.8em] font-normal" style={{ color: 'var(--text-secondary)' }}>(nenhum marcado = todos os dias)</span></span>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((d, i) => (
                <GlowButton key={d} tone="secondary" aria-pressed={days.includes(i)} label={d} className="min-h-[2.4em] p-0 text-[0.75em]" onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())} />
              ))}
            </div>
          </div>
          <TextField label="Observação (opcional)" icon="📝" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: dar com água, pela sonda" />
          <div className="flex flex-col gap-2">
            <span className="font-bold">Avisar no celular de</span>
            {members.length === 0 ? (
              <p className="text-[0.85em]" style={{ color: 'var(--warning-text)' }}>
                Nenhum familiar autorizado ainda. Cadastre em Família para avisar quem estiver cuidando.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {members.map((m) => (
                  <GlowButton key={m.id} tone="accent" aria-pressed={notify.includes(m.id)} icon="📲" label={m.name} hint={m.relation} className="text-[0.8em]" onClick={() => setNotify(notify.includes(m.id) ? notify.filter((x) => x !== m.id) : [...notify, m.id])} />
                ))}
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="font-semibold" style={{ color: 'var(--danger-text)' }}>
              {error}
            </p>
          )}
        </ScrollArea>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <GlowButton tone="neutral" icon="↩️" label="Cancelar" onClick={onClose} />
          <GlowButton tone="primary" icon="💾" label="Salvar" onClick={save} />
        </div>
      </GlassCard>
    </motion.div>
  );
}

export function Reminders() {
  const { reminders, load, saveReminder, removeReminder } = useCare();
  const family = useFamily((s) => s.list);
  const [form, setForm] = useState<null | { reminder?: Reminder }>(null);
  const [del, setDel] = useState<Reminder | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    void load();
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const now = new Date();
  const sorted = [...reminders].sort((a, b) => (nextOccurrence(a, now)?.getTime() ?? Infinity) - (nextOccurrence(b, now)?.getTime() ?? Infinity));

  return (
    <ScreenShell icon="⏰" title="Lembretes" subtitle="remédios, comida, água, posição…">
      <GlassCard className="shrink-0 p-3 text-[0.82em]" style={{ color: 'var(--text-secondary)' }}>
        No horário, o app toca, fala em voz alta e avisa no celular o familiar escolhido. Funciona com o LindaurIA aberto neste
        aparelho. Os horários e doses são definidos pela família e pela equipe de saúde.
      </GlassCard>
      <ScrollArea innerClassName="flex flex-col gap-3 pb-3">
        <GlowButton tone="primary" icon="➕" label="Novo lembrete" className="la-btn--soon min-h-[3.4em] flex-row text-[1.05em]" onClick={() => setForm({})} />
        {sorted.map((r) => {
          const k = REMINDER_KINDS.find((x) => x.id === r.kind)!;
          const next = nextOccurrence(r, now);
          const who = family.filter((m) => r.notify.includes(m.id)).map((m) => m.name);
          return (
            <GlassCard key={r.id} className="flex flex-col gap-3 p-4" style={{ opacity: r.active ? 1 : 0.75 }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[1.6em]" aria-hidden="true">{k.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{r.title}</div>
                  <div className="text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
                    {k.label} · ⏰ {r.times.join(', ')} · {r.days.length ? r.days.map((d) => DAYS[d]).join(', ') : 'todos os dias'}
                    {who.length ? ` · 📲 ${who.join(', ')}` : ''}
                  </div>
                  {r.note && <div className="text-[0.8em]">📝 {r.note}</div>}
                </div>
                <span className="la-glass px-3 py-1 text-[0.8em] font-bold" style={{ color: r.active ? 'var(--primary-text)' : 'var(--text-secondary)' }}>
                  {r.active ? (next ? `próximo: ${next.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : '—') : 'pausado'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <GlowButton tone={r.active ? 'warning' : 'success'} icon={r.active ? '⏸️' : '▶️'} label={r.active ? 'Pausar' : 'Ativar'} className="text-[0.75em]" onClick={() => saveReminder({ ...r, active: !r.active })} />
                <GlowButton tone="neutral" icon="✏️" label="Editar" className="text-[0.75em]" onClick={() => setForm({ reminder: r })} />
                <GlowButton tone="danger" icon="🗑️" label="Excluir" className="text-[0.75em]" onClick={() => setDel(r)} />
              </div>
            </GlassCard>
          );
        })}
        {reminders.length === 0 && (
          <p className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            Nenhum lembrete ainda. Toque em “Novo lembrete”.
          </p>
        )}
      </ScrollArea>
      {form && <ReminderForm reminder={form.reminder} onClose={() => setForm(null)} />}
      {del && (
        <ConfirmDialog
          title={`Excluir “${del.title}”?`}
          danger
          confirmLabel="Excluir"
          cancelLabel="Manter"
          onConfirm={() => {
            removeReminder(del.id);
            setDel(null);
          }}
          onCancel={() => setDel(null)}
        />
      )}
    </ScreenShell>
  );
}
