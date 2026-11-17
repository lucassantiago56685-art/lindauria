import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { playPhrase, useMyPhrases, type CustomPhrase } from '../runtime/phrases';
import { sounds } from '../runtime/engine';
import { ScrollArea, TextField } from './ScrollArea';

const ICONS = ['⭐', '💧', '🍽️', '🛏️', '❤️', '🙏', '😊', '😢', '⚡', '🚻', '📺', '📞', '👋', '😂', '🎵', '🌙'];
const MAX_REC_MS = 15_000;

type RecState = 'idle' | 'recording' | 'done' | 'error';

/** Grava um som curto pelo microfone (fica só neste aparelho). */
function useRecorder(initial: string | null) {
  const [audio, setAudio] = useState<string | null>(initial);
  const [state, setState] = useState<RecState>(initial ? 'done' : 'idle');
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const stop = () => {
    clearInterval(timer.current);
    if (rec.current?.state === 'recording') rec.current.stop();
  };

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      rec.current = r;
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          setAudio(reader.result as string);
          setState('done');
        };
        reader.readAsDataURL(blob);
      };
      r.start();
      setState('recording');
      const t0 = Date.now();
      setElapsed(0);
      timer.current = setInterval(() => {
        const ms = Date.now() - t0;
        setElapsed(ms);
        if (ms >= MAX_REC_MS) stop();
      }, 200);
    } catch {
      setState('error');
    }
  }

  useEffect(() => () => stop(), []);

  return {
    audio,
    state,
    elapsed,
    start,
    stop,
    clear: () => {
      setAudio(null);
      setState('idle');
    },
  };
}

export function PhraseEditor({
  phrase,
  initialText = '',
  onClose,
}: {
  phrase?: CustomPhrase;
  initialText?: string;
  onClose: () => void;
}) {
  const { add, update, remove } = useMyPhrases();
  const [text, setText] = useState(phrase?.text ?? initialText);
  const [icon, setIcon] = useState(phrase?.icon ?? '⭐');
  const [mode, setMode] = useState<'voice' | 'audio'>(phrase?.audio ? 'audio' : 'voice');
  const rec = useRecorder(phrase?.audio ?? null);
  const [error, setError] = useState<string | null>(null);

  const audio = mode === 'audio' ? rec.audio : null;

  function save() {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return setError('Escreva o texto da frase (ele aparece no botão).');
    if (mode === 'audio' && !rec.audio) return setError('Grave o som ou escolha “Voz do app”.');
    if (phrase) update(phrase.id, { text: t, icon, audio });
    else add({ text: t, icon, audio });
    sounds.sent();
    onClose();
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={phrase ? 'Editar frase' : 'Nova frase'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[1000] flex items-stretch justify-center p-3 sm:items-center sm:p-6"
      style={{ background: 'color-mix(in srgb, var(--bg-deep) 94%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <GlassCard className="flex max-h-full w-full max-w-2xl flex-col gap-3 p-4 sm:p-6">
        <h2 className="shrink-0 text-center text-[1.4em] font-bold">{phrase ? '✏️ Editar frase' : '➕ Nova frase pronta'}</h2>
        <ScrollArea innerClassName="flex flex-col gap-4 pb-2">
          <TextField
            label="Texto da frase"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: Quero um café com leite, por favor"
            hint="É o que aparece no botão e o que a voz do app fala."
          />

          <div className="flex flex-col gap-2">
            <span className="font-bold">Ícone</span>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {ICONS.map((i) => (
                <GlowButton key={i} tone="neutral" aria-pressed={icon === i} aria-label={`Ícone ${i}`} label={i} className="min-h-[2.4em] p-0 text-[1.2em]" onClick={() => setIcon(i)} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-bold">Som da frase</span>
            <div className="grid grid-cols-2 gap-2">
              <GlowButton tone="secondary" aria-pressed={mode === 'voice'} icon="🗣️" label="Voz do app" className="text-[0.85em]" onClick={() => setMode('voice')} />
              <GlowButton tone="secondary" aria-pressed={mode === 'audio'} icon="🎙️" label="Gravar um som" className="text-[0.85em]" onClick={() => setMode('audio')} />
            </div>
            {mode === 'audio' && (
              <div className="la-glass flex flex-col gap-3 p-3">
                <p className="text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
                  Grave a voz da pessoa, de um familiar, uma risada… (até 15 segundos). O som fica só neste aparelho.
                </p>
                {rec.state === 'recording' ? (
                  <GlowButton tone="danger" icon="⏹️" label={`Parar (${Math.ceil((MAX_REC_MS - rec.elapsed) / 1000)}s)`} className="min-h-[3em]" onClick={rec.stop} />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <GlowButton tone="danger" icon="🔴" label={rec.audio ? 'Gravar de novo' : 'Gravar'} className="min-h-[3em] text-[0.9em]" onClick={() => void rec.start()} />
                    <GlowButton tone="success" icon="▶️" label="Ouvir" disabled={!rec.audio} className="min-h-[3em] text-[0.9em]" onClick={() => void playPhrase({ text, audio: rec.audio })} />
                  </div>
                )}
                {rec.state === 'error' && (
                  <p role="alert" className="font-semibold" style={{ color: 'var(--danger-text)' }}>
                    Não consegui usar o microfone. Permita o microfone no navegador e tente de novo.
                  </p>
                )}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="font-semibold" style={{ color: 'var(--danger-text)' }}>
              {error}
            </p>
          )}

          <GlowButton tone="success" icon="🔊" label="Testar a frase" disabled={!text.trim()} onClick={() => void playPhrase({ text, audio })} />
        </ScrollArea>

        <div className={`grid shrink-0 gap-2 ${phrase ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {phrase && (
            <GlowButton
              tone="danger"
              icon="🗑️"
              label="Apagar"
              className="text-[0.9em]"
              onClick={() => {
                remove(phrase.id);
                onClose();
              }}
            />
          )}
          <GlowButton tone="neutral" icon="↩️" label="Cancelar" className="text-[0.9em]" onClick={onClose} />
          <GlowButton tone="primary" icon="💾" label="Salvar" className="text-[0.9em]" onClick={save} />
        </div>
      </GlassCard>
    </motion.div>
  );
}
