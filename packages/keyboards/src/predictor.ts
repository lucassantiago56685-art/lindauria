import { BIGRAMS_PTBR, LEXICON_PTBR, STARTERS_PTBR } from './lexicon-ptbr';
import { editDistance, learnAccentForms, normalize, tokenize } from './text';

/**
 * Previsão de palavras 100% LOCAL (funciona offline), modelo n-grama simples:
 *  - léxico base PT-BR (frequência)
 *  - pares de palavras (bigramas) base + aprendidos
 *  - vocabulário pessoal aprendido com tudo que a pessoa fala (pesa mais que o léxico)
 *  - atalhos pessoais ("bd" → "Bom dia, tudo bem com você?")
 *  - autocorreção tolerante a erro de mira (1 letra errada/trocada no começo da palavra)
 *
 * Na Fase 2, um modelo de linguagem (via backend) complementa estas sugestões quando houver
 * internet; este modelo continua sendo o fallback offline.
 */

export interface UserModel {
  version: 1;
  unigrams: Record<string, number>;
  bigrams: Record<string, number>;
}

export interface Suggestion {
  /** texto que substitui a palavra em andamento */
  text: string;
  kind: 'completion' | 'next' | 'shortcut' | 'correction';
}

export interface PredictContext {
  /** texto inteiro já digitado */
  text: string;
  shortcuts?: Record<string, string>;
  max?: number;
}

export class Predictor {
  private base = new Map<string, number>(); // palavra → 0..1
  private baseBigrams = new Map<string, Set<string>>();
  private user: UserModel = { version: 1, unigrams: {}, bigrams: {} };
  private byNorm = new Map<string, string>(); // forma normalizada → forma preferida

  constructor() {
    const n = LEXICON_PTBR.length;
    LEXICON_PTBR.forEach((w, i) => {
      this.base.set(w, 1 - i / n);
      const k = normalize(w);
      if (!this.byNorm.has(k)) this.byNorm.set(k, w);
    });
    for (const pair of BIGRAMS_PTBR) {
      const [a, b] = pair.split(' ');
      if (!a || !b) continue;
      if (!this.baseBigrams.has(a)) this.baseBigrams.set(a, new Set());
      this.baseBigrams.get(a)!.add(b);
    }
  }

  // ---- modelo pessoal ----
  exportUserModel(): UserModel {
    return structuredClone(this.user);
  }
  importUserModel(m: UserModel | null) {
    if (!m || m.version !== 1) return;
    this.user = structuredClone(m);
    for (const w of Object.keys(this.user.unigrams)) this.addWord(w);
    learnAccentForms(Object.keys(this.user.unigrams));
  }
  /** Apaga o que foi aprendido (LGPD / pedido da pessoa). */
  clearUserModel() {
    this.user = { version: 1, unigrams: {}, bigrams: {} };
  }

  private addWord(w: string) {
    const k = normalize(w);
    // a forma que a pessoa usa vence a do léxico
    this.byNorm.set(k, w);
  }

  /** Aprende com uma frase que a pessoa decidiu falar/enviar. */
  learn(sentence: string) {
    const words = tokenize(sentence);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length < 1) continue;
      this.user.unigrams[w] = (this.user.unigrams[w] ?? 0) + 1;
      this.addWord(w);
      if (i > 0) {
        const key = `${words[i - 1]} ${w}`;
        this.user.bigrams[key] = (this.user.bigrams[key] ?? 0) + 1;
      }
    }
    learnAccentForms(words);
  }

  private score(word: string, prev: string | null): number {
    const base = this.base.get(word) ?? 0;
    const u = this.user.unigrams[word] ?? 0;
    const userScore = u / (u + 2);
    let bi = 0;
    if (prev) {
      if (this.baseBigrams.get(prev)?.has(word)) bi += 1;
      const ub = this.user.bigrams[`${prev} ${word}`] ?? 0;
      bi += (ub / (ub + 1)) * 1.5;
    }
    return base + userScore * 1.5 + bi * 2;
  }

  private allWords(): Iterable<string> {
    return this.byNorm.values();
  }

  /**
   * Sugestões para o texto atual.
   * Se a última palavra está incompleta → completa. Se terminou em espaço → próxima palavra.
   */
  predict({ text, shortcuts = {}, max = 5 }: PredictContext): Suggestion[] {
    const endsWithSpace = text.length === 0 || /\s$/.test(text);
    const words = tokenize(text);
    const partial = endsWithSpace ? '' : (words[words.length - 1] ?? '');
    const prevWords = endsWithSpace ? words : words.slice(0, -1);
    const prev = prevWords.length ? prevWords[prevWords.length - 1] : null;
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const push = (s: Suggestion) => {
      const k = s.text.toLowerCase();
      if (seen.has(k) || out.length >= max) return;
      seen.add(k);
      out.push(s);
    };

    // 1) atalho pessoal
    if (partial && shortcuts[partial]) push({ text: shortcuts[partial], kind: 'shortcut' });

    if (!partial) {
      // 2) próxima palavra
      const cands = new Set<string>();
      if (prev) {
        this.baseBigrams.get(prev)?.forEach((w) => cands.add(w));
        for (const k of Object.keys(this.user.bigrams)) {
          const [a, b] = k.split(' ');
          if (a === prev) cands.add(b);
        }
      } else {
        STARTERS_PTBR.forEach((w) => cands.add(w));
        for (const [w, c] of Object.entries(this.user.unigrams)) if (c >= 3) cands.add(w);
      }
      [...cands]
        .sort((a, b) => this.score(b, prev) - this.score(a, prev))
        .forEach((w) => push({ text: w, kind: 'next' }));
      // completa com palavras frequentes (as que a pessoa mais usa vêm primeiro)
      if (out.length < max) {
        const fillers = [
          ...Object.entries(this.user.unigrams)
            .sort((a, b) => b[1] - a[1])
            .map(([w]) => w),
          ...LEXICON_PTBR.slice(0, 40),
        ];
        for (const w of fillers) if (w !== prev && w.length > 1) push({ text: w, kind: 'next' });
      }
      return out;
    }

    // 3) completar a palavra (comparação sem acento: "nao" acha "não")
    const p = normalize(partial);
    const matches: string[] = [];
    for (const w of this.allWords()) {
      const n = normalize(w);
      if (n.startsWith(p) && (n !== p || w !== partial)) matches.push(w);
    }
    matches
      .sort((a, b) => this.score(b, prev) - this.score(a, prev) || a.length - b.length)
      .forEach((w) => push({ text: w, kind: 'completion' }));

    // 4) autocorreção: erro de mira de 1 letra no começo da palavra
    if (out.length < max && p.length >= 3) {
      const fixes: string[] = [];
      for (const w of this.allWords()) {
        const n = normalize(w);
        if (n.length < p.length || n.startsWith(p)) continue;
        if (editDistance(p, n.slice(0, p.length)) <= 1) fixes.push(w);
      }
      fixes
        .sort((a, b) => this.score(b, prev) - this.score(a, prev))
        .forEach((w) => push({ text: w, kind: 'correction' }));
    }
    return out;
  }
}

/**
 * Aplica uma sugestão ao texto: troca a palavra em andamento pela sugestão e acrescenta espaço.
 */
export function applySuggestion(text: string, suggestion: Suggestion): string {
  const endsWithSpace = text.length === 0 || /\s$/.test(text);
  const base = endsWithSpace ? text : text.replace(/\p{L}+$/u, '');
  let word = suggestion.text;
  // maiúscula se for começo de frase
  if (/(^|[.!?]\s*)$/.test(base.trimEnd()) || base.trim() === '') word = word[0].toUpperCase() + word.slice(1);
  return `${base}${word} `;
}
