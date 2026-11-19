import { create } from 'zustand';
import { secureGet, secureSet } from '@lindauria/shared';
import { NtfyNotifier } from '@lindauria/safety';
import { getSettings } from '../store/settings';
import {
  REMINDER_KINDS,
  dueReminders,
  hhmm,
  type DueReminder,
  type FeelingEntry,
  type Reminder,
  type ReminderLog, reminderTargets } from './care-logic';
import { canReceiveAlerts, patientDisplayName, useFamily } from './family';
import { enqueue } from './outbox';

/* =============================================================================================
   Cuidados do dia a dia: "Como estou" (o que a pessoa sente), lembretes e seus registros.
   Tudo criptografado no aparelho. Lembretes avisam o paciente (som + voz) e o familiar
   escolhido (notificação no celular), no horário definido pela família/equipe de saúde.
   O app NUNCA sugere remédio nem dose: só lembra o que foi cadastrado.
   ============================================================================================= */

const K = { feelings: 'feelings', reminders: 'reminders', logs: 'reminder-logs' } as const;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface CareState {
  loaded: boolean;
  feelings: FeelingEntry[];
  reminders: Reminder[];
  logs: ReminderLog[];
  /** lembrete tocando agora (tela grande) */
  ringing: DueReminder | null;
  load: () => Promise<void>;
  addFeeling: (e: Omit<FeelingEntry, 'id' | 'at'>) => void;
  removeFeeling: (id: string) => void;
  saveReminder: (r: Omit<Reminder, 'id' | 'createdAt'> & { id?: string }) => void;
  removeReminder: (id: string) => void;
}

export const useCare = create<CareState>((set, get) => ({
  loaded: false,
  feelings: [],
  reminders: [],
  logs: [],
  ringing: null,
  load: async () => {
    if (get().loaded) return;
    const [feelings, reminders, logs] = await Promise.all([
      secureGet<FeelingEntry[]>(K.feelings),
      secureGet<Reminder[]>(K.reminders),
      secureGet<ReminderLog[]>(K.logs),
    ]);
    set({ feelings: feelings ?? [], reminders: reminders ?? [], logs: logs ?? [], loaded: true });
  },
  addFeeling: (e) => {
    const feelings = [...get().feelings, { ...e, id: newId(), at: Date.now() }].slice(-3000);
    set({ feelings });
    void secureSet(K.feelings, feelings);
  },
  removeFeeling: (id) => {
    const feelings = get().feelings.filter((f) => f.id !== id);
    set({ feelings });
    void secureSet(K.feelings, feelings);
  },
  saveReminder: (r) => {
    const list = get().reminders;
    const item: Reminder = r.id
      ? { ...(list.find((x) => x.id === r.id) as Reminder), ...r, id: r.id }
      : { ...r, id: newId(), createdAt: Date.now() };
    const reminders = r.id ? list.map((x) => (x.id === r.id ? item : x)) : [...list, item];
    set({ reminders });
    void secureSet(K.reminders, reminders);
  },
  removeReminder: (id) => {
    const reminders = get().reminders.filter((x) => x.id !== id);
    set({ reminders });
    void secureSet(K.reminders, reminders);
  },
}));

function upsertLog(log: ReminderLog) {
  const logs = [...useCare.getState().logs.filter((l) => l.key !== log.key), log].slice(-5000);
  useCare.setState({ logs });
  void secureSet(K.logs, logs);
}

const kindOf = (k: Reminder['kind']) => REMINDER_KINDS.find((x) => x.id === k)!;

/** avisa no celular os familiares escolhidos para este lembrete (só os autorizados pelo paciente) */
function notifyFamily(r: Reminder, title: string, message: string, tags: string[], priority: 2 | 3 | 4) {
  const members = reminderTargets(r, useFamily.getState().list.filter(canReceiveAlerts));
  const n = new NtfyNotifier(getSettings().alertServer);
  for (const m of members) {
    const msg = { title, message, priority, tags };
    // sem internet: guarda na fila e envia quando a conexão voltar
    void n.sendText(m.topic, msg).catch(() => enqueue({ topic: m.topic, msg, memberId: m.id, kind: 'reminder' }));
  }
}

// ---- ganchos do engine (voz e som) sem import circular ----
let onRing: (d: DueReminder) => void = () => undefined;
export function setReminderRingHandler(fn: (d: DueReminder) => void) {
  onRing = fn;
}

function fire(d: DueReminder) {
  const now = Date.now();
  upsertLog({
    key: d.key,
    reminderId: d.reminder.id,
    title: d.reminder.title,
    kind: d.reminder.kind,
    scheduledAt: d.scheduledAt,
    status: 'pendente',
    firedAt: now,
    doneAt: null,
    snoozeUntil: null,
  });
  useCare.setState({ ringing: d });
  onRing(d);
  const k = kindOf(d.reminder.kind);
  notifyFamily(
    d.reminder,
    `⏰ ${k.label}: ${d.reminder.title} — ${patientDisplayName()}`,
    `${d.snoozed ? 'Lembrete adiado: ' : ''}horário das ${d.time}.${d.reminder.note ? ` ${d.reminder.note}` : ''}`,
    ['alarm_clock'],
    4,
  );
}

export function markDone(d: DueReminder) {
  const log = useCare.getState().logs.find((l) => l.key === d.key);
  if (log) upsertLog({ ...log, status: 'feito', doneAt: Date.now(), snoozeUntil: null });
  useCare.setState({ ringing: null });
  notifyFamily(d.reminder, `✔ Feito: ${d.reminder.title} — ${patientDisplayName()}`, `Confirmado às ${hhmm(new Date())}.`, ['heavy_check_mark', 'reminder-done'], 2);
}

export function snooze(d: DueReminder, minutes = 10) {
  const log = useCare.getState().logs.find((l) => l.key === d.key);
  if (log) upsertLog({ ...log, status: 'adiado', snoozeUntil: Date.now() + minutes * 60_000 });
  useCare.setState({ ringing: null });
}

let timer: ReturnType<typeof setInterval> | null = null;

/** relógio dos lembretes: confere a cada 20 s (só funciona com o app aberto) */
export function startReminderScheduler() {
  if (timer) return;
  const tick = () => {
    const st = useCare.getState();
    if (!st.loaded || st.ringing) return;
    const now = new Date();
    // pendentes há mais de 2 horas viram "perdido" (para o relatório)
    for (const l of st.logs) {
      if ((l.status === 'pendente' || l.status === 'adiado') && now.getTime() - l.scheduledAt > 2 * 3600_000) {
        upsertLog({ ...l, status: 'perdido' });
      }
    }
    const due = dueReminders(st.reminders, useCare.getState().logs, now);
    if (due.length) fire(due[0]);
  };
  timer = setInterval(tick, 20_000);
  setTimeout(tick, 3000);
}
