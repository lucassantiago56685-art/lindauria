import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL_WINDOW_MS, EmergencyController } from './emergency';

describe('EmergencyController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const calls: string[] = [];
    const hooks = {
      startAlarm: vi.fn(() => calls.push('alarm')),
      stopAlarm: vi.fn(),
      speak: vi.fn(),
      notifyRemote: vi.fn(async () => true),
      log: vi.fn(),
    };
    return { c: new EmergencyController(hooks), hooks, calls };
  };

  it('alarme local começa IMEDIATAMENTE, sem esperar nada', () => {
    const { c, hooks } = make();
    c.trigger('gesture');
    expect(hooks.startAlarm).toHaveBeenCalledTimes(1);
  });

  it('aviso remoto sai após a janela de cancelamento se ninguém cancelar', () => {
    const { c, hooks } = make();
    c.trigger('gesture');
    vi.advanceTimersByTime(CANCEL_WINDOW_MS - 1);
    expect(hooks.notifyRemote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(hooks.notifyRemote).toHaveBeenCalledTimes(1);
  });

  it('cancelar na janela marca como acidental e não envia aviso remoto', () => {
    const { c, hooks } = make();
    c.trigger('gesture');
    vi.advanceTimersByTime(2000);
    const e = c.cancel();
    expect(e?.accidental).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(hooks.notifyRemote).not.toHaveBeenCalled();
    expect(hooks.stopAlarm).toHaveBeenCalled();
  });

  it('dispara de novo não duplica alarme', () => {
    const { c, hooks } = make();
    c.trigger('gesture');
    c.trigger('button', 'falta-de-ar');
    expect(hooks.startAlarm).toHaveBeenCalledTimes(1);
    expect(c.active?.kind).toBe('falta-de-ar');
  });

  it('modo imediato: família é avisada no mesmo instante do alarme', () => {
    const { hooks } = make();
    const c = new EmergencyController(hooks, 0);
    c.trigger('gesture');
    expect(hooks.notifyRemote).toHaveBeenCalledTimes(1);
  });

  it('cancelado depois do aviso: família recebe "foi sem querer"', () => {
    const { hooks } = make();
    const notifyCancelled = vi.fn();
    const c = new EmergencyController({ ...hooks, notifyCancelled }, 0);
    c.trigger('gesture');
    const e = c.cancel();
    expect(notifyCancelled).toHaveBeenCalledWith(e);
    expect(e?.accidental).toBe(true);
  });

  it('mudar o tipo depois do aviso envia atualização', () => {
    const { hooks } = make();
    const notifyKindChange = vi.fn();
    const c = new EmergencyController({ ...hooks, notifyKindChange }, 0);
    c.trigger('gesture');
    c.trigger('button', 'engasgo');
    expect(notifyKindChange).toHaveBeenCalledTimes(1);
  });

  it('repete a frase de socorro enquanto ativo', () => {
    const { c, hooks } = make();
    c.trigger('gesture');
    vi.advanceTimersByTime(13_000);
    expect(hooks.speak.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
