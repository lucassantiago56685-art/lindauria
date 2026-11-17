import { autoCapitalize, correctText, correctWord } from './text';

/**
 * Edição de texto do teclado. Funções puras (fáceis de testar):
 *  - letra no começo de frase vira maiúscula sozinha;
 *  - ao digitar espaço ou pontuação, a palavra anterior é corrigida
 *    ("nao " → "não ", "vc " → "você ", "qeuro " → "quero ");
 *  - pontuação "gruda" na palavra e ganha espaço depois.
 */

const atSentenceStart = (text: string) => text.trim() === '' || /[.!?]\s+$/.test(text);

export function typeChar(text: string, ch: string): string {
  if (/\p{L}/u.test(ch)) {
    return text + (atSentenceStart(text) ? ch.toUpperCase() : ch.toLowerCase());
  }
  const fixed = text.replace(/\p{L}+$/u, (w) => correctWord(w));
  if (ch === ' ') return fixed.endsWith(' ') || fixed === '' ? fixed : `${fixed} `;
  return `${fixed.replace(/\s+$/, '')}${ch} `;
}

/** Apaga o último caractere (seguro para emojis). */
export function backspace(text: string): string {
  const chars = Array.from(text);
  chars.pop();
  return chars.join('');
}

/** Apaga a última palavra (e o espaço depois dela). */
export function deleteWord(text: string): string {
  return text.replace(/\S+\s*$/u, '');
}

/**
 * Texto final para falar/enviar: palavras corrigidas, espaços limpos, sem espaço antes da
 * pontuação, maiúsculas no começo das frases e ponto final (a voz entoa melhor).
 */
export function finalizeText(text: string): string {
  let t = correctText(text.replace(/\s+/g, ' ').trim())
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])(?=\p{L})/gu, '$1 ');
  if (t && /[\p{L}\d)]$/u.test(t)) t += '.';
  return autoCapitalize(t);
}
