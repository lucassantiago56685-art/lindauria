import { describe, expect, it } from 'vitest';
import { prepareForSpeech, splitForSpeech } from './pronounce';

describe('pronúncia', () => {
  it('lê horas, títulos, dinheiro e tira emojis', () => {
    expect(prepareForSpeech('Consulta com a Dra. Ana às 14h30 😊')).toBe('Consulta com a doutora Ana às 14 horas e 30');
    expect(prepareForSpeech('Remédio às 8h')).toBe('Remédio às 8 horas');
    expect(prepareForSpeech('Custa R$ 10,50')).toBe('Custa 10 reais e 50 centavos');
    expect(prepareForSpeech('Tomar 500mg')).toBe('Tomar 500 miligramas');
    expect(prepareForSpeech('liga a TV kkkk')).toBe('liga a tevê rá rá rá');
    expect(prepareForSpeech('SOCORRO agora')).toBe('socorro agora');
  });
  it('divide textos longos em frases', () => {
    const long = 'Primeira frase bem comprida. '.repeat(12);
    const parts = splitForSpeech(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 180)).toBe(true);
  });
});
