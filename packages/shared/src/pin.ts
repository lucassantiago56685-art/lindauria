/**
 * PIN do "modo cuidador" (protege as Configurações).
 * Guardamos apenas o hash PBKDF2-SHA256 com sal aleatório, nunca o PIN.
 */
export interface PinRecord {
  salt: string;
  hash: string;
  iterations: number;
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
}

export async function createPin(pin: string): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 150_000;
  return { salt: toB64(salt), hash: toB64(await derive(pin, salt, iterations)), iterations };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const hash = toB64(await derive(pin, fromB64(record.salt), record.iterations));
  // comparação em tempo constante
  if (hash.length !== record.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ record.hash.charCodeAt(i);
  return diff === 0;
}
