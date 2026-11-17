import { useEffect, useMemo, useState } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { secureGet } from '@lindauria/shared';
import { useCare } from '../runtime/care';
import { buildReport, moodLabel, type Period, type ReportInput } from '../runtime/care-logic';
import { reportFileName, reportPdf } from '../runtime/report-pdf';
import { patientDisplayName } from '../runtime/family';
import { sounds } from '../runtime/engine';
import { ScreenShell } from '../components/common';
import { ScrollArea } from '../components/ScrollArea';

const PERIODS: Array<{ id: Period; icon: string; label: string }> = [
  { id: 'dia', icon: '📅', label: 'Hoje' },
  { id: 'semana', icon: '🗓️', label: 'Últimos 7 dias' },
  { id: 'mes', icon: '📆', label: 'Últimos 30 dias' },
];

/** Relatórios de tudo o que a pessoa sentiu, com PDF para levar à consulta ou mandar à família. */
export function Reports() {
  const { feelings, logs, load } = useCare();
  const [period, setPeriod] = useState<Period>('semana');
  const [extra, setExtra] = useState<Pick<ReportInput, 'phrases' | 'alerts'>>({ phrases: [], alerts: [] });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void load();
    void Promise.all([secureGet<ReportInput['phrases']>('history'), secureGet<ReportInput['alerts']>('alerts')]).then(([phrases, alerts]) =>
      setExtra({ phrases: phrases ?? [], alerts: alerts ?? [] }),
    );
  }, [load]);

  const report = useMemo(
    () => buildReport({ feelings, reminderLogs: logs, ...extra }, period, new Date()),
    [feelings, logs, extra, period],
  );

  function makePdf() {
    return new File([reportPdf(report, patientDisplayName())], reportFileName(report), { type: 'application/pdf' });
  }

  function download() {
    const file = makePdf();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    sounds.sent();
    setMsg('✔ PDF gerado. Confira na pasta de downloads.');
  }

  async function share() {
    const file = makePdf();
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Relatório LindaurIA', text: report.label });
        setMsg('✔ Enviado.');
        return;
      }
    } catch {
      /* cancelado */
      return;
    }
    download();
  }

  const stat = (label: string, value: string, color = 'var(--text-primary)') => (
    <GlassCard className="flex flex-col items-center gap-1 p-3 text-center">
      <span className="text-[1.5em] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </GlassCard>
  );

  return (
    <ScreenShell icon="📄" title="Relatórios" subtitle="tudo o que a pessoa sentiu, em PDF">
      <div className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3">
        {PERIODS.map((p) => (
          <GlowButton key={p.id} tone="primary" aria-pressed={period === p.id} icon={p.icon} label={p.label} className="text-[0.85em]" onClick={() => setPeriod(p.id)} />
        ))}
      </div>

      <ScrollArea innerClassName="flex flex-col gap-3 pb-3">
        <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {report.label}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {stat('registros de como estava', String(report.checkins))}
          {stat('humor médio', report.moodAvg === null ? '—' : moodLabel(report.moodAvg), 'var(--secondary-text)')}
          {stat('dor máxima (0–10)', report.painMax === null ? '—' : String(report.painMax), report.painMax !== null && report.painMax >= 7 ? 'var(--danger-text)' : 'var(--text-primary)')}
          {stat('emergências', String(report.alerts.length), report.alerts.length ? 'var(--danger-text)' : 'var(--success-text)')}
        </div>

        {report.feelingCounts.length > 0 && (
          <GlassCard className="flex flex-col gap-2 p-4">
            <h2 className="font-bold">O que mais sentiu</h2>
            {report.feelingCounts.slice(0, 8).map((f) => (
              <div key={f.id} className="flex items-center gap-3 text-[0.9em]">
                <span className="w-28 shrink-0">{f.label}</span>
                <span className="h-3 rounded-full" style={{ width: `${(f.count / report.feelingCounts[0].count) * 60}%`, background: 'var(--secondary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{f.count}x</span>
              </div>
            ))}
          </GlassCard>
        )}

        <GlassCard className="flex flex-col gap-1 p-4 text-[0.9em]">
          <h2 className="font-bold">Lembretes</h2>
          {report.reminders.total ? (
            <span>
              ✔ {report.reminders.done} feitos · ⚠ {report.reminders.missed} perdidos · ⏳ {report.reminders.pending} pendentes
            </span>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>Nenhum lembrete no período.</span>
          )}
          <h2 className="mt-2 font-bold">Frases faladas</h2>
          <span>
            {report.phrasesTotal} no período{report.topPhrases[0] ? ` · mais falada: “${report.topPhrases[0].text}”` : ''}
          </span>
        </GlassCard>

        {msg && (
          <p role="status" className="font-semibold" style={{ color: 'var(--success-text)' }}>
            {msg}
          </p>
        )}
      </ScrollArea>

      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        <GlowButton tone="primary" icon="📄" label="Baixar PDF" className="min-h-[3.2em] flex-row text-[1.05em]" onClick={download} />
        <GlowButton tone="accent" icon="📤" label="Enviar PDF (WhatsApp, e-mail…)" className="min-h-[3.2em] flex-row text-[0.95em]" onClick={() => void share()} />
      </div>
    </ScreenShell>
  );
}
