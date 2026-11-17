import { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton, LogoMark, Wordmark } from '@lindauria/design-system';
import { unlockAudio, isPersistentStorage } from '@lindauria/shared';
import type { TrackerError } from '@lindauria/input-engine';
import { useApp } from '../store/app';
import { getSettings, useSettings } from '../store/settings';
import { keepScreenAwake, speaker, startInput } from '../runtime/engine';

const ERRORS: Record<TrackerError, string> = {
  'camera-denied': 'A câmera foi bloqueada. Permita o uso da câmera no navegador (ícone de cadeado perto do endereço) e tente de novo.',
  'camera-missing': 'Não encontrei nenhuma câmera neste aparelho.',
  'model-failed': 'Não consegui carregar o rastreamento de rosto. Verifique se rodou "pnpm dev" (ele prepara os arquivos) e tente de novo.',
  unknown: 'Algo deu errado ao ligar a câmera. Tente de novo.',
};

/**
 * Abertura. Precisa de UM toque (do cuidador ou da pessoa) porque os navegadores só liberam
 * som e câmera depois de uma interação — e o alarme de emergência PRECISA de som.
 */
export function Splash() {
  const go = useApp((s) => s.go);
  const account = useApp((s) => s.account);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TrackerError | null>(null);

  async function begin(mode = getSettings().inputMode) {
    setBusy(true);
    setError(null);
    await unlockAudio();
    void keepScreenAwake();
    // "acorda" o motor de voz (alguns navegadores exigem a 1ª fala após um toque)
    void speaker.speak(' ', { volume: 0 });
    if (mode !== getSettings().inputMode) useSettings.getState().update({ inputMode: mode });
    const err = await startInput(mode);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    go(mode === 'head' && !getSettings().calibration ? 'calibration' : 'hub');
  }

  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-8 overflow-auto px-4 py-8 text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
        <LogoMark size={128} animated />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-[3em] leading-none"
      >
        <Wordmark />
      </motion.h1>
      {account && (
        <p className="text-[1.3em] font-semibold" style={{ color: 'var(--accent-text)' }}>
          Olá, {account.name.split(' ')[0]}! 💜
        </p>
      )}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 1 }}
        className="la-display max-w-3xl text-[1.3em] font-medium"
        style={{ color: 'var(--text-secondary)' }}
      >
        A doença tira os movimentos.
        <br />
        <span style={{ color: 'var(--text-primary)' }}>A LindaurIA devolve a voz, a autonomia e a conexão.</span>
      </motion.p>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="flex w-full max-w-xl flex-col gap-4">
        <GlowButton
          dwell={false}
          tone="primary"
          icon="✨"
          label={busy ? 'Ligando…' : 'Começar'}
          hint="toque aqui (o cuidador pode tocar)"
          disabled={busy}
          className="min-h-[4.5em] text-[1.4em]"
          onClick={() => void begin()}
        />
        {error && (
          <GlassCard className="p-4 text-left" role="alert" style={{ borderColor: 'var(--danger)' }}>
            <p className="font-semibold" style={{ color: 'var(--danger-text)' }}>
              {ERRORS[error]}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <GlowButton dwell={false} tone="primary" label="Tentar de novo" onClick={() => void begin('head')} />
              <GlowButton dwell={false} tone="neutral" label="Usar mouse / toque" onClick={() => void begin('pointer')} />
            </div>
          </GlassCard>
        )}
        <p className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
          🔒 O vídeo da câmera é processado só neste aparelho. Fotos só saem numa emergência, para familiares que você autorizar.
          <br />O LindaurIA não substitui médico, equipe de saúde nem monitor de sinais vitais.
          {!isPersistentStorage() && (
            <>
              <br />
              <strong style={{ color: 'var(--warning-text)' }}>
                Atenção: este navegador não está guardando dados (modo privado?). As configurações vão se perder ao fechar.
              </strong>
            </>
          )}
        </p>
      </motion.div>
    </div>
  );
}
