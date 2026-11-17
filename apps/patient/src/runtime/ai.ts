/**
 * Chamadas à IA pelo servidor do próprio app (/api/ai/...). A chave NUNCA está aqui.
 */

export type AiErrorCode =
  | 'sem-servidor'
  | 'sem-chave'
  | 'chave-invalida'
  | 'sem-permissao'
  | 'limite'
  | 'sem-conexao'
  | 'offline'
  | 'grande-demais'
  | 'pedido-invalido'
  | 'outro';

export const AI_ERROR_TEXT: Record<AiErrorCode, string> = {
  'sem-servidor':
    'Nesta versão on-line a IA ainda não está ligada. O Chat e a Câmera com IA funcionam quando o app roda no computador (INICIAR-LINDAURIA.bat) com a chave configurada.',
  'sem-chave':
    'A IA ainda não foi configurada neste computador. O responsável precisa colocar a chave da API do Claude no arquivo .env (veja o README).',
  'chave-invalida': 'A chave da API do Claude não foi aceita. Confira a chave no arquivo .env.',
  'sem-permissao': 'A chave da API não tem permissão para este modelo.',
  limite: 'Muitas perguntas seguidas. Espere um pouquinho e tente de novo.',
  'sem-conexao': 'O servidor não conseguiu falar com a IA. Verifique a internet do computador.',
  offline: 'Sem internet. O Chat e a Câmera com IA precisam de internet; o resto do app funciona normalmente.',
  'grande-demais': 'A foto ficou grande demais. Tente de novo.',
  'pedido-invalido': 'A IA não entendeu o pedido. Tente reformular.',
  outro: 'Não consegui falar com a IA agora. Tente de novo.',
};

export class AiFailure extends Error {
  constructor(public code: AiErrorCode) {
    super(AI_ERROR_TEXT[code]);
  }
}

async function post(path: string, body: unknown, timeoutMs = 45_000): Promise<string> {
  if (!navigator.onLine) throw new AiFailure('offline');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (res.status === 404 || res.status === 405) throw new AiFailure('sem-servidor');
    if (!res.ok) {
      const code = (data.error ?? 'outro') as AiErrorCode;
      throw new AiFailure(code in AI_ERROR_TEXT ? code : 'outro');
    }
    return data.text ?? '';
  } catch (e) {
    if (e instanceof AiFailure) throw e;
    throw new AiFailure(navigator.onLine ? 'sem-conexao' : 'offline');
  } finally {
    clearTimeout(timer);
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const askChat = (messages: ChatTurn[]) => post('/api/ai/chat', { messages });

/** foto (Blob) → base64 sem o prefixo "data:" */
async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function askVision(photo: Blob, question: string) {
  const mediaType = /^image\/(jpeg|png|webp|gif)$/.test(photo.type) ? photo.type : 'image/jpeg';
  return post('/api/ai/vision', { image: await toBase64(photo), mediaType, question }, 60_000);
}

/** reduz a foto para no máximo 1280 px (mais rápido e barato para a IA) */
export async function shrinkPhoto(source: Blob | HTMLVideoElement, mirror = false): Promise<Blob> {
  let w: number;
  let h: number;
  let draw: (ctx: CanvasRenderingContext2D, cw: number, ch: number) => void;
  if (source instanceof Blob) {
    const bmp = await createImageBitmap(source);
    w = bmp.width;
    h = bmp.height;
    draw = (ctx, cw, ch) => ctx.drawImage(bmp, 0, 0, cw, ch);
  } else {
    w = source.videoWidth;
    h = source.videoHeight;
    draw = (ctx, cw, ch) => ctx.drawImage(source, 0, 0, cw, ch);
  }
  const scale = Math.min(1, 1280 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d')!;
  if (mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  draw(ctx, c.width, c.height);
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('foto'))), 'image/jpeg', 0.85));
}
