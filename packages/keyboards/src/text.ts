import { LEXICON_PTBR } from './lexicon-ptbr';

/** "Você" → "voce" (sem acento, minúsculo) para comparar palavras. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export const tokenize = (s: string) => s.toLowerCase().match(/\p{L}+/gu) ?? [];

/**
 * Palavras que NUNCA recebem acento automático porque as duas formas existem e são comuns.
 * (e/é, a/à, avo = avô ou avó?, nos/nós, pais/país, sabia/sábia...)
 */
const NEVER_ACCENT = new Set(['e', 'a', 'as', 'o', 'os', 'nos', 'pais', 'sabia', 'avo', 'da', 'de', 'para', 'por', 'pode', 'esse', 'tem', 'secretaria', 'publico', 'pratica', 'medico']);
// "medico" fica de fora porque "medico" pode ser verbo; "médico" vem pela previsão.

/** Mapa "nao" → "não", montado do léxico (a forma mais frequente vence). */
function buildAccentMap(words: string[]) {
  const map = new Map<string, string>();
  for (const w of words) {
    const k = normalize(w);
    if (!map.has(k)) map.set(k, w);
  }
  for (const k of NEVER_ACCENT) map.delete(k);
  for (const [k, v] of map) if (k === v) map.delete(k);
  return map;
}

let accentMap = buildAccentMap(LEXICON_PTBR);

/** Palavras conhecidas (sem acento): léxico + o que a pessoa já usou. Base da correção automática. */
const EXTRA_KNOWN = ['ninguém', 'cadê', 'comigo', 'contigo', 'beleza', 'beijos', 'abraços', 'fim', 'mensagem', 'pra', 'pro', 'tava', 'né', 'lá', 'sei'];
let known = new Set<string>();
function resetKnown() {
  known = new Set([...LEXICON_PTBR, ...EXTRA_KNOWN].map(normalize));
  for (const w of EXTRA_KNOWN) if (normalize(w) !== w && !accentMap.has(normalize(w))) accentMap.set(normalize(w), w);
}
resetKnown();

/** Acrescenta palavras aprendidas (ex.: "Conceição") ao mapa de acentos. */
export function learnAccentForms(words: Iterable<string>) {
  for (const w of words) {
    const k = normalize(w);
    known.add(k);
    if (k !== w.toLowerCase() && !NEVER_ACCENT.has(k) && !accentMap.has(k)) accentMap.set(k, w.toLowerCase());
  }
}

export function resetAccentForms() {
  accentMap = buildAccentMap(LEXICON_PTBR);
  resetKnown();
}

function matchCase(original: string, fixed: string) {
  if (original === original.toUpperCase() && original.length > 1) return fixed.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return fixed[0].toUpperCase() + fixed.slice(1);
  return fixed;
}

/** "nao" → "não", "Voce" → "Você". Palavras já acentuadas ou desconhecidas ficam como estão. */
export function accentWord(word: string): string {
  const lower = word.toLowerCase();
  if (normalize(lower) !== lower) return word; // já tem acento: respeita a pessoa
  const fixed = accentMap.get(lower);
  return fixed ? matchCase(word, fixed) : word;
}

/** Aplica acentuação em todas as palavras de um texto. */
export function accentText(text: string): string {
  return text.replace(/\p{L}+/gu, (w) => accentWord(w));
}

/** Coloca maiúscula no início do texto e depois de . ! ? */
export function autoCapitalize(text: string): string {
  return text.replace(/(^\s*|[.!?]\s+)(\p{Ll})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase());
}

/** Distância de edição com transposição (Damerau-Levenshtein, versão OSA). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// ============================================================================================
// Correção automática: abreviações de mensagem e letra trocada, sobrando ou faltando.
// Conservadora de propósito: só troca quando há UMA palavra conhecida bem parecida.
// ============================================================================================

/** Abreviações comuns de WhatsApp → palavra por extenso (o texto fica claro e a voz lê certo). */
export const ABBREVIATIONS: Record<string, string> = {
  vc: 'você', vcs: 'vocês', q: 'que', oq: 'o que', pq: 'porque', tb: 'também', tbm: 'também', tmb: 'também',
  hj: 'hoje', td: 'tudo', tds: 'todos', mt: 'muito', mto: 'muito', mta: 'muita', mts: 'muitos', msm: 'mesmo',
  cmg: 'comigo', ctg: 'contigo', blz: 'beleza', pf: 'por favor', pfv: 'por favor', pfvr: 'por favor',
  qdo: 'quando', qnd: 'quando', dps: 'depois', agr: 'agora', vdd: 'verdade', msg: 'mensagem', n: 'não',
  naum: 'não', eh: 'é', kd: 'cadê', ngm: 'ninguém', aq: 'aqui', bj: 'beijo', bjs: 'beijos', abs: 'abraços',
  fds: 'fim de semana', obg: 'obrigado', obgd: 'obrigado', obgda: 'obrigada', sla: 'sei lá', dnv: 'de novo',
  qr: 'quer', qro: 'quero', fzr: 'fazer', tbem: 'também',
};

let autoCorrectOn = true;
/** Liga/desliga a correção de letras trocadas (acentos e abreviações continuam). */
export function setAutoCorrect(on: boolean) {
  autoCorrectOn = on;
}

/** Palavra conhecida mais parecida (1 letra de diferença, mesma 1ª letra) — só se for a ÚNICA. */
export function spellFix(word: string): string | null {
  const n = normalize(word);
  if (n.length < 4 || known.has(n) || /\d/.test(n)) return null;
  let found: string | null = null;
  for (const k of known) {
    if (k.length < 3 || k[0] !== n[0] || Math.abs(k.length - n.length) > 1) continue;
    if (editDistance(n, k) === 1) {
      if (found) return null; // ambíguo: a pessoa escolhe pelas sugestões
      found = k;
    }
  }
  return found ? (accentMap.get(found) ?? found) : null;
}

/** Corrige UMA palavra: abreviação → extenso; letra trocada → palavra certa; depois acento. */
export function correctWord(word: string): string {
  const abbr = ABBREVIATIONS[word.toLowerCase()];
  if (abbr) return matchCase(word, abbr);
  if (autoCorrectOn) {
    const fix = spellFix(word);
    if (fix) return matchCase(word, fix);
  }
  return accentWord(word);
}

/** Corrige todas as palavras do texto. */
export function correctText(text: string): string {
  return text.replace(/\p{L}+/gu, (w) => correctWord(w));
}
