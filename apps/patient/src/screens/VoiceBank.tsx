import { useEffect, useState } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { useSettings } from '../store/settings';
import { sounds } from '../runtime/engine';
import { BANK_SUGGESTIONS, bankKey, useVoiceBank } from '../runtime/voicebank';
import { useRecorder } from '../components/PhraseEditor';
import { ScreenShell } from '../components/common';
import { ScrollArea, TextField } from '../components/ScrollArea';

/** Gravador de UMA frase (abre por cima da lista). */
function RecordPanel({ text, onClose }: { text: string; onClose: () => void }) {
  const existing = useVoiceBank((s) => s.items[bankKey(text)]);
  const save = useVoiceBank((s) => s.save);
  const rec = useRecorder(existing?.audio ?? null);
  return (
    <div role="dialog" aria-modal="true" aria-label="Gravar frase" className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{ background: 'color-mix(in srgb, var(--bg-deep) 92%, transparent)' }}>
      <GlassCard className="flex w-full max-w-xl flex-col gap-4 p-6 text-center">
        <p className="text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
          Fale com calma, do seu jeito, num lugar silencioso:
        </p>
        <h2 className="la-display text-[clamp(24px,5vw,2.2em)] font-bold">“{text}”</h2>
        {rec.state === 'recording' ? (
          <GlowButton tone="danger" icon="⏹️" label={`Parar (${Math.ceil(rec.elapsed / 1000)} s)`} className="min-h-[4em] text-[1.2em]" onClick={rec.stop} />
        ) : (
          <GlowButton tone="danger" icon="🎙️" label={rec.audio ? 'Gravar de novo' : 'Gravar'} className="min-h-[4em] text-[1.2em]" onClick={() => void rec.start()} />
        )}
        {rec.state === 'error' && (
          <p role="alert" style={{ color: 'var(--danger-text)' }}>
            Não consegui usar o microfone. Libere o microfone nas permissões do navegador.
          </p>
        )}
        {rec.audio && rec.state !== 'recording' && <audio src={rec.audio} controls className="w-full" />}
        <div className="grid grid-cols-2 gap-3">
          <GlowButton tone="neutral" icon="↩️" label="Voltar" onClick={onClose} />
          <GlowButton
            tone="success"
            icon="💾"
            label="Guardar"
            disabled={!rec.audio || rec.state === 'recording'}
            onClick={() => {
              if (!rec.audio) return;
              save(text, rec.audio);
              sounds.sent();
              onClose();
            }}
          />
        </div>
      </GlassCard>
    </div>
  );
}

export function VoiceBank() {
  const { items, load, remove } = useVoiceBank();
  const useMyVoice = useSettings((s) => s.settings.useMyVoice);
  const update = useSettings((s) => s.update);
  const [recording, setRecording] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  useEffect(() => void load(), [load]);

  const total = Object.keys(items).length;
  const suggested = new Set(BANK_SUGGESTIONS.flatMap((g) => g.items.map(bankKey)));
  const customs = Object.values(items).filter((i) => !suggested.has(i.key));

  const chip = (text: string) => {
    const has = !!items[bankKey(text)];
    return (
      <GlowButton
        key={text}
        tone={has ? 'success' : 'neutral'}
        icon={has ? '✔' : '🎙️'}
        label={text}
        hint={has ? 'gravada · regravar' : 'gravar'}
        className="min-h-[3.2em] text-[0.85em]"
        onClick={() => setRecording(text)}
      />
    );
  };

  return (
    <ScreenShell icon="🎙️" title="Banco de voz" subtitle="grave frases com a sua própria voz">
      <ScrollArea innerClassName="flex flex-col gap-3 pb-4">
        <GlassCard className="flex flex-col gap-2 p-4" style={{ borderColor: 'var(--accent)' }}>
          <p className="font-semibold">
            💜 Enquanto você ainda fala, grave as frases que mais usa. Depois, quando você mandar o app falar uma delas, ele toca{' '}
            <strong>a sua voz</strong>, no teclado, no Sim/Não e nas frases prontas.
          </p>
          <p className="text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
            {total} frase(s) gravada(s). As gravações ficam só neste aparelho e entram na cópia de segurança. Frases que não
            foram gravadas continuam com a voz do app. Criar uma voz sintética que fale <em>qualquer</em> frase com o seu timbre
            exige um serviço especializado de clonagem de voz; guardar estas gravações agora ajuda nisso no futuro.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold">Usar a minha voz quando existir gravação:</span>
            <GlowButton tone={useMyVoice ? 'success' : 'neutral'} aria-pressed={useMyVoice} label={useMyVoice ? 'Ligado' : 'Desligado'} className="la-btn--bar" onClick={() => update({ useMyVoice: !useMyVoice })} />
          </div>
        </GlassCard>

        {BANK_SUGGESTIONS.map((g) => (
          <section key={g.group} className="flex flex-col gap-2">
            <h2 className="px-1 text-[0.8em] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {g.group}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{g.items.map(chip)}</div>
          </section>
        ))}

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[0.8em] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Minhas frases (nomes, apelidos, expressões)
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <TextField label="Escreva a frase" icon="✍️" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Ex.: Oi, Maria, meu amor" />
            </div>
            <GlowButton
              tone="primary"
              icon="🎙️"
              label="Gravar esta"
              disabled={!custom.trim()}
              className="flex-row"
              onClick={() => {
                setRecording(custom.trim());
                setCustom('');
              }}
            />
          </div>
          {customs.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {customs.map((c) => (
                <GlassCard key={c.key} className="flex items-center gap-2 p-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">✔ {c.text}</span>
                  <GlowButton tone="neutral" icon="🎙️" label="Regravar" className="la-btn--bar" onClick={() => setRecording(c.text)} />
                  <GlowButton tone="danger" icon="🗑️" label="Apagar" className="la-btn--bar" onClick={() => remove(c.key)} />
                </GlassCard>
              ))}
            </div>
          )}
        </section>
      </ScrollArea>
      {recording && <RecordPanel text={recording} onClose={() => setRecording(null)} />}
    </ScreenShell>
  );
}
