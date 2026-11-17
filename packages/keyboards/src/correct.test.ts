import { describe, expect, it } from 'vitest';
import { correctText, correctWord, setAutoCorrect } from './text';
import { finalizeText, typeChar } from './editing';

describe('correção ao escrever', () => {
  it('abreviações viram palavras', () => {
    expect(correctWord('vc')).toBe('você');
    expect(correctWord('Pq')).toBe('Porque');
    expect(correctText('hj eu qro agua')).toBe('hoje eu quero água');
  });
  it('letra trocada, sobrando ou faltando', () => {
    expect(correctWord('qeuro')).toBe('quero');
    expect(correctWord('obrigadoo')).toBe('obrigado');
    expect(correctWord('remdio')).toBe('remédio');
    expect(correctWord('cabeca')).toBe('cabeça');
  });
  it('não mexe em nomes e palavras desconhecidas sem parecido', () => {
    expect(correctWord('Lindaura')).toBe('Lindaura');
    expect(correctWord('xyzw')).toBe('xyzw');
  });
  it('pode desligar a correção de letras', () => {
    setAutoCorrect(false);
    expect(correctWord('qeuro')).toBe('qeuro');
    expect(correctWord('vc')).toBe('você');
    setAutoCorrect(true);
  });
  it('corrige ao digitar espaço', () => {
    let t = '';
    for (const ch of 'vc ') t = typeChar(t, ch);
    expect(t).toBe('Você ');
  });
  it('texto final fica certinho', () => {
    expect(finalizeText('oi vc ta bem ,  qro agua')).toBe('Oi você tá bem, quero água.');
    expect(finalizeText('estou com dor')).toBe('Estou com dor.');
  });
});
