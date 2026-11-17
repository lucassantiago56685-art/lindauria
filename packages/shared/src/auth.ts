import { createPin, verifyPin, type PinRecord } from './pin';
import { secureDelete, secureGet, secureSet } from './secure-store';

/**
 * Contas do LindaurIA.
 *
 * Nesta fase a conta é LOCAL: fica salva (criptografada) neste aparelho, e a senha é guardada
 * só como hash PBKDF2. Na Fase 3, a mesma interface `AuthProvider` ganha uma implementação com
 * Supabase (login na nuvem, vários cuidadores, sincronização). As telas não precisam mudar.
 */

export type Role = 'paciente' | 'cuidador' | 'profissional';

export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: number;
  /** momento do aceite dos termos e da política de privacidade (LGPD) */
  consentAt: number;
}

interface StoredAccount extends Account {
  password: PinRecord;
}

export type Session = { kind: 'account'; accountId: string } | { kind: 'guest' };

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  consent: boolean;
}

export type AuthError =
  | 'nome-curto'
  | 'email-invalido'
  | 'senha-curta'
  | 'sem-consentimento'
  | 'email-em-uso'
  | 'credenciais-invalidas';

export const AUTH_ERROR_TEXT: Record<AuthError, string> = {
  'nome-curto': 'Escreva o nome (pelo menos 2 letras).',
  'email-invalido': 'Esse e-mail não parece certo. Confira, por favor.',
  'senha-curta': 'A senha precisa ter pelo menos 6 caracteres.',
  'sem-consentimento': 'Para criar a conta, é preciso aceitar os termos e a política de privacidade.',
  'email-em-uso': 'Já existe uma conta com esse e-mail neste aparelho. Tente entrar.',
  'credenciais-invalidas': 'E-mail ou senha não conferem.',
};

export interface AuthProvider {
  readonly kind: 'local' | 'cloud';
  signUp(input: SignUpInput): Promise<Account>;
  /** @param remember false = não fica conectado ao fechar o app */
  signIn(email: string, password: string, remember?: boolean): Promise<Account>;
  /** contas já cadastradas neste aparelho (só nome, e-mail e papel; nunca a senha) */
  listAccounts(): Promise<Account[]>;
  signOut(): Promise<void>;
  continueAsGuest(): Promise<void>;
  /** sessão salva (para não pedir login toda vez — a pessoa não deve ficar presa fora do app) */
  restore(): Promise<{ session: Session | null; account: Account | null }>;
}

export class AuthFailure extends Error {
  constructor(public code: AuthError) {
    super(AUTH_ERROR_TEXT[code]);
  }
}

const normEmail = (e: string) => e.trim().toLowerCase();
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

const strip = ({ password: _p, ...a }: StoredAccount): Account => a;

export function validateSignUp(i: SignUpInput): AuthError | null {
  if (i.name.trim().length < 2) return 'nome-curto';
  if (!isValidEmail(i.email)) return 'email-invalido';
  if (i.password.length < 6) return 'senha-curta';
  if (!i.consent) return 'sem-consentimento';
  return null;
}

export class LocalAuthProvider implements AuthProvider {
  readonly kind = 'local' as const;

  private async accounts() {
    return (await secureGet<StoredAccount[]>('accounts')) ?? [];
  }

  async signUp(input: SignUpInput): Promise<Account> {
    const err = validateSignUp(input);
    if (err) throw new AuthFailure(err);
    const list = await this.accounts();
    const email = normEmail(input.email);
    if (list.some((a) => a.email === email)) throw new AuthFailure('email-em-uso');
    const now = Date.now();
    const acc: StoredAccount = {
      id: crypto.randomUUID?.() ?? `${now.toString(36)}-${Math.random().toString(36).slice(2)}`,
      name: input.name.trim(),
      email,
      role: input.role,
      createdAt: now,
      consentAt: now,
      password: await createPin(input.password),
    };
    await secureSet('accounts', [...list, acc]);
    await secureSet<Session>('session', { kind: 'account', accountId: acc.id });
    return strip(acc);
  }

  async listAccounts(): Promise<Account[]> {
    return (await this.accounts()).map(strip);
  }

  async signIn(email: string, password: string, remember = true): Promise<Account> {
    const acc = (await this.accounts()).find((a) => a.email === normEmail(email));
    // verifica a senha mesmo sem conta, para não revelar quais e-mails existem
    const ok = await verifyPin(password, acc?.password ?? (await createPin('x')));
    if (!acc || !ok) throw new AuthFailure('credenciais-invalidas');
    if (remember) await secureSet<Session>('session', { kind: 'account', accountId: acc.id });
    else await secureDelete('session');
    return strip(acc);
  }

  async signOut() {
    await secureDelete('session');
  }

  async continueAsGuest() {
    await secureSet<Session>('session', { kind: 'guest' });
  }

  async restore() {
    const session = await secureGet<Session>('session');
    if (!session) return { session: null, account: null };
    if (session.kind === 'guest') return { session, account: null };
    const acc = (await this.accounts()).find((a) => a.id === session.accountId);
    return acc ? { session, account: strip(acc) } : { session: null, account: null };
  }
}
