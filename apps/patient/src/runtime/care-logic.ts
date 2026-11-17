/* =============================================================================================
   Lógica pura (sem tela) de: registro "Como estou", lembretes e relatórios.
   Separada para poder ser testada.
   ============================================================================================= */

// ---------------------------------------------------------------- "Como estou"
export const MOODS = [
  { value: 5, icon: '😀', label: 'Muito bem' },
  { value: 4, icon: '🙂', label: 'Bem' },
  { value: 3, icon: '😐', label: 'Mais ou menos' },
  { value: 2, icon: '😕', label: 'Mal' },
  { value: 1, icon: '😫', label: 'Muito mal' },
] as const;

export const FEELINGS = [
  { id: 'dor', icon: '⚡', label: 'Dor' },
  { id: 'cansaco', icon: '😮‍💨', label: 'Cansaço' },
  { id: 'falta-de-ar', icon: '🫁', label: 'Falta de ar' },
  { id: 'sono', icon: '😴', label: 'Sono' },
  { id: 'fome', icon: '🍽️', label: 'Fome' },
  { id: 'sede', icon: '💧', label: 'Sede' },
  { id: 'frio', icon: '🥶', label: 'Frio' },
  { id: 'calor', icon: '🥵', label: 'Calor' },
  { id: 'enjoo', icon: '🤢', label: 'Enjoo' },
  { id: 'medo', icon: '😨', label: 'Medo' },
  { id: 'tristeza', icon: '😢', label: 'Tristeza' },
  { id: 'ansiedade', icon: '😟', label: 'Ansiedade' },
  { id: 'saudade', icon: '🥺', label: 'Saudade' },
  { id: 'alegria', icon: '😄', label: 'Alegria' },
  { id: 'calma', icon: '😌', label: 'Calma' },
  { id: 'gratidao', icon: '🙏', label: 'Gratidão' },
] as const;

export interface FeelingEntry {
  id: string;
  at: number;
  mood: number; // 1..5
  feelings: string[];
  pain: number | null; // 0..10
  note: string;
}

// ---------------------------------------------------------------- lembretes
export type ReminderKind = 'remedio' | 'comida' | 'agua' | 'posicao' | 'fisio' | 'higiene' | 'consulta' | 'outro';

export const REMINDER_KINDS: Array<{ id: ReminderKind; icon: string; label: string }> = [
  { id: 'remedio', icon: '💊', label: 'Remédio' },
  { id: 'comida', icon: '🍽️', label: 'Comida' },
  { id: 'agua', icon: '💧', label: 'Água' },
  { id: 'posicao', icon: '🛏️', label: 'Mudar de posição' },
  { id: 'fisio', icon: '🤸', label: 'Fisioterapia' },
  { id: 'higiene', icon: '🧼', label: 'Higiene' },
  { id: 'consulta', icon: '🩺', label: 'Consulta' },
  { id: 'outro', icon: '⏰', label: 'Outro' },
];

export interface Reminder {
  id: string;
  kind: ReminderKind;
  title: string;
  times: string[]; // "HH:MM"
  /** dias da semana (0 = domingo). Vazio = todos os dias. */
  days: number[];
  note: string;
  /** familiares (ids) que recebem a notificação no celular */
  notify: string[];
  active: boolean;
  createdAt: number;
}

export type ReminderStatus = 'pendente' | 'feito' | 'adiado' | 'perdido';

export interface ReminderLog {
  key: string; // id|AAAA-MM-DD|HH:MM
  reminderId: string;
  title: string;
  kind: ReminderKind;
  scheduledAt: number;
  status: ReminderStatus;
  firedAt: number;
  doneAt: number | null;
  snoozeUntil: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** janela em que um lembrete atrasado ainda é avisado (ex.: o app estava fechado) */
export const DUE_WINDOW_MS = 30 * 60 * 1000;

export interface DueReminder {
  reminder: Reminder;
  time: string;
  key: string;
  scheduledAt: number;
  /** é um "adiado" que voltou */
  snoozed: boolean;
}

export function isValidTime(t: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/** quais lembretes precisam tocar AGORA */
export function dueReminders(reminders: Reminder[], logs: ReminderLog[], now: Date): DueReminder[] {
  const byKey = new Map(logs.map((l) => [l.key, l]));
  const out: DueReminder[] = [];
  const t = now.getTime();
  for (const r of reminders) {
    if (!r.active) continue;
    if (r.days.length && !r.days.includes(now.getDay())) continue;
    for (const time of r.times) {
      if (!isValidTime(time)) continue;
      const [h, m] = time.split(':').map(Number);
      const sched = new Date(now);
      sched.setHours(h, m, 0, 0);
      const s = sched.getTime();
      const key = `${r.id}|${dayKey(now)}|${time}`;
      const log = byKey.get(key);
      if (!log) {
        if (t >= s && t - s < DUE_WINDOW_MS) out.push({ reminder: r, time, key, scheduledAt: s, snoozed: false });
      } else if (log.status === 'adiado' && log.snoozeUntil !== null && t >= log.snoozeUntil) {
        out.push({ reminder: r, time, key, scheduledAt: s, snoozed: true });
      }
    }
  }
  return out.sort((a, b) => a.scheduledAt - b.scheduledAt);
}

/** próximos horários (para a tela mostrar "próximo: 20:00") */
export function nextOccurrence(r: Reminder, now: Date): Date | null {
  for (let add = 0; add < 8; add++) {
    const d = new Date(now);
    d.setDate(d.getDate() + add);
    if (r.days.length && !r.days.includes(d.getDay())) continue;
    const times = [...r.times].filter(isValidTime).sort();
    for (const time of times) {
      const [h, m] = time.split(':').map(Number);
      const c = new Date(d);
      c.setHours(h, m, 0, 0);
      if (c.getTime() > now.getTime()) return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------- relatório
export type Period = 'dia' | 'semana' | 'mes';

export function periodRange(period: Period, now: Date): { from: Date; to: Date; label: string } {
  const to = new Date(now);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (period === 'semana') from.setDate(from.getDate() - 6);
  if (period === 'mes') from.setDate(from.getDate() - 29);
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
  const label =
    period === 'dia' ? `Dia ${fmt(from)}` : period === 'semana' ? `Semana de ${fmt(from)} a ${fmt(to)}` : `Mês: ${fmt(from)} a ${fmt(to)}`;
  return { from, to, label };
}

export interface ReportInput {
  feelings: FeelingEntry[];
  phrases: Array<{ text: string; at: number }>;
  alerts: Array<{ at: number; kind: string; accidental: boolean; cancelledAt: number | null }>;
  reminderLogs: ReminderLog[];
}

export interface Report {
  label: string;
  from: number;
  to: number;
  checkins: number;
  moodAvg: number | null;
  moodByDay: Array<{ day: string; avg: number; count: number }>;
  feelingCounts: Array<{ id: string; label: string; count: number }>;
  painAvg: number | null;
  painMax: number | null;
  entries: FeelingEntry[];
  phrasesTotal: number;
  topPhrases: Array<{ text: string; count: number }>;
  alerts: ReportInput['alerts'];
  reminders: { total: number; done: number; missed: number; pending: number; logs: ReminderLog[] };
}

export function buildReport(input: ReportInput, period: Period, now: Date): Report {
  const { from, to, label } = periodRange(period, now);
  const inRange = (t: number) => t >= from.getTime() && t <= to.getTime();
  const entries = input.feelings.filter((e) => inRange(e.at)).sort((a, b) => a.at - b.at);

  const moodAvg = entries.length ? entries.reduce((a, e) => a + e.mood, 0) / entries.length : null;
  const days = new Map<string, number[]>();
  for (const e of entries) {
    const k = dayKey(new Date(e.at));
    days.set(k, [...(days.get(k) ?? []), e.mood]);
  }
  const moodByDay = [...days.entries()].map(([day, ms]) => ({ day, avg: ms.reduce((a, b) => a + b, 0) / ms.length, count: ms.length }));

  const counts = new Map<string, number>();
  for (const e of entries) for (const f of e.feelings) counts.set(f, (counts.get(f) ?? 0) + 1);
  const feelingCounts = FEELINGS.filter((f) => counts.has(f.id))
    .map((f) => ({ id: f.id, label: f.label, count: counts.get(f.id)! }))
    .sort((a, b) => b.count - a.count);

  const pains = entries.map((e) => e.pain).filter((p): p is number => p !== null);
  const phrases = input.phrases.filter((p) => inRange(p.at));
  const pc = new Map<string, number>();
  for (const p of phrases) pc.set(p.text, (pc.get(p.text) ?? 0) + 1);
  const topPhrases = [...pc.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const logs = input.reminderLogs.filter((l) => inRange(l.scheduledAt)).sort((a, b) => a.scheduledAt - b.scheduledAt);
  return {
    label,
    from: from.getTime(),
    to: to.getTime(),
    checkins: entries.length,
    moodAvg,
    moodByDay,
    feelingCounts,
    painAvg: pains.length ? pains.reduce((a, b) => a + b, 0) / pains.length : null,
    painMax: pains.length ? Math.max(...pains) : null,
    entries,
    phrasesTotal: phrases.length,
    topPhrases,
    alerts: input.alerts.filter((a) => inRange(a.at)).sort((a, b) => a.at - b.at),
    reminders: {
      total: logs.length,
      done: logs.filter((l) => l.status === 'feito').length,
      missed: logs.filter((l) => l.status === 'perdido').length,
      pending: logs.filter((l) => l.status === 'pendente' || l.status === 'adiado').length,
      logs,
    },
  };
}

export const moodLabel = (v: number | null) =>
  v === null ? 'sem registro' : MOODS.reduce((best, m) => (Math.abs(m.value - v) < Math.abs(best.value - v) ? m : best)).label;
