import { useEffect, useState } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { finalizeText } from '@lindauria/keyboards';
import { useApp } from '../store/app';
import { say } from '../runtime/engine';
import { useCare } from '../runtime/care';
import { FEELINGS, MOODS } from '../runtime/care-logic';
import { ScreenShell } from '../components/common';
import { ScrollArea } from '../components/ScrollArea';

/**
 * "Como estou": a pessoa registra como se sente (humor, sentimentos, dor) com poucas escolhas.
 * Esses registros viram os relatórios em PDF (dia / semana / mês).
 */
export function Feelings() {
  const go = useApp((s) => s.go);
  const text = useApp((s) => s.text);
  const { feelings, load, addFeeling } = useCare();
  const [mood, setMood] = useState<number | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pain, setPain] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => void load(), [load]);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const today = feelings.filter((f) => new Date(f.at).toDateString() === new Date().toDateString()).reverse();

  function save() {
    if (mood === null) return;
    addFeeling({ mood, feelings: chosen, pain: chosen.includes('dor') ? (pain ?? 5) : null, note: finalizeText(text) });
    const m = MOODS.find((x) => x.value === mood)!;
    void say(`Registrado: ${m.label}.`);
    setSaved(true);
    setMood(null);
    setChosen([]);
    setPain(null);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <ScreenShell icon="💭" title="Como estou" subtitle="registre como você se sente">
      <ScrollArea innerClassName="flex flex-col gap-4 pb-3">
        {saved && (
          <p role="status" className="la-glass p-3 text-center font-bold" style={{ color: 'var(--success-text)', borderColor: 'var(--success)' }}>
            ✔ Registrado! Obrigado por contar como você está.
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="font-bold">1. Como você está agora?</h2>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {MOODS.map((m) => (
              <GlowButton
                key={m.value}
                tone={m.value >= 4 ? 'success' : m.value === 3 ? 'warning' : 'danger'}
                aria-pressed={mood === m.value}
                icon={m.icon}
                label={m.label}
                className="la-btn--bigicon min-h-[5em] px-1 text-[clamp(13px,1.8vw,1em)]"
                onClick={() => setMood(m.value)}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold">2. O que você está sentindo? <span className="text-[0.8em] font-normal" style={{ color: 'var(--text-secondary)' }}>(pode escolher vários)</span></h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {FEELINGS.map((f) => (
              <GlowButton key={f.id} tone="secondary" aria-pressed={chosen.includes(f.id)} icon={f.icon} label={f.label} className="min-h-[3.6em] text-[0.85em]" onClick={() => toggle(f.id)} />
            ))}
          </div>
        </section>

        {chosen.includes('dor') && (
          <section className="flex flex-col gap-2">
            <h2 className="font-bold">3. Quanta dor? (0 = nenhuma, 10 = a pior)</h2>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
              {Array.from({ length: 11 }, (_, n) => (
                <GlowButton
                  key={n}
                  tone={n <= 3 ? 'success' : n <= 6 ? 'warning' : 'danger'}
                  aria-pressed={pain === n}
                  label={String(n)}
                  className="min-h-[2.8em] p-0 text-[1.2em]"
                  onClick={() => setPain(n)}
                />
              ))}
            </div>
          </section>
        )}

        {text.trim() && (
          <p className="text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
            📝 O texto escrito vai junto como observação: “{text.trim()}”
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <GlowButton tone="primary" icon="💾" label="Salvar registro" disabled={mood === null} className="min-h-[3.4em] flex-row text-[1.05em]" onClick={save} />
          <GlowButton tone="accent" icon="📄" label="Ver relatórios e PDF" className="min-h-[3.4em] flex-row text-[1.05em]" onClick={() => go('reports')} />
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-[0.8em] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Hoje ({today.length})
          </h2>
          {today.length === 0 && (
            <p className="text-[0.9em]" style={{ color: 'var(--text-secondary)' }}>
              Nenhum registro hoje ainda.
            </p>
          )}
          {today.map((e) => {
            const m = MOODS.find((x) => x.value === e.mood)!;
            return (
              <GlassCard key={e.id} className="flex flex-wrap items-center gap-2 p-3 text-[0.9em]">
                <span className="font-bold">{new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span>
                  {m.icon} {m.label}
                </span>
                {e.feelings.map((id) => {
                  const f = FEELINGS.find((x) => x.id === id);
                  return f ? <span key={id} className="la-glass px-2 py-0.5 text-[0.85em]">{f.icon} {f.label}</span> : null;
                })}
                {e.pain !== null && <span style={{ color: 'var(--danger-text)' }}>dor {e.pain}/10</span>}
                {e.note && <span style={{ color: 'var(--text-secondary)' }}>“{e.note}”</span>}
              </GlassCard>
            );
          })}
        </section>
      </ScrollArea>
    </ScreenShell>
  );
}
