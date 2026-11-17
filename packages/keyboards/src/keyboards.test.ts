import { describe, expect, it } from 'vitest';
import { FREQUENCY, QWERTY } from './layouts';
import { Predictor, applySuggestion } from './predictor';
import { accentText, accentWord, autoCapitalize, editDistance } from './text';
import { WpmMeter } from './wpm';
import { backspace, deleteWord, finalizeText, typeChar } from './editing';

describe('Acentuação automática', () => {
  it('corrige palavras comuns', () => {
    expect(accentWord('nao')).toBe('não');
    expect(accentWord('voce')).toBe('você');
    expect(accentWord('Voce')).toBe('Você');
    expect(accentWord('agua')).toBe('água');
    expect(accentWord('remedio')).toBe('remédio');
  });
  it('não mexe em palavras ambíguas', () => {
    expect(accentWord('e')).toBe('e');
    expect(accentWord('avo')).toBe('avo'); // avô ou avó? a pessoa decide
    expect(accentWord('nos')).toBe('nos');
  });
  it('acentua a frase inteira', () => {
    expect(accentText('voce nao esta com sede')).toBe('você não está com sede');
  });
  it('maiúscula no começo de frase', () => {
    expect(autoCapitalize('oi. tudo bem? sim')).toBe('Oi. Tudo bem? Sim');
  });
});

describe('Previsão de palavras', () => {
  it('completa a palavra ignorando acento', () => {
    const p = new Predictor();
    const s = p.predict({ text: 'quero agu' });
    expect(s[0].text).toBe('água');
  });
  it('sugere próxima palavra por bigrama', () => {
    const p = new Predictor();
    const s = p.predict({ text: 'bom ' }).map((x) => x.text);
    expect(s).toContain('dia');
  });
  it('aprende o vocabulário da pessoa (nomes, apelidos)', () => {
    const p = new Predictor();
    expect(p.predict({ text: 'tuc' }).map((x) => x.text)).not.toContain('tuca');
    p.learn('Chama a Tuca por favor');
    p.learn('Tuca vem aqui');
    expect(p.predict({ text: 'tuc' })[0].text).toBe('tuca');
  });
  it('expande atalhos pessoais', () => {
    const p = new Predictor();
    const s = p.predict({ text: 'bd', shortcuts: { bd: 'Bom dia, tudo bem com você?' } });
    expect(s[0]).toEqual({ text: 'Bom dia, tudo bem com você?', kind: 'shortcut' });
  });
  it('tolera erro de mira de uma letra', () => {
    const p = new Predictor();
    // "rwmedio": W está ao lado do E no QWERTY
    const s = p.predict({ text: 'rwmed' }).map((x) => x.text);
    expect(s).toContain('remédio');
  });
  it('modelo pessoal pode ser exportado, importado e apagado', () => {
    const p = new Predictor();
    p.learn('quero ver a novela');
    const m = p.exportUserModel();
    const q = new Predictor();
    q.importUserModel(m);
    expect(q.exportUserModel().unigrams.novela).toBe(1);
    q.clearUserModel();
    expect(q.exportUserModel().unigrams).toEqual({});
  });
  it('aplica sugestão trocando a palavra em andamento', () => {
    expect(applySuggestion('quero agu', { text: 'água', kind: 'completion' })).toBe('quero água ');
    expect(applySuggestion('', { text: 'eu', kind: 'next' })).toBe('Eu ');
    expect(applySuggestion('Oi. ', { text: 'tudo', kind: 'next' })).toBe('Oi. Tudo ');
  });
});

describe('Layouts', () => {
  it('QWERTY tem todas as letras', () => {
    const all = QWERTY.rows.flat().join('');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(all).toContain(ch);
  });
  it('Frequência PT-BR põe A e E no centro', () => {
    const rows = FREQUENCY.rows;
    const pos = (ch: string) => {
      for (let r = 0; r < rows.length; r++) {
        const c = rows[r].indexOf(ch);
        if (c >= 0) return { r, c };
      }
      throw new Error(ch);
    };
    for (const ch of ['A', 'E']) {
      const { r, c } = pos(ch);
      expect([1, 2]).toContain(r);
      expect([3, 4]).toContain(c);
    }
    const all = rows.flat().join('');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(all).toContain(ch);
  });
});

describe('Edição', () => {
  it('maiúscula no começo, acento ao dar espaço, pontuação colada', () => {
    let t = '';
    for (const ch of ['N', 'A', 'O', ' ', 'Q', 'U', 'E', 'R', 'O', '.', 'O', 'I']) t = typeChar(t, ch);
    expect(t).toBe('Não quero. Oi');
  });
  it('apaga letra e palavra', () => {
    expect(backspace('oi 👍')).toBe('oi ');
    expect(deleteWord('quero água ')).toBe('quero ');
    expect(deleteWord('quero ág')).toBe('quero ');
  });
  it('finaliza texto para falar', () => {
    expect(finalizeText('  voce   esta bem?  ')).toBe('Você está bem?');
  });
});

describe('Utilitários', () => {
  it('distância de edição com troca de letras', () => {
    expect(editDistance('agau', 'agua')).toBe(1);
    expect(editDistance('casa', 'casa')).toBe(0);
  });
  it('WPM ignora pausas longas', () => {
    const m = new WpmMeter(15_000);
    let t = 0;
    for (let i = 0; i < 50; i++) m.add(1, (t += 1200)); // 50 chars em 60 s
    t += 600_000; // 10 min de pausa
    m.add(1, t);
    expect(m.wpm).toBeGreaterThan(9);
    expect(m.wpm).toBeLessThan(11);
  });
});
