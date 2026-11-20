import { useRef, useState, type ReactNode } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { secureDelete, secureWipeAll } from '@lindauria/shared';
import { sounds } from '../runtime/engine';
import { exportProtectedBackup, exportReadable, restoreProtectedBackup } from '../runtime/backup';
import { ConfirmDialog, ScreenShell } from '../components/common';
import { ScrollArea, TextField } from '../components/ScrollArea';

export const POLICY_VERSION = '2026-11-19';

function Block({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <GlassCard className="flex flex-col gap-2 p-4">
      <h2 className="text-[1.05em] font-bold">
        <span aria-hidden="true">{icon}</span> {title}
      </h2>
      <div className="flex flex-col gap-1.5 text-[0.9em] leading-relaxed">{children}</div>
    </GlassCard>
  );
}

/** Política de privacidade em palavras simples (LGPD) — leitura, sem precisar de PIN. */
export function PrivacyPolicy() {
  return (
    <>
      <p className="px-1 text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
        Versão de {POLICY_VERSION.split('-').reverse().join('/')}. Lei Geral de Proteção de Dados (Lei 13.709/2018).
      </p>
      <Block icon="🩺" title="Quais dados o LindaurIA usa">
        <p>
          Frases faladas, vocabulário aprendido, registros de humor e dor, mapa de dor, lembretes, contatos da família, gravações
          de voz e, se você autorizar, fotos. <strong>Humor, dor, fotos e voz são dados sensíveis de saúde</strong> (LGPD, art.
          11): só usamos com o seu consentimento e só para ajudar na sua comunicação e no seu cuidado.
        </p>
      </Block>
      <Block icon="📱" title="Onde ficam">
        <p>
          <strong>Neste aparelho</strong>, criptografados. Não temos um servidor com os seus dados. A câmera que segue a cabeça
          é processada só no aparelho: nenhum vídeo sai dele.
        </p>
      </Block>
      <Block icon="📤" title="Quando algo sai do aparelho">
        <p>
          <strong>Alertas para a família</strong> (emergência, lembretes e, se autorizado, fotos da emergência): passam pelo
          serviço ntfy.sh e, se o cuidador conectar um robô, pelo Telegram, até o celular dos familiares que <em>o paciente</em> autorizou. O endereço é secreto, mas não use
          esse canal para outras informações.
        </p>
        <p>
          <strong>Chat IA e Câmera IA</strong>: o texto ou a foto que você escolher enviar vai para a IA Claude (Anthropic)
          para gerar a resposta. Só acontece depois do seu consentimento, e cada uso é uma escolha sua.
        </p>
        <p>
          <strong>Modo conversa</strong>: o reconhecimento de fala do navegador pode enviar o áudio para o serviço do navegador
          (Google ou Microsoft) para virar texto.
        </p>
      </Block>
      <Block icon="✋" title="Seus direitos (LGPD, art. 18)">
        <p>Ver, levar com você, corrigir e apagar os seus dados, e retirar o consentimento quando quiser. Tudo nesta tela:</p>
        <p>• Exportar meus dados • Cópia de segurança • Retirar consentimentos • Apagar tudo</p>
      </Block>
      <Block icon="⚠️" title="Limites">
        <p>
          O LindaurIA <strong>não substitui médico, equipe de saúde nem monitores de sinais vitais</strong>. Sem internet, a
          emergência toca só no aparelho. Informações de direitos e saúde podem mudar: confirme com o médico, o CRAS ou o INSS.
        </p>
      </Block>
    </>
  );
}

export function Privacy() {
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'wipe' | 'restore'>(null);
  const file = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      sounds.sent();
    } catch (e) {
      sounds.error();
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não deu certo. Tente de novo.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell icon="🔒" title="Privacidade e dados" subtitle="LGPD: seus dados, suas escolhas">
      <ScrollArea innerClassName="flex flex-col gap-3 pb-4">
        <GlassCard className="flex flex-col gap-3 p-4" style={{ borderColor: 'var(--primary)' }}>
          <h2 className="text-[1.1em] font-bold">💾 Cópia de segurança</h2>
          <p className="text-[0.88em]" style={{ color: 'var(--text-secondary)' }}>
            Guarda vocabulário, frases, gravações, registros, lembretes, família e ajustes num arquivo protegido por senha.
            Se o aparelho quebrar ou for trocado, é só restaurar. Recomendado para quem usa <strong>sem conta</strong>. Guarde o
            arquivo no Google Drive, e-mail ou pendrive, e anote a senha.
          </p>
          <TextField label="Senha da cópia (mínimo 6)" icon="🔑" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <GlowButton
              tone="primary"
              icon="⬇️"
              label="Fazer cópia agora"
              disabled={busy}
              className="flex-row"
              onClick={() => void run(async () => `✔ Cópia salva (${await exportProtectedBackup(pass)} itens). Veja em Downloads.`)}
            />
            <GlowButton tone="secondary" icon="⬆️" label="Restaurar uma cópia" disabled={busy} className="flex-row" onClick={() => file.current?.click()} />
          </div>
          <input
            ref={file}
            type="file"
            accept=".lindauria,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              if (f) {
                setPicked(f);
                setConfirm('restore');
              }
            }}
          />
          {msg && (
            <p role="status" className="font-semibold" style={{ color: msg.ok ? 'var(--success-text)' : 'var(--danger-text)' }}>
              {msg.text}
            </p>
          )}
        </GlassCard>

        <GlassCard className="flex flex-col gap-2 p-4">
          <h2 className="text-[1.1em] font-bold">📄 Exportar meus dados</h2>
          <p className="text-[0.88em]" style={{ color: 'var(--text-secondary)' }}>
            Um arquivo aberto (JSON) com tudo o que o app guardou, para você ver ou levar. Contém dados de saúde: guarde com
            cuidado. Para relatórios para o médico, use <strong>Relatórios</strong>.
          </p>
          <GlowButton tone="neutral" icon="📄" label="Exportar (arquivo aberto)" disabled={busy} className="flex-row" onClick={() => void run(async () => (await exportReadable(), '✔ Arquivo salvo em Downloads.'))} />
        </GlassCard>

        <GlassCard className="flex flex-col gap-2 p-4">
          <h2 className="text-[1.1em] font-bold">✋ Retirar consentimentos</h2>
          <p className="text-[0.88em]" style={{ color: 'var(--text-secondary)' }}>
            A IA volta a pedir autorização antes de receber textos ou fotos. Para parar os alertas de um familiar, use{' '}
            <strong>Família → Remover autorização</strong>.
          </p>
          <GlowButton
            tone="warning"
            icon="🚫"
            label="Retirar consentimento da IA"
            className="flex-row"
            onClick={() =>
              void run(async () => {
                await secureDelete('ai-photo-consent');
                await secureDelete('ai-chat-consent');
                return '✔ Consentimentos da IA retirados.';
              })
            }
          />
        </GlassCard>

        <GlassCard className="flex flex-col gap-2 p-4" style={{ borderColor: 'var(--danger)' }}>
          <h2 className="text-[1.1em] font-bold">🗑️ Apagar todos os dados</h2>
          <p className="text-[0.88em]" style={{ color: 'var(--text-secondary)' }}>
            Apaga deste aparelho: contas, ajustes, vocabulário, frases, gravações, registros, lembretes e família. Faça uma cópia
            antes, se quiser guardar.
          </p>
          <GlowButton tone="danger" icon="🗑️" label="Apagar tudo" className="flex-row" onClick={() => setConfirm('wipe')} />
        </GlassCard>

        <h2 className="mt-2 px-1 text-[0.8em] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Política de privacidade
        </h2>
        <PrivacyPolicy />
      </ScrollArea>

      {confirm === 'wipe' && (
        <ConfirmDialog
          title="Apagar TODOS os dados deste aparelho?"
          message="Isso não pode ser desfeito."
          confirmLabel="Apagar tudo"
          cancelLabel="Cancelar"
          danger
          onConfirm={async () => {
            await secureWipeAll();
            location.reload();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'restore' && picked && (
        <ConfirmDialog
          title="Restaurar esta cópia?"
          message={`O arquivo "${picked.name}" vai substituir os dados atuais deste aparelho. Use a senha digitada acima.`}
          confirmLabel="Restaurar"
          cancelLabel="Cancelar"
          onConfirm={() => {
            setConfirm(null);
            void run(async () => {
              const n = await restoreProtectedBackup(picked, pass);
              setTimeout(() => location.reload(), 1500);
              return `✔ ${n} itens restaurados. Reiniciando…`;
            });
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </ScreenShell>
  );
}
