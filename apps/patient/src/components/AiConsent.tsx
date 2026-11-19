import { useEffect, useState, type ReactNode } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { secureGet, secureSet } from '@lindauria/shared';
import { useApp } from '../store/app';

/**
 * Consentimento EXPLÍCITO antes de usar a IA (LGPD, art. 11 — dados sensíveis de saúde).
 * Fica salvo com data; pode ser retirado em Privacidade e dados.
 */
export function useAiConsent(key: 'ai-chat-consent' | 'ai-photo-consent') {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    void secureGet<unknown>(key).then((v) => setState(!!v));
  }, [key]);
  const give = () => {
    setState(true);
    void secureSet(key, { at: Date.now(), version: 1 });
  };
  return [state, give] as const;
}

export function AiConsentCard({ what, children, onAccept }: { what: 'chat' | 'photo'; children?: ReactNode; onAccept: () => void }) {
  const go = useApp((s) => s.go);
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto">
      <GlassCard className="flex max-w-2xl flex-col gap-3 p-6">
        <h2 className="text-center text-[1.4em] font-bold">🔒 Sua autorização</h2>
        <p>
          {what === 'photo' ? (
            <>
              Quando você escolher uma pergunta, <strong>a foto é enviada para a inteligência artificial Claude (Anthropic)</strong> para
              ser analisada. Fotos podem mostrar o seu corpo, a sua casa e documentos de saúde.
            </>
          ) : (
            <>
              O que você escrever no Chat é <strong>enviado para a inteligência artificial Claude (Anthropic)</strong> para gerar a
              resposta. Pode incluir informações sobre a sua saúde.
            </>
          )}
        </p>
        <ul className="flex flex-col gap-1 text-[0.9em]" style={{ color: 'var(--text-secondary)' }}>
          <li>• Só é enviado o que você escolher, quando você escolher.</li>
          <li>• Nada é enviado sem a sua ação. A câmera da seta continua só no aparelho.</li>
          <li>• A IA pode errar e não substitui médico, CRAS ou INSS.</li>
          <li>• Você pode retirar esta autorização em Ajustes → Privacidade e dados.</li>
        </ul>
        {children}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GlowButton tone="success" icon="✔" label="Eu autorizo" className="min-h-[3.6em] sm:col-span-1" onClick={onAccept} />
          <GlowButton tone="neutral" icon="🔒" label="Ler a política" className="min-h-[3.6em]" onClick={() => go('privacy')} />
          <GlowButton tone="neutral" icon="🏠" label="Não, voltar" className="min-h-[3.6em]" onClick={() => go('hub')} />
        </div>
      </GlassCard>
    </div>
  );
}
