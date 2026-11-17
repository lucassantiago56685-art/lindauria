/**
 * Avisos no celular da família via ntfy (https://ntfy.sh): serviço de notificações gratuito e de
 * código aberto. Não precisa de conta nem de chave. Cada familiar tem um "tópico" próprio, um
 * endereço secreto e impossível de adivinhar. Ele instala o app ntfy (Android/iPhone), assina o
 * tópico e recebe os alertas na hora, mesmo com a tela bloqueada.
 *
 * Um tópico por familiar → as permissões de cada um são respeitadas (quem só recebe alertas não
 * recebe fotos) e o acesso pode ser revogado na hora, parando de enviar para aquele tópico.
 *
 * O servidor é configurável: dá para trocar ntfy.sh por um servidor próprio (ntfy é self-hosted).
 * Fase 3: este mesmo contrato ganha um envio por Supabase/WhatsApp Business.
 */

export interface AlertMessage {
  title: string;
  message: string;
  /** 1 (mínima) a 5 (urgente: toca mesmo em "não perturbe", se o familiar permitir no app) */
  priority: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
}

export interface Notifier {
  sendText(topic: string, msg: AlertMessage): Promise<void>;
  sendPhoto(topic: string, photo: Blob, filename: string, msg: AlertMessage): Promise<void>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;

export class NtfyNotifier implements Notifier {
  constructor(
    public server = 'https://ntfy.sh',
    private fetcher: FetchLike = (u, i) => fetch(u, i),
    private timeoutMs = 10_000,
  ) {}

  private base() {
    return this.server.replace(/\/+$/, '');
  }

  private async call(url: string, init: RequestInit) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), this.timeoutMs);
    try {
      const res = await this.fetcher(url, { ...init, signal: ctrl?.signal });
      if (!res.ok) throw new Error(`ntfy respondeu ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Texto: publicação em JSON (aceita acentos e emojis sem problema). */
  sendText(topic: string, msg: AlertMessage) {
    return this.call(this.base(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title: msg.title, message: msg.message, priority: msg.priority, tags: msg.tags ?? [] }),
    });
  }

  /** Foto: enviada como anexo. Os textos vão na URL (codificados), não em cabeçalhos. */
  sendPhoto(topic: string, photo: Blob, filename: string, msg: AlertMessage) {
    const q = new URLSearchParams({
      filename,
      title: msg.title,
      message: msg.message,
      priority: String(msg.priority),
      tags: (msg.tags ?? []).join(','),
    });
    return this.call(`${this.base()}/${encodeURIComponent(topic)}?${q}`, { method: 'PUT', body: photo });
  }
}

/** Tópico secreto e aleatório (≈ 120 bits): funciona como uma senha do familiar. */
export function newAlertTopic(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let s = '';
  for (const b of bytes) s += alphabet[b % 32];
  return `lindauria-${s}`;
}
