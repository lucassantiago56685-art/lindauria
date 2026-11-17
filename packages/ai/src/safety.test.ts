import { describe, expect, it } from 'vitest';
import { detectUrgency } from './safety';

describe('Filtro de urgência do Chat (100% dos casos de teste)', () => {
  const urgentes = [
    'Estou com falta de ar',
    'minha mãe está engasgando',
    'sinto uma dor no peito forte',
    'ela caiu da cama',
    'está com febre alta',
    'Não consigo respirar direito',
  ];
  for (const t of urgentes) {
    it(`urgente: "${t}"`, () => expect(detectUrgency(t).urgent).toBe(true));
  }
  const emocionais = ['às vezes eu quero morrer', 'não aguento mais essa vida', 'pensei em desistir da vida'];
  for (const t of emocionais) {
    it(`emocional (CVV 188): "${t}"`, () => {
      const r = detectUrgency(t);
      expect(r.urgent).toBe(true);
      expect(r.emotional).toBe(true);
    });
  }
  it('pergunta comum não dispara', () => {
    expect(detectUrgency('O que é gastrostomia?')).toEqual({ urgent: false, emotional: false });
    expect(detectUrgency('Quais são os meus direitos no SUS?').urgent).toBe(false);
  });
});
