import { create } from 'zustand';
import { secureGet, secureSet } from '@lindauria/shared';
import { say, sounds } from './engine';

/**
 * "Minhas frases": frases prontas criadas pela pessoa ou pelo cuidador.
 * Cada uma pode tocar com a VOZ DO APP (texto falado) ou com um SOM GRAVADO
 * (a voz da própria pessoa, de um neto, uma risada...). Tudo fica criptografado no aparelho.
 */

export interface CustomPhrase {
  id: string;
  text: string;
  icon: string;
  /** áudio gravado (data URL). Sem áudio = fala com a voz do app. */
  audio: string | null;
  createdAt: number;
}

interface PhrasesState {
  list: CustomPhrase[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (p: Omit<CustomPhrase, 'id' | 'createdAt'>) => CustomPhrase;
  update: (id: string, p: Partial<Omit<CustomPhrase, 'id'>>) => void;
  remove: (id: string) => void;
}

const KEY = 'custom-phrases';
let loading: Promise<void> | null = null;
const persist = (list: CustomPhrase[]) => void secureSet(KEY, list);
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const useMyPhrases = create<PhrasesState>((set, get) => ({
  list: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    loading ??= secureGet<CustomPhrase[]>(KEY).then((saved) => {
      // junta o que foi salvo com o que porventura foi criado enquanto carregava
      const pending = get().list;
      set({ list: [...pending, ...(saved ?? [])], loaded: true });
      if (pending.length) persist(get().list);
    });
    await loading;
  },
  add: (p) => {
    const item: CustomPhrase = { ...p, id: newId(), createdAt: Date.now() };
    const list = [item, ...get().list];
    set({ list });
    if (get().loaded) persist(list); // só grava depois de carregar (senão apagaria as salvas)
    return item;
  },
  update: (id, p) => {
    const list = get().list.map((x) => (x.id === id ? { ...x, ...p } : x));
    set({ list });
    persist(list);
  },
  remove: (id) => {
    const list = get().list.filter((x) => x.id !== id);
    set({ list });
    persist(list);
  },
}));

let playing: HTMLAudioElement | null = null;

/** Toca a frase: som gravado se houver, senão a voz do app. */
export async function playPhrase(p: Pick<CustomPhrase, 'text' | 'audio'>) {
  playing?.pause();
  if (p.audio) {
    sounds.sent();
    playing = new Audio(p.audio);
    try {
      await playing.play();
      return;
    } catch {
      /* se o áudio falhar, cai para a voz do app */
    }
  }
  await say(p.text);
}

/** Salva rapidinho o texto atual como frase pronta (usado pelo teclado e pelo "Montar frase"). */
export async function saveTextAsPhrase(text: string, icon = '⭐') {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // carrega antes de adicionar, para nunca sobrescrever a lista salva
  await useMyPhrases.getState().load();
  return useMyPhrases.getState().add({ text: t, icon, audio: null });
}
