import { describe, expect, it } from 'vitest';
import { buildReport, dueReminders, nextOccurrence, type FeelingEntry, type Reminder, type ReminderLog } from './care-logic';

const rem = (p: Partial<Reminder> = {}): Reminder => ({
  id: 'r1',
  kind: 'remedio',
  title: 'Remédio da pressão',
  times: ['08:00', '20:00'],
  days: [],
  note: '',
  notify: [],
  active: true,
  createdAt: 0,
  ...p,
});
const at = (s: string) => new Date(s);

describe('Lembretes', () => {
  it('toca na hora certa', () => {
    const due = dueReminders([rem()], [], at('2026-11-17T08:00:30'));
    expect(due.map((d) => d.time)).toEqual(['08:00']);
  });
  it('não toca antes da hora', () => {
    expect(dueReminders([rem()], [], at('2026-11-17T07:59:00'))).toHaveLength(0);
  });
  it('não toca duas vezes o mesmo horário', () => {
    const log: ReminderLog = {
      key: 'r1|2026-11-17|08:00', reminderId: 'r1', title: '', kind: 'remedio',
      scheduledAt: at('2026-11-17T08:00').getTime(), status: 'pendente',
      firedAt: 0, doneAt: null, snoozeUntil: null,
    };
    expect(dueReminders([rem()], [log], at('2026-11-17T08:05'))).toHaveLength(0);
  });
  it('"daqui 10 minutos" volta a tocar depois', () => {
    const log: ReminderLog = {
      key: 'r1|2026-11-17|08:00', reminderId: 'r1', title: '', kind: 'remedio',
      scheduledAt: at('2026-11-17T08:00').getTime(), status: 'adiado',
      firedAt: 0, doneAt: null, snoozeUntil: at('2026-11-17T08:10').getTime(),
    };
    expect(dueReminders([rem()], [log], at('2026-11-17T08:05'))).toHaveLength(0);
    expect(dueReminders([rem()], [log], at('2026-11-17T08:11'))[0].snoozed).toBe(true);
  });
  it('respeita os dias da semana e lembretes desligados', () => {
    // 17/11/2026 é terça-feira (2)
    expect(dueReminders([rem({ days: [1, 3] })], [], at('2026-11-17T08:01'))).toHaveLength(0);
    expect(dueReminders([rem({ active: false })], [], at('2026-11-17T08:01'))).toHaveLength(0);
  });
  it('próximo horário', () => {
    expect(nextOccurrence(rem(), at('2026-11-17T09:00'))?.getHours()).toBe(20);
    expect(nextOccurrence(rem(), at('2026-11-17T21:00'))?.getDate()).toBe(18);
  });
});

describe('Relatório', () => {
  const e = (iso: string, mood: number, feelings: string[], pain: number | null = null): FeelingEntry => ({
    id: iso, at: at(iso).getTime(), mood, feelings, pain, note: '',
  });
  const input = {
    feelings: [
      e('2026-11-17T09:00', 4, ['calma']),
      e('2026-11-17T15:00', 2, ['dor', 'cansaco'], 6),
      e('2026-11-15T10:00', 5, ['alegria']),
      e('2026-10-01T10:00', 1, ['dor'], 9), // fora da semana e do mês
    ],
    phrases: [
      { text: 'Estou com sede.', at: at('2026-11-17T10:00').getTime() },
      { text: 'Estou com sede.', at: at('2026-11-17T12:00').getTime() },
      { text: 'Te amo.', at: at('2026-11-16T12:00').getTime() },
    ],
    alerts: [{ at: at('2026-11-17T11:00').getTime(), kind: 'geral', accidental: true, cancelledAt: 1 }],
    reminderLogs: [],
  };
  it('resumo do dia', () => {
    const r = buildReport(input, 'dia', at('2026-11-17T22:00'));
    expect(r.checkins).toBe(2);
    expect(r.moodAvg).toBe(3);
    expect(r.painMax).toBe(6);
    expect(r.feelingCounts.map((f) => f.id)).toContain('dor');
    expect(r.topPhrases[0]).toEqual({ text: 'Estou com sede.', count: 2 });
    expect(r.alerts).toHaveLength(1);
  });
  it('semana inclui os dias anteriores, mas não o mês passado', () => {
    const r = buildReport(input, 'semana', at('2026-11-17T22:00'));
    expect(r.checkins).toBe(3);
    expect(r.moodByDay).toHaveLength(2);
    expect(r.painMax).toBe(6);
  });
});

import { reminderTargets } from './care-logic';
describe('quem recebe o lembrete', () => {
  const fam = [{ id: 'a' }, { id: 'b' }];
  it('todos (inclusive cadastrados depois) quando "*" ou vazio', () => {
    expect(reminderTargets({ notify: ['*'] }, fam)).toHaveLength(2);
    expect(reminderTargets({ notify: [] }, fam)).toHaveLength(2);
  });
  it('só os escolhidos, ou ninguém', () => {
    expect(reminderTargets({ notify: ['b'] }, fam)).toEqual([{ id: 'b' }]);
    expect(reminderTargets({ notify: ['nenhum'] }, fam)).toEqual([]);
  });
});

import { buildReport as build2, routineFor } from './care-logic';
describe('frases de rotina por horário', () => {
  it('escolhe o período certo', () => {
    expect(routineFor(7).id).toBe('manha');
    expect(routineFor(14).id).toBe('tarde');
    expect(routineFor(20).id).toBe('noite');
    expect(routineFor(23).id).toBe('madrugada');
    expect(routineFor(3).id).toBe('madrugada');
  });
});
describe('mapa de dor no relatório', () => {
  it('soma as áreas e ignora humor "não informado" na média', () => {
    const now = new Date(2026, 10, 19, 15, 0);
    const at = now.getTime() - 3600_000;
    const r = build2(
      {
        feelings: [
          { id: '1', at, mood: 0, feelings: ['dor'], pain: 7, note: '', painAreas: [{ area: 'lombar', level: 7, types: ['queimacao'] }] },
          { id: '2', at, mood: 4, feelings: [], pain: null, note: '' },
          { id: '3', at, mood: 0, feelings: ['dor'], pain: 3, note: '', painAreas: [{ area: 'lombar', level: 3, types: [] }, { area: 'pe-d', level: 3, types: [] }] },
        ],
        phrases: [],
        alerts: [],
        reminderLogs: [],
      },
      'dia',
      now,
    );
    expect(r.moodAvg).toBe(4);
    expect(r.painAreas[0]).toMatchObject({ id: 'lombar', count: 2, max: 7 });
    expect(r.painAreas.map((a) => a.id)).toContain('pe-d');
  });
});
