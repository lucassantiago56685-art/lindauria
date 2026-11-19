import { create } from 'zustand';
import { secureGet, secureSet } from '@lindauria/shared';
import { NtfyNotifier, type AlertMessage } from '@lindauria/safety';
import { getSettings } from '../store/settings';

/**
 * FILA DE ENVIO ("caixa de saída").
 * Sem internet, o aviso para a família NÃO se perde: fica guardado (criptografado) neste aparelho
 * e sai sozinho assim que a conexão voltar — mesmo que o app seja fechado e aberto de novo.
 * O alarme LOCAL toca sempre, com ou sem internet (isso é feito pelo controlador de emergência).
 */

export interface OutboxItem {
  id: string;
  topic: string;
  msg: AlertMessage;
  createdAt: number;
  /** para a tela de emergência mostrar quem está esperando */
  memberId?: string;
  kind: 'emergency' | 'reminder' | 'other';
}

interface OutboxState {
  items: OutboxItem[];
  online: boolean;
}

export const useOutbox = create<OutboxState>(() => ({
  items: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
}));

const KEY = 'outbox';
/** avisos muito antigos não fazem mais sentido (ex.: lembrete de ontem) */
const MAX_AGE_MS = 12 * 3600_000;
let onDelivered: (item: OutboxItem) => void = () => undefined;
export function setOutboxDeliveredHandler(fn: (item: OutboxItem) => void) {
  onDelivered = fn;
}

const persist = () => void secureSet(KEY, useOutbox.getState().items);
const hhmm = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function enqueue(item: Omit<OutboxItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  const full: OutboxItem = { ...item, id: item.id ?? crypto.randomUUID(), createdAt: item.createdAt ?? Date.now() };
  useOutbox.setState((st) => ({ items: [...st.items.filter((x) => x.id !== full.id), full] }));
  persist();
  scheduleFlush(5000);
}

let flushing = false;
export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    const n = new NtfyNotifier(getSettings().alertServer);
    for (const item of [...useOutbox.getState().items]) {
      if (Date.now() - item.createdAt > MAX_AGE_MS) {
        drop(item.id);
        continue;
      }
      const late = Date.now() - item.createdAt > 60_000;
      const msg: AlertMessage = late
        ? { ...item.msg, message: `${item.msg.message}\n⚠ Enviado com atraso: o aparelho estava sem internet desde ${hhmm(item.createdAt)}.` }
        : item.msg;
      try {
        await n.sendText(item.topic, msg);
        drop(item.id);
        onDelivered(item);
      } catch {
        break; // ainda sem conexão: tenta depois
      }
    }
  } finally {
    flushing = false;
    if (useOutbox.getState().items.length) scheduleFlush(10_000);
  }
}

function drop(id: string) {
  useOutbox.setState((st) => ({ items: st.items.filter((x) => x.id !== id) }));
  persist();
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleFlush(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void flushOutbox(), ms);
}

/** carrega a fila salva e passa a vigiar a conexão */
export async function startOutbox() {
  const saved = (await secureGet<OutboxItem[]>(KEY)) ?? [];
  useOutbox.setState({ items: saved });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      useOutbox.setState({ online: true });
      void flushOutbox();
    });
    window.addEventListener('offline', () => useOutbox.setState({ online: false }));
  }
  if (saved.length) void flushOutbox();
}
