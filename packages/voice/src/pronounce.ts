/**
 * Prepara o texto para a VOZ ler certo (o texto na tela não muda).
 * Ex.: "Dr. João às 14h30 😊" → "doutor João às 14 horas e 30"
 */

const SAY: Array<[RegExp, string]> = [
  [/\bDra\.?(?=\s)/g, 'doutora'],
  [/\bDr\.?(?=\s)/g, 'doutor'],
  [/\bSra\.?(?=\s)/g, 'senhora'],
  [/\bSr\.?(?=\s)/g, 'senhor'],
  [/\betc\.?/gi, 'etcétera'],
  [/\b(tv)\b/gi, 'tevê'],
  [/\bwhats\s?app\b/gi, 'uótsap'],
  [/\bwi-?fi\b/gi, 'uai fai'],
  [/\bUTI\b/g, 'u tê i'],
  [/\bSUS\b/g, 'sus'],
  [/\bok\b/gi, 'ok'],
  [/\b(?:k{3,}|(?:rs){2,}|(?:ha){2,}|(?:hue){2,})\b/gi, 'rá rá rá'],
];

const unit = (n: string, one: string, many: string) => `${n} ${n === '1' ? one : many}`;

export function prepareForSpeech(input: string): string {
  let t = input
    // emojis e símbolos: a voz leria o nome do desenho ("rosto sorrindo")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\n+/g, '. ');
  // horas: 14h, 14h30, 14:30
  t = t.replace(/\b(\d{1,2})(?:h|:)(\d{2})\b/g, (_, h, m) => `${unit(String(+h), 'hora', 'horas')}${+m ? ` e ${+m}` : ''}`);
  t = t.replace(/\b(\d{1,2})\s?h\b/g, (_, h) => unit(String(+h), 'hora', 'horas'));
  // dinheiro e medidas
  t = t.replace(/R\$\s?(\d+)(?:,(\d{2}))?/g, (_, r, c) => `${unit(r, 'real', 'reais')}${c && +c ? ` e ${unit(String(+c), 'centavo', 'centavos')}` : ''}`);
  t = t.replace(/(\d)\s?%/g, '$1 por cento');
  t = t.replace(/(\d)\s?mg\b/gi, '$1 miligramas');
  t = t.replace(/(\d)\s?ml\b/gi, '$1 mililitros');
  t = t.replace(/(\d)\s?kg\b/gi, '$1 quilos');
  t = t.replace(/(\d)\s?(?:°|º)\s?C?\b/g, '$1 graus');
  for (const [re, say] of SAY) t = t.replace(re, say);
  // PALAVRAS EM MAIÚSCULAS: algumas vozes soletram ("N-Ã-O"); lemos como palavra normal
  t = t.replace(/\b\p{Lu}{4,}\b/gu, (w) => w.toLowerCase());
  return t.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

/**
 * Divide em pedaços de frase: o Chrome corta falas longas (~15 s) no meio.
 */
export function splitForSpeech(text: string, max = 180): string[] {
  const parts = text.match(/[^.!?;]+[.!?;]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    if (p.length > max) {
      for (const piece of p.split(/(?<=,)\s+/)) {
        if ((cur + piece).length > max && cur) {
          out.push(cur.trim());
          cur = '';
        }
        cur += `${piece} `;
      }
    } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
