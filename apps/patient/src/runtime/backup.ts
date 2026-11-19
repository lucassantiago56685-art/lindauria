import { secureExportAll, secureImportAll } from '@lindauria/shared';

/**
 * Cópia de segurança e exportação de dados (LGPD: portabilidade).
 *
 * - Cópia PROTEGIDA: arquivo cifrado com uma senha escolhida pela pessoa (PBKDF2 + AES-GCM 256).
 *   Serve para quem usa "sem conta": se o aparelho quebrar, restaura vocabulário, frases,
 *   registros, lembretes, família e ajustes num aparelho novo.
 * - Exportação LEGÍVEL: um arquivo JSON aberto, para a pessoa ver/levar os próprios dados.
 */

const FORMAT = 'lindauria-backup';
const ITER = 250_000;

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** dados que não fazem sentido levar para outro aparelho */
const SKIP = new Set(['outbox']);

async function collect() {
  const all = await secureExportAll();
  for (const k of SKIP) delete all[k];
  return all;
}

export async function exportProtectedBackup(password: string): Promise<number> {
  if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const data = await collect();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  download(
    `lindauria-copia-${stamp()}.lindauria`,
    JSON.stringify({ format: FORMAT, version: 1, createdAt: new Date().toISOString(), salt: b64(salt), iv: b64(iv), data: b64(cipher) }),
  );
  return Object.keys(data).length;
}

export async function exportReadable(): Promise<void> {
  const data = await collect();
  download(
    `lindauria-meus-dados-${stamp()}.json`,
    JSON.stringify({ aviso: 'Seus dados do LindaurIA (LGPD, art. 18). Contém dados de saúde: guarde com cuidado.', exportadoEm: new Date().toISOString(), dados: data }, null, 2),
  );
}

export async function restoreProtectedBackup(file: File, password: string): Promise<number> {
  let parsed: { format?: string; salt?: string; iv?: string; data?: string };
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Este arquivo não é uma cópia do LindaurIA.');
  }
  if (parsed.format !== FORMAT || !parsed.salt || !parsed.iv || !parsed.data) throw new Error('Este arquivo não é uma cópia do LindaurIA.');
  const key = await deriveKey(password, unb64(parsed.salt));
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parsed.iv) }, key, unb64(parsed.data));
  } catch {
    throw new Error('Senha errada (ou arquivo danificado).');
  }
  const data = JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
  return secureImportAll(data);
}
