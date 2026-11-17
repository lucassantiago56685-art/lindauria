/**
 * Filtro de segurança LOCAL (roda no aparelho, antes e independente da IA).
 * Se a pergunta indicar urgência, a tela mostra NA HORA o botão de emergência e o SAMU 192;
 * se indicar sofrimento emocional, mostra também o CVV 188.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const URGENT = [
  'falta de ar',
  'sem ar',
  'nao consigo respirar',
  'dificuldade para respirar',
  'sufocando',
  'engasg',
  'dor no peito',
  'dor forte',
  'muita dor',
  'caiu',
  'cai ',
  'queda',
  'febre alta',
  'desmai',
  'convuls',
  'sangrando',
  'sangramento',
  'roxo',
  'arroxead',
];

const EMOTIONAL = [
  'quero morrer',
  'desejo de morrer',
  'nao quero mais viver',
  'tirar minha vida',
  'me matar',
  'suicid',
  'desistir da vida',
  'nao aguento mais',
  'sem esperanca',
];

export interface UrgencyCheck {
  /** mostrar emergência + SAMU 192 */
  urgent: boolean;
  /** mostrar também CVV 188 */
  emotional: boolean;
}

export function detectUrgency(text: string): UrgencyCheck {
  const t = ` ${norm(text)} `;
  const emotional = EMOTIONAL.some((k) => t.includes(k));
  const urgent = emotional || URGENT.some((k) => t.includes(k));
  return { urgent, emotional };
}
