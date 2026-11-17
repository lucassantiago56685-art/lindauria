import { useEffect, useState, type MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { sounds } from '../runtime/engine';
import {
  accessCode,
  canReceiveAlerts,
  inviteLink,
  inviteText,
  patientDisplayName,
  sendTest,
  sendTestAlarm,
  useFamily,
  type FamilyMember,
} from '../runtime/family';
import { ScreenShell } from '../components/common';
import { QrCode } from '../components/QrCode';
import { ScrollArea, TextField } from '../components/ScrollArea';

const RELATIONS = ['Filho(a)', 'Neto(a)', 'Cônjuge', 'Irmão(ã)', 'Pai/Mãe', 'Cuidador(a)', 'Amigo(a)', 'Outro'];

function Dialog({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[1000] flex items-stretch justify-center p-3 sm:items-center sm:p-6"
      style={{ background: 'color-mix(in srgb, var(--bg-deep) 94%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <GlassCard className="flex max-h-full w-full max-w-2xl flex-col gap-3 p-4 sm:p-6">{children}</GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
/** Cadastro/edição de familiar (feito pelo cuidador, com toque). */
function MemberForm({ member, onClose }: { member?: FamilyMember; onClose: () => void }) {
  const { add, update } = useFamily();
  const [name, setName] = useState(member?.name ?? '');
  const [relation, setRelation] = useState(member?.relation ?? 'Filho(a)');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [photos, setPhotos] = useState(member?.permissions.photos ?? true);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (name.trim().length < 2) return setError('Escreva o nome do familiar.');
    const data = { name: name.trim(), relation, phone: phone.trim(), permissions: { alerts: true, photos } };
    if (member) update(member.id, data);
    else add(data);
    sounds.sent();
    onClose();
  }

  return (
    <Dialog label={member ? 'Editar familiar' : 'Cadastrar familiar'}>
      <h2 className="shrink-0 text-center text-[1.4em] font-bold">{member ? '✏️ Editar familiar' : '➕ Cadastrar familiar'}</h2>
      <ScrollArea innerClassName="flex flex-col gap-4 pb-2">
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana" autoComplete="off" />
        <div className="flex flex-col gap-2">
          <span className="font-bold">Parentesco</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RELATIONS.map((r) => (
              <GlowButton key={r} tone="accent" aria-pressed={relation === r} label={r} className="text-[0.8em]" onClick={() => setRelation(r)} />
            ))}
          </div>
        </div>
        <TextField
          label="Telefone (opcional)"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(11) 99999-9999"
          hint="Fica guardado para contato. O alerta chega pelo app ntfy no celular do familiar."
        />
        <div className="flex flex-col gap-2">
          <span className="font-bold">O que essa pessoa pode receber</span>
          <GlowButton tone="success" aria-pressed icon="🔔" label="Alertas de emergência" hint="sempre incluído" className="la-btn--menu text-[0.9em]" disabled />
          <GlowButton
            tone={photos ? 'success' : 'neutral'}
            role="checkbox"
            aria-checked={photos}
            aria-pressed={photos}
            icon={photos ? '☑️' : '⬜'}
            label="Fotos durante a emergência"
            hint="para ver como a pessoa está"
            className="la-btn--menu text-[0.9em]"
            onClick={() => setPhotos((v) => !v)}
          />
        </div>
        <p className="text-[0.8em]" style={{ color: 'var(--warning-text)' }}>
          ✋ Depois de salvar, o próprio paciente precisa autorizar. Até lá, essa pessoa não recebe nada.
        </p>
        {error && (
          <p role="alert" className="font-semibold" style={{ color: 'var(--danger-text)' }}>
            {error}
          </p>
        )}
      </ScrollArea>
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <GlowButton tone="neutral" icon="↩️" label="Cancelar" onClick={onClose} />
        <GlowButton tone="primary" icon="💾" label="Salvar" onClick={save} />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
/**
 * Autorização pelo PACIENTE. No modo cabeça, o "Sim" só vale se for escolhido com a cabeça
 * (dwell ou gesto): um toque na tela não autoriza. Assim é a própria pessoa quem decide.
 */
function ConsentDialog({ member, onClose }: { member: FamilyMember; onClose: () => void }) {
  const authorize = useFamily((s) => s.authorize);
  const headMode = useApp((s) => s.tracking.mode === 'head' && s.tracking.status === 'on');
  const [hint, setHint] = useState<string | null>(null);
  const name = patientDisplayName();

  const yes = (e: MouseEvent) => {
    // cliques do dwell/gesto são sintéticos (isTrusted = false); toque/mouse são "confiáveis"
    if (headMode && e.isTrusted) {
      sounds.error();
      setHint('Para autorizar, a própria pessoa escolhe “Sim” com a cabeça: pare a seta em cima do botão.');
      return;
    }
    authorize(member.id);
    sounds.sent();
    onClose();
  };

  return (
    <Dialog label="Autorizar familiar">
      <h2 className="text-center text-[1.5em] font-bold">✋ Autorização</h2>
      <ScrollArea innerClassName="flex flex-col gap-3 pb-2 text-center">
        <p className="text-[1.15em]">
          Você{name !== 'o paciente' ? `, ${name},` : ''} autoriza <strong style={{ color: 'var(--accent-text)' }}>{member.name}</strong> ({member.relation})
          a receber no celular:
        </p>
        <div className="flex flex-col gap-1 text-[1.05em] font-semibold">
          <span>🔔 seus alertas de emergência</span>
          {member.permissions.photos && <span>📷 fotos suas durante uma emergência</span>}
        </div>
        <p className="text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
          {member.permissions.photos ? 'Ao autorizar, o app passa a tirar 3 fotos e enviar quando a emergência disparar. ' : ''}
          Você pode tirar essa autorização quando quiser.
        </p>
        {hint && (
          <p role="alert" className="font-semibold" style={{ color: 'var(--warning-text)' }}>
            {hint}
          </p>
        )}
      </ScrollArea>
      <div className="grid shrink-0 grid-cols-2 gap-3">
        <GlowButton tone="success" icon="👍" label="Sim, autorizo" className="min-h-[4em] text-[1.2em]" onClick={yes} />
        <GlowButton tone="danger" icon="✋" label="Não" className="min-h-[4em] text-[1.2em]" onClick={onClose} />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
function InviteDialog({ member, onClose }: { member: FamilyMember; onClose: () => void }) {
  const text = inviteText(member);
  const [copied, setCopied] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: 'Alertas do LindaurIA', text });
      else throw new Error('sem share');
    } catch {
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      setCopied(true);
    }
  }

  async function test() {
    setTestState('sending');
    try {
      await sendTest(member);
      setTestState('ok');
    } catch {
      setTestState('fail');
    }
  }

  return (
    <Dialog label="Convite do familiar">
      <h2 className="shrink-0 text-center text-[1.4em] font-bold">📲 Como {member.name} recebe os alertas</h2>
      <ScrollArea innerClassName="flex flex-col gap-3 pb-2">
        <span className="text-[0.8em] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Código de acesso de {member.name}
        </span>
        <code className="la-glass block select-all p-4 text-center text-[clamp(20px,5vw,1.6em)] font-bold tracking-wider" style={{ color: 'var(--primary-text)' }}>
          {accessCode(member)}
        </code>
        <div className="flex flex-wrap justify-center gap-6">
          <QrCode text={inviteLink(member)} label="Opção A: aponte a câmera do celular do familiar" />
          <QrCode text={`https://ntfy.sh/${member.topic}`} label="Opção B: assinar no app ntfy" />
        </div>
        <GlassCard className="flex flex-col gap-1 p-3 text-[0.88em]">
          <strong>Opção A — no LindaurIA (no celular do familiar)</strong>
          <span style={{ color: 'var(--text-secondary)' }}>
            Abrir o LindaurIA → <strong>“Sou familiar”</strong> → digitar o código. Alarme, notificação e fotos aparecem na hora,
            com o botão “Estou indo”.
          </span>
          <span className="break-all text-[0.85em]" style={{ color: 'var(--primary-text)' }}>
            Link direto: {inviteLink(member)}
          </span>
        </GlassCard>
        <strong className="text-[0.88em]">Opção B — app ntfy (avisa até com o celular bloqueado)</strong>
        <ol className="flex flex-col gap-2 text-[0.95em]">
          <li>
            <strong>1.</strong> Instalar o app <strong>ntfy</strong> (grátis):{' '}
            <a className="underline" style={{ color: 'var(--primary-text)' }} href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer">
              Android
            </a>{' '}
            ·{' '}
            <a className="underline" style={{ color: 'var(--primary-text)' }} href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer">
              iPhone
            </a>
          </li>
          <li>
            <strong>2.</strong> No ntfy, tocar em <strong>“+”</strong> e digitar este código:
          </li>
        </ol>
        <code className="la-glass block select-all break-all p-2 text-center text-[0.95em] font-bold" style={{ color: 'var(--primary-text)' }}>
          {member.topic}
        </code>
        <p className="text-[0.85em]">
          <strong>3.</strong> Ativar a prioridade máxima no tópico, para o alerta tocar mesmo no silencioso.
        </p>
        <p className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
          O código funciona como uma senha: só quem tem ele recebe os alertas. Se precisar, tire o acesso e cadastre de novo
          (um novo código é gerado).
        </p>
        {testState !== 'idle' && (
          <p role="status" className="font-semibold" style={{ color: testState === 'fail' ? 'var(--danger-text)' : 'var(--success-text)' }}>
            {testState === 'sending' && 'Enviando teste…'}
            {testState === 'ok' && '✔ Teste enviado! Confira se chegou no celular do familiar.'}
            {testState === 'fail' && '⚠ Não consegui enviar. Verifique a internet deste aparelho.'}
          </p>
        )}
      </ScrollArea>
      <div className="grid shrink-0 grid-cols-3 gap-2">
        <GlowButton tone="primary" icon="📤" label={copied ? 'Copiado ✔' : 'Enviar convite'} className="text-[0.8em]" onClick={() => void share()} />
        <GlowButton tone="secondary" icon="🔔" label="Enviar teste" disabled={!canReceiveAlerts(member)} className="text-[0.8em]" onClick={() => void test()} />
        <GlowButton tone="neutral" icon="↩️" label="Fechar" className="text-[0.8em]" onClick={onClose} />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
export function Family() {
  const { list, load, revoke, remove } = useFamily();
  const s = useSettings((st) => st.settings);
  const update = useSettings((st) => st.update);
  const [form, setForm] = useState<null | { member?: FamilyMember }>(null);
  const [consent, setConsent] = useState<FamilyMember | null>(null);
  const [invite, setInvite] = useState<FamilyMember | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [patientName, setPatientName] = useState(s.patientName);

  useEffect(() => void load(), [load]);

  const authorizedCount = list.filter(canReceiveAlerts).length;

  return (
    <ScreenShell icon="👨‍👩‍👧" title="Família" subtitle="quem é avisado na emergência">
      <GlassCard className="shrink-0 p-3 text-[0.85em]" style={{ borderColor: authorizedCount ? 'var(--success)' : 'var(--warning)' }}>
        {authorizedCount ? (
          <span style={{ color: 'var(--success-text)' }}>
            ✔ Em uma emergência, <strong>{authorizedCount}</strong> {authorizedCount === 1 ? 'familiar é avisado' : 'familiares são avisados'} no
            celular {s.alertImmediate ? 'na hora' : 'em 5 segundos'}.
          </span>
        ) : (
          <span style={{ color: 'var(--warning-text)' }}>
            ⚠ Ninguém recebe alertas ainda. Cadastre um familiar e peça para o paciente autorizar.
          </span>
        )}
      </GlassCard>

      <ScrollArea innerClassName="flex flex-col gap-3 pb-4">
        {authorizedCount > 0 && <TestAlarmButton />}
        <GlowButton tone="primary" icon="➕" label="Cadastrar familiar" className="la-btn--soon min-h-[3.4em] flex-row text-[1.05em]" onClick={() => setForm({})} />

        {list.map((m) => {
          const ok = !!m.authorizedAt;
          return (
            <GlassCard key={m.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[1.15em] font-bold">{m.name}</span>
                <span className="text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
                  {m.relation}
                </span>
                <span
                  className="ml-auto rounded-full px-3 py-1 text-[0.75em] font-bold"
                  style={{ border: '2px solid', borderColor: ok ? 'var(--success)' : 'var(--warning)', color: ok ? 'var(--success-text)' : 'var(--warning-text)' }}
                >
                  {ok ? '✔ Autorizado' : '⏳ Falta o paciente autorizar'}
                </span>
              </div>
              <div className="text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
                🔔 alertas {m.permissions.photos ? '· 📷 fotos na emergência' : ''}
                {m.phone ? ` · 📞 ${m.phone}` : ''}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ok ? (
                  <>
                    <GlowButton tone="primary" icon="📲" label="Convite e teste" className="text-[0.75em]" onClick={() => setInvite(m)} />
                    <GlowButton tone="warning" icon="🚫" label="Tirar acesso" className="text-[0.75em]" onClick={() => revoke(m.id)} />
                  </>
                ) : (
                  <GlowButton tone="success" icon="✋" label="Paciente autorizar" className="col-span-2 text-[0.8em]" onClick={() => setConsent(m)} />
                )}
                <GlowButton tone="neutral" icon="✏️" label="Editar" className="text-[0.75em]" onClick={() => setForm({ member: m })} />
                <GlowButton tone="danger" icon="🗑️" label="Excluir" className="text-[0.75em]" onClick={() => remove(m.id)} />
              </div>
            </GlassCard>
          );
        })}

        {/* configurações dos alertas */}
        <GlassCard className="flex flex-col gap-3 p-4">
          <h2 className="text-[1.05em] font-bold">⚙️ Como os alertas funcionam</h2>
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="flex-1">
              <TextField
                label="Nome do paciente nos alertas"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                onBlur={() => update({ patientName: patientName.trim() })}
                placeholder="Ex.: Dona Lindaura"
              />
            </div>
            <GlowButton tone="success" label="Salvar nome" className="text-[0.8em]" onClick={() => update({ patientName: patientName.trim() })} />
          </div>
          <span className="font-bold">Quando avisar a família</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <GlowButton tone="danger" aria-pressed={s.alertImmediate} label="⚡ Na hora (recomendado)" className="text-[0.8em]" onClick={() => update({ alertImmediate: true })} />
            <GlowButton tone="secondary" aria-pressed={!s.alertImmediate} label="⏳ Depois de 5 s (dá tempo de cancelar)" className="text-[0.8em]" onClick={() => update({ alertImmediate: false })} />
          </div>
          <p className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
            Se o alarme for cancelado depois do aviso, a família recebe “foi sem querer”.
          </p>
          <span className="font-bold">Fotos na emergência</span>
          <GlowButton
            tone={s.emergencyPhotos ? 'success' : 'neutral'}
            role="switch"
            aria-checked={s.emergencyPhotos}
            aria-pressed={s.emergencyPhotos}
            icon={s.emergencyPhotos ? '📷' : '🚫'}
            label={s.emergencyPhotos ? 'Ligado: tira 3 fotos e envia' : 'Desligado'}
            hint="só para familiares autorizados a receber fotos"
            className="la-btn--menu text-[0.9em]"
            onClick={() => (s.emergencyPhotos ? update({ emergencyPhotos: false }) : setPhotoConsent(true))}
          />
          <p className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
            Os alertas usam o serviço gratuito ntfy ({s.alertServer.replace(/^https?:\/\//, '')}). O vídeo da câmera continua só
            neste aparelho; apenas as fotos de emergência são enviadas, e só se o paciente ligar esta opção. Precisa de internet.
          </p>
        </GlassCard>
      </ScrollArea>

      {form && <MemberForm member={form.member} onClose={() => setForm(null)} />}
      {consent && <ConsentDialog member={consent} onClose={() => setConsent(null)} />}
      {invite && <InviteDialog member={invite} onClose={() => setInvite(null)} />}
      {photoConsent && (
        <PhotoConsent
          onYes={() => {
            update({ emergencyPhotos: true });
            setPhotoConsent(false);
          }}
          onNo={() => setPhotoConsent(false)}
        />
      )}
    </ScreenShell>
  );
}

/** Toca o alarme DE VERDADE no celular da família, marcado como teste. */
function TestAlarmButton() {
  const [state, setState] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <GlowButton
        tone="danger"
        icon="🔔"
        label="Testar alarme da família"
        hint="toca de verdade no celular deles, marcado como TESTE"
        className="la-btn--menu min-h-[3.4em] text-[0.95em]"
        onClick={async () => {
          setState('Enviando…');
          const r = await sendTestAlarm();
          setState(r.failed ? `⚠ ${r.failed} não receberam (sem internet?)` : `✔ Enviado para ${r.sent}. Peça para conferirem se tocou alto.`);
        }}
      />
      {state && (
        <p role="status" className="px-1 text-[0.85em] font-semibold" style={{ color: state.startsWith('⚠') ? 'var(--warning-text)' : 'var(--success-text)' }}>
          {state}
        </p>
      )}
    </div>
  );
}

/** Ligar as fotos também é decisão do paciente (escolhida com a cabeça no modo cabeça). */
function PhotoConsent({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const headMode = useApp((s) => s.tracking.mode === 'head' && s.tracking.status === 'on');
  const [hint, setHint] = useState<string | null>(null);
  return (
    <Dialog label="Autorizar fotos">
      <h2 className="text-center text-[1.5em] font-bold">📷 Fotos na emergência</h2>
      <p className="text-center text-[1.1em]">
        Você autoriza o LindaurIA a <strong>tirar fotos suas</strong> quando o alarme de emergência disparar, e enviar para os
        familiares que você autorizou?
      </p>
      {hint && (
        <p role="alert" className="text-center font-semibold" style={{ color: 'var(--warning-text)' }}>
          {hint}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <GlowButton
          tone="success"
          icon="👍"
          label="Sim, autorizo"
          className="min-h-[4em] text-[1.2em]"
          onClick={(e) => {
            if (headMode && e.isTrusted) {
              setHint('A própria pessoa escolhe “Sim” com a cabeça: pare a seta em cima do botão.');
              return;
            }
            onYes();
          }}
        />
        <GlowButton tone="danger" icon="✋" label="Não" className="min-h-[4em] text-[1.2em]" onClick={onNo} />
      </div>
    </Dialog>
  );
}
