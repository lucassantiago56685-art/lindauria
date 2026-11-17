import { describe, expect, it } from 'vitest';
import { ALARM_MIN_VOLUME, DEFAULT_SETTINGS, sanitizeSettings } from './settings';
import { createPin, verifyPin } from './pin';

describe('sanitizeSettings', () => {
  it('preenche padrões quando não há nada salvo', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('corrige valores fora dos limites', () => {
    const s = sanitizeSettings({ dwellMs: 50, fontSizePx: 99 });
    expect(s.dwellMs).toBe(400);
    expect(s.fontSizePx).toBe(48);
  });
  it('quem já usava o app recebe o cursor mais lento (migração para v3)', () => {
    const s = sanitizeSettings({ sensitivity: 2, smoothing: 0.2, dwellMs: 1500 });
    expect(s.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
    expect(s.smoothing).toBe(DEFAULT_SETTINGS.smoothing);
    expect(s.dwellMs).toBe(1500); // o resto é mantido
    // depois de migrado, a escolha do cuidador é respeitada
    expect(sanitizeSettings({ ...s, sensitivity: 2 }).sensitivity).toBe(2);
  });
  it('calibração antiga (nariz) é descartada na v4 para recalibrar com a pose 3D', () => {
    const cal = { center: { x: 0, y: 0.5 }, right: { x: -0.2, y: 0.5 }, left: { x: 0.2, y: 0.5 }, up: { x: 0, y: 0.4 }, down: { x: 0, y: 0.6 }, blinkThreshold: 0.4, createdAt: 1 };
    expect(sanitizeSettings({ calibration: cal, settingsVersion: 3 }).calibration).toBeNull();
    expect(sanitizeSettings({ calibration: { ...cal, source: 'pose' }, settingsVersion: 3 }).calibration).not.toBeNull();
  });
  it('nunca deixa o alarme de emergência baixo demais', () => {
    const s = sanitizeSettings({ sounds: { focus: 0, click: 0, sent: 0, alarm: 0 } });
    expect(s.sounds.alarm).toBeGreaterThanOrEqual(ALARM_MIN_VOLUME);
  });
});

describe('PIN do cuidador', () => {
  it('aceita o PIN certo e recusa o errado', async () => {
    const rec = await createPin('2580');
    expect(rec.hash).not.toContain('2580');
    expect(await verifyPin('2580', rec)).toBe(true);
    expect(await verifyPin('0000', rec)).toBe(false);
  });
});
