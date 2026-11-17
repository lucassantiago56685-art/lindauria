import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton, LogoMark, Wordmark } from '@lindauria/design-system';
import { AuthFailure, type Account, type Role } from '@lindauria/shared';
import { useApp } from '../store/app';
import { auth, sounds } from '../runtime/engine';
import { TextField } from '../components/ScrollArea';

/* =============================================================================================
   Entrar / Criar conta — UMA tela, DUAS abas, formulário curto.
   - <form> de verdade: o navegador oferece "Salvar senha" e preenche sozinho da próxima vez.
   - A sessão fica salva ("Manter conectado"): a pessoa não precisa entrar de novo.
   ============================================================================================= */

const ROLES: Array<{ value: Role; icon: string; label: string }> = [
  { value: 'paciente', icon: '🙂', label: 'Paciente' },
  { value: 'cuidador', icon: '🤝', label: 'Família / cuidador' },
  { value: 'profissional', icon: '🩺', label: 'Profissional' },
];

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl px-3 py-2 text-[0.9em] font-semibold" style={{ color: 'var(--danger-text)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}>
      {children}
    </p>
  );
}

function PasswordField(props: { value: string; onChange: (v: string) => void; isNew: boolean; inputRef?: React.Ref<HTMLInputElement> }) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      label="Senha"
      icon="🔑"
      ref={props.inputRef}
      type={show ? 'text' : 'password'}
      name="password"
      autoComplete={props.isNew ? 'new-password' : 'current-password'}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.isNew ? 'Mínimo 6 caracteres' : 'Sua senha'}
      trailing={
        <button type="button" className="la-field__action" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow((v) => !v)}>
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      }
    />
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} data-dwell="" onClick={() => onChange(!checked)} className="flex items-center gap-3 rounded-xl py-1 text-left text-[0.88em] font-semibold">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
        style={{ border: '2px solid var(--primary)', background: checked ? 'var(--primary)' : 'transparent', color: '#060A17' }}
        aria-hidden="true"
      >
        {checked ? '✓' : ''}
      </span>
      <span>{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
function LoginForm({ onDone }: { onDone: (a: Account) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void auth.listAccounts().then((list) => {
      setAccounts(list);
      if (list.length === 1) setEmail(list[0].email);
    });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await auth.signIn(email, password, remember));
    } catch (err) {
      sounds.error();
      setError(
        err instanceof AuthFailure
          ? `${err.message} Se a conta foi criada em outro aparelho, crie uma aqui ou use sem conta.`
          : 'Algo deu errado. Tente de novo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Contas neste aparelho">
          {accounts.map((a) => {
            const sel = email.trim().toLowerCase() === a.email;
            return (
              <button
                key={a.id}
                type="button"
                data-dwell=""
                aria-pressed={sel}
                onClick={() => {
                  setEmail(a.email);
                  setTimeout(() => passRef.current?.focus(), 30);
                }}
                className="la-glass flex items-center gap-2 py-1.5 pl-1.5 pr-4 text-[0.88em] font-bold"
                style={{ borderColor: sel ? 'var(--primary)' : undefined, borderRadius: 999 }}
              >
                <span className="grid h-8 w-8 place-items-center rounded-full text-[0.8em]" style={{ background: 'var(--brand-gradient)', color: '#060A17' }}>
                  {initials(a.name)}
                </span>
                {a.name.split(' ')[0]}
              </button>
            );
          })}
        </div>
      )}
      <TextField label="E-mail" icon="✉️" type="email" name="email" inputMode="email" autoComplete="username email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
      <PasswordField value={password} onChange={setPassword} isNew={false} inputRef={passRef} />
      <Check checked={remember} onChange={setRemember}>
        Manter conectado neste aparelho
      </Check>
      {error && <ErrorText>{error}</ErrorText>}
      <GlowButton type="submit" tone="primary" icon="🔑" label={busy ? 'Entrando…' : 'Entrar'} disabled={busy} className="min-h-[3.2em] flex-row text-[1.1em]" />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
function SignupForm({ onDone }: { onDone: (a: Account) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('cuidador');
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await auth.signUp({ name, email, password, role, consent }));
    } catch (err) {
      sounds.error();
      setError(err instanceof AuthFailure ? err.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <TextField label="Nome" icon="👤" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana Souza" />
      <TextField label="E-mail" icon="✉️" type="email" name="email" inputMode="email" autoComplete="username email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
      <PasswordField value={password} onChange={setPassword} isNew />
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.9em] font-bold">Quem vai usar?</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Quem vai usar">
          {ROLES.map((r) => (
            <GlowButton key={r.value} role="radio" aria-checked={role === r.value} aria-pressed={role === r.value} tone="secondary" icon={r.icon} label={r.label} className="min-h-[3.4em] px-1 text-[0.78em]" onClick={() => setRole(r.value)} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Check checked={consent} onChange={setConsent}>
          Aceito os termos e a política de privacidade (LGPD)
        </Check>
        <button type="button" className="self-start pl-10 text-[0.78em] underline" style={{ color: 'var(--primary-text)' }} onClick={() => setTerms((v) => !v)}>
          {terms ? 'Fechar' : 'Ler em palavras simples'}
        </button>
        {terms && (
          <ul className="la-glass ml-10 flex flex-col gap-1 p-3 text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
            <li>💚 Grátis para pacientes e famílias.</li>
            <li>🔒 O vídeo da câmera fica só no aparelho.</li>
            <li>🗄️ Seus dados ficam criptografados neste aparelho.</li>
            <li>📲 A família só recebe o que o paciente autorizar.</li>
            <li>🗑️ Dá para apagar tudo quando quiser.</li>
            <li>🩺 Não substitui médico nem monitores de sinais vitais.</li>
          </ul>
        )}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <GlowButton type="submit" tone="primary" icon="✨" label={busy ? 'Criando…' : 'Criar conta'} disabled={busy} className="min-h-[3.2em] flex-row text-[1.1em]" />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const go = useApp((s) => s.go);
  const [tab, setTab] = useState(mode);
  useEffect(() => setTab(mode), [mode]);

  const done = (account: Account) => {
    sounds.sent();
    useApp.setState({ account, session: { kind: 'account', accountId: account.id } });
    go('splash');
  };

  async function guest() {
    await auth.continueAsGuest();
    useApp.setState({ session: { kind: 'guest' }, account: null });
    go('splash');
  }

  return (
    <div className="relative z-10 flex h-full w-full flex-col items-center overflow-y-auto overscroll-contain p-3 sm:p-6" style={{ touchAction: 'pan-y' }}>
      <div className="my-auto flex w-full max-w-md flex-col gap-4 py-2">
        {/* topo */}
        <div className="flex items-center justify-between">
          <GlowButton tone="neutral" icon="←" label="Voltar" className="la-btn--bar" onClick={() => go('landing')} />
          <span className="flex items-center gap-2">
            <LogoMark size={30} />
            <Wordmark className="text-[1.15em]" />
          </span>
        </div>

        <GlassCard className="flex flex-col gap-5 p-5 sm:p-7">
          {/* abas */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl p-1" role="tablist" aria-label="Entrar ou criar conta" style={{ background: 'color-mix(in srgb, var(--bg-deep) 60%, transparent)' }}>
            {(
              [
                ['login', 'Entrar'],
                ['signup', 'Criar conta'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-dwell=""
                onClick={() => setTab(id)}
                className="rounded-xl py-2.5 text-[0.95em] font-bold transition-colors"
                style={tab === id ? { background: 'var(--brand-gradient)', color: '#060A17' } : { color: 'var(--text-secondary)' }}
              >
                {label}
              </button>
            ))}
          </div>

          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} role="tabpanel">
            {tab === 'login' ? <LoginForm onDone={done} /> : <SignupForm onDone={done} />}
          </motion.div>
        </GlassCard>

        {/* outras opções */}
        <div className="flex flex-col items-center gap-2 text-[0.85em]">
          <button type="button" className="font-semibold underline" style={{ color: 'var(--primary-text)' }} onClick={() => void guest()}>
            Usar sem conta, só neste aparelho
          </button>
          <button type="button" className="font-semibold underline" style={{ color: 'var(--accent-text)' }} onClick={() => go('familyView')}>
            Sou familiar: acompanhar com código
          </button>
          <p className="text-center text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
            🔒 A conta fica salva neste aparelho, com os dados criptografados.
          </p>
        </div>
      </div>
    </div>
  );
}
