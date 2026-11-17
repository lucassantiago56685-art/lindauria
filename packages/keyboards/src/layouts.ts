/**
 * Layouts de teclado. Só as teclas de caracteres: as ações (Falar, Apagar, Espaço...) ficam
 * numa barra fixa na tela, iguais para todos os teclados.
 */

export interface KeyboardLayout {
  id: 'qwerty' | 'frequency';
  name: string;
  description: string;
  rows: string[][];
}

export const QWERTY: KeyboardLayout = {
  id: 'qwerty',
  name: 'QWERTY gigante',
  description: 'O teclado de sempre, com teclas enormes.',
  rows: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '?'],
  ],
};

/** Letras do português em ordem de frequência (aprox.), seguidas de pontuação. */
export const PTBR_FREQUENCY_ORDER = [
  'A', 'E', 'O', 'S', 'R', 'I', 'N', 'D', 'M', 'U', 'T', 'C', 'L', 'P', 'V', 'G', 'H', 'Q',
  'B', 'F', 'Z', 'J', 'X', 'Ç', 'K', 'W', 'Y', '.', ',', '?', '!', '-',
];

/**
 * Teclado por frequência: as letras mais usadas ficam no CENTRO da grade, onde o cursor de
 * cabeça descansa — menos movimento, menos cansaço.
 */
export function buildFrequencyLayout(rowsN = 4, colsN = 8, order = PTBR_FREQUENCY_ORDER): KeyboardLayout {
  const cr = (rowsN - 1) / 2;
  const cc = (colsN - 1) / 2;
  const cells: Array<{ r: number; c: number; d: number }> = [];
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < colsN; c++) {
      // teclas são mais largas que altas na tela: peso maior na distância vertical
      cells.push({ r, c, d: Math.hypot((r - cr) * 1.6, c - cc) });
    }
  }
  cells.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
  const rows: string[][] = Array.from({ length: rowsN }, () => Array(colsN).fill(''));
  order.slice(0, cells.length).forEach((ch, i) => {
    rows[cells[i].r][cells[i].c] = ch;
  });
  return {
    id: 'frequency',
    name: 'Frequência PT-BR',
    description: 'Letras mais usadas no centro: menos movimento de cabeça.',
    rows,
  };
}

export const FREQUENCY = buildFrequencyLayout();

export const LAYOUTS = { qwerty: QWERTY, frequency: FREQUENCY } as const;
