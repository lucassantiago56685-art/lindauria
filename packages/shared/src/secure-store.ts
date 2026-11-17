import Dexie, { type Table } from 'dexie';

/**
 * Armazenamento local criptografado (IndexedDB + AES-GCM 256).
 *
 * A chave é gerada no aparelho como CryptoKey NÃO-EXTRAÍVEL e guardada no próprio IndexedDB:
 * o JavaScript consegue usá-la para cifrar/decifrar, mas não consegue ler os bytes da chave.
 * Isso protege contra leitura casual dos arquivos do navegador. Quando houver login (Fase 3),
 * a chave passará a ser derivada também de um segredo do usuário.
 */

interface KvRow {
  key: string;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}
interface KeyRow {
  id: string;
  key: CryptoKey;
}

class LindaurDB extends Dexie {
  kv!: Table<KvRow, string>;
  keys!: Table<KeyRow, string>;
  constructor() {
    super('lindauria');
    this.version(1).stores({ kv: 'key', keys: 'id' });
  }
}

let db: LindaurDB | null = null;
let keyPromise: Promise<CryptoKey> | null = null;
/** Fallback em memória (ex.: navegação privada sem IndexedDB). Avisamos na interface. */
const memory = new Map<string, unknown>();
let persistentAvailable = true;

function getDb(): LindaurDB | null {
  if (!persistentAvailable) return null;
  try {
    db ??= new LindaurDB();
    return db;
  } catch {
    persistentAvailable = false;
    return null;
  }
}

async function getKey(database: LindaurDB): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const existing = await database.keys.get('main');
    if (existing) return existing.key;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await database.keys.put({ id: 'main', key });
    return key;
  })();
  return keyPromise;
}

/**
 * Pede ao navegador para NÃO apagar os dados do app quando faltar espaço
 * (sem isso, o navegador pode limpar contas e ajustes sozinho).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** false = dados só em memória (somem ao fechar). A interface avisa o cuidador. */
export function isPersistentStorage() {
  return persistentAvailable;
}

export async function secureSet<T>(key: string, value: T): Promise<void> {
  memory.set(key, value);
  const database = getDb();
  if (!database) return;
  try {
    const cryptoKey = await getKey(database);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plain);
    await database.kv.put({ key, iv, data });
  } catch (err) {
    console.warn('[secure-store] sem IndexedDB, usando memória', err);
    persistentAvailable = false;
  }
}

export async function secureGet<T>(key: string): Promise<T | null> {
  const database = getDb();
  if (!database) return (memory.get(key) as T) ?? null;
  try {
    const row = await database.kv.get(key);
    if (!row) return null;
    const cryptoKey = await getKey(database);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv }, cryptoKey, row.data);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch (err) {
    console.warn('[secure-store] falha ao ler', key, err);
    return (memory.get(key) as T) ?? null;
  }
}

export async function secureDelete(key: string): Promise<void> {
  memory.delete(key);
  await getDb()?.kv.delete(key).catch(() => undefined);
}

/** LGPD: apaga absolutamente tudo que o app guardou neste aparelho. */
export async function secureWipeAll(): Promise<void> {
  memory.clear();
  keyPromise = null;
  await getDb()?.delete().catch(() => undefined);
  db = null;
}
