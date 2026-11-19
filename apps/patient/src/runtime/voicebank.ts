import { create } from 'zustand';
import { secureGet, secureSet } from '@lindauria/shared';

/**
 * BANCO DE VOZ (message banking): enquanto ainda fala, a pessoa grava frases com a PRÓPRIA voz.
 * Quando ela pedir para o app falar uma dessas frases (teclado, Sim/Não, frases prontas…),
 * o app toca a gravação em vez da voz do computador. Fica só neste aparelho (e na cópia de segurança).
 */

export interface BankedPhrase {
  key: string;
  text: string;
  audio: string; // data URL
  at: number;
}

/** sugestões para gravar (as mais usadas no dia a dia de quem tem ELA) */
export const BANK_SUGGESTIONS: Array<{ group: string; items: string[] }> = [
  { group: 'Respostas', items: ['Sim', 'Não', 'Talvez', 'Não sei', 'Obrigado', 'Obrigada', 'Por favor', 'Espera um pouco'] },
  { group: 'Carinho', items: ['Eu te amo', 'Te amo muito', 'Bom dia', 'Boa noite', 'Que saudade', 'Que bom te ver', 'Me dá um beijo', 'Tchau'] },
  {
    group: 'Necessidades',
    items: ['Estou com dor', 'Preciso de ajuda', 'Estou com sede', 'Estou com fome', 'Quero ir ao banheiro', 'Mude minha posição', 'Pode me coçar?', 'Quero dormir', 'Estou com frio', 'Estou com calor'],
  },
  { group: 'Como estou', items: ['Estou bem', 'Estou cansado', 'Estou cansada', 'Estou com medo', 'Estou feliz'] },
  { group: 'Do meu jeito', items: ['Ha ha ha', 'Que coisa!', 'Nossa senhora!', 'Deus te abençoe', 'Vai com Deus'] },
];

/** "Estou com dor!" e "estou com dor" são a mesma frase */
export const bankKey = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const KEY = 'voice-bank';

interface BankState {
  loaded: boolean;
  items: Record<string, BankedPhrase>;
  load: () => Promise<void>;
  save: (text: string, audio: string) => void;
  remove: (key: string) => void;
}

export const useVoiceBank = create<BankState>((set, get) => ({
  loaded: false,
  items: {},
  load: async () => {
    if (get().loaded) return;
    set({ items: (await secureGet<Record<string, BankedPhrase>>(KEY)) ?? {}, loaded: true });
  },
  save: (text, audio) => {
    const key = bankKey(text);
    if (!key) return;
    const items = { ...get().items, [key]: { key, text: text.trim(), audio, at: Date.now() } };
    set({ items });
    void secureSet(KEY, items);
  },
  remove: (key) => {
    const items = { ...get().items };
    delete items[key];
    set({ items });
    void secureSet(KEY, items);
  },
}));

let current: HTMLAudioElement | null = null;

/**
 * Se a frase estiver no banco, toca a gravação e retorna true.
 * (O engine chama isto antes de usar a voz do computador.)
 */
export async function playFromBank(text: string): Promise<boolean> {
  const st = useVoiceBank.getState();
  if (!st.loaded) await st.load();
  const hit = useVoiceBank.getState().items[bankKey(text)];
  if (!hit) return false;
  current?.pause();
  current = new Audio(hit.audio);
  try {
    await current.play();
    await new Promise<void>((r) => {
      current!.onended = () => r();
      current!.onerror = () => r();
    });
    return true;
  } catch {
    return false;
  }
}
