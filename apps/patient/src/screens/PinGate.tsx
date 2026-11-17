import { useEffect, useState, type ReactNode } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { createPin, secureGet, secureSet, verifyPin, type PinRecord } from '@lindauria/shared';
import { useApp } from '../store/app';
import { sounds } from '../runtime/engine';

const PIN_LEN = 4;
const MAX_TRIES = 5;
const LOCK_MS = 30_000;

/**
 * "Modo cuidador": as configurações ficam atrás de um PIN de 4 dígitos.
 * Na primeira vez, o cuidador cria o PIN. Guardamos só o hash (PBKDF2).
 */
export function PinGate({ children }: { children: ReactNode }) {
  const go = useApp((s) => s.go);
  const [record, setRecord] = useState<PinRecord | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(false);
  const [digits, setDigits] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    void secureGet<PinRecord>('caregiver-pin').then((r) => setRecord(r ?? null));
  }, []);

  useEffect(() => {
    if (digits.length < PIN_LEN) return;
    const pin = digits;
    setDigits('');
    void (async () => {
      if (record === null) {
        // criação
        if (first === null) {
          setFirst(pin);
          setMsg('Digite o mesmo PIN de novo para confirmar.');
        } else if (first === pin) {
          const rec = await createPin(pin);
          await secureSet('caregiver-pin', rec);
          setRecord(rec);
          sounds.sent();
          setUnlocked(true);
        } else {
          sounds.error();
          setFirst(null);
          setMsg('Os PINs não são iguais. Vamos começar de novo.');
        }
        return;
      }
      if (record && (await verifyPin(pin, record))) {
        setUnlocked(true);
        setTries(0);
        return;
      }
      sounds.error();
      const n = tries + 1;
      setTries(n);
      if (n >= MAX_TRIES) {
        setLockedUntil(Date.now() + LOCK_MS);
        setTries(0);
        setMsg('Muitas tentativas. Aguarde 30 segundos.');
      } else setMsg(`PIN errado. Tentativa ${n} de ${MAX_TRIES}.`);
    })();
  }, [digits, record, first, tries]);

  if (unlocked) return <>{children}</>;
  if (record === undefined) return null;

  const locked = Date.now() < lockedUntil;
  const press = (d: string) => {
    if (locked) return;
    setMsg(null);
    setDigits((x) => (x.length < PIN_LEN ? x + d : x));
  };

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-4">
      <GlassCard className="flex w-full max-w-xl flex-col gap-4 p-6 text-center">
        <h1 className="text-[1.6em] font-bold">🔐 Modo cuidador</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {record === null
            ? first === null
              ? 'Crie um PIN de 4 números para proteger os ajustes.'
              : 'Confirme o PIN.'
            : 'Digite o PIN do cuidador.'}
        </p>
        <div className="flex justify-center gap-3" aria-label={`${digits.length} de ${PIN_LEN} números digitados`}>
          {Array.from({ length: PIN_LEN }, (_, i) => (
            <span
              key={i}
              className="h-5 w-5 rounded-full"
              style={{ background: i < digits.length ? 'var(--primary)' : 'var(--bg-surface)', border: '2px solid var(--border-glow)' }}
            />
          ))}
        </div>
        {msg && (
          <p role="alert" className="font-semibold" style={{ color: 'var(--warning-text)' }}>
            {msg}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <GlowButton key={d} tone="primary" label={d} className="min-h-[2.8em] text-[1.4em]" onClick={() => press(d)} />
          ))}
          <GlowButton tone="neutral" label="⌫" aria-label="Apagar" className="min-h-[2.8em] text-[1.2em]" onClick={() => setDigits((x) => x.slice(0, -1))} />
          <GlowButton tone="primary" label="0" className="min-h-[2.8em] text-[1.4em]" onClick={() => press('0')} />
          <GlowButton tone="neutral" icon="🏠" label="Sair" className="min-h-[2.8em] text-[0.8em]" onClick={() => go('hub')} />
        </div>
        {record && (
          <button type="button" className="text-[0.8em] underline" style={{ color: 'var(--text-secondary)' }} onClick={() => setShowForgot((v) => !v)}>
            Esqueci o PIN
          </button>
        )}
        {showForgot && (
          <p className="text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
            Por segurança, não há como recuperar o PIN. Para recomeçar, apague os dados do site nas configurações do
            navegador (isso apaga também ajustes, vocabulário e calibração deste aparelho).
          </p>
        )}
      </GlassCard>
    </div>
  );
}
