import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { CHAT_SUGGESTIONS, detectUrgency, type UrgencyCheck } from '@lindauria/ai';
import { finalizeText } from '@lindauria/keyboards';
import { secureDelete, secureGet, secureSet } from '@lindauria/shared';
import { useApp } from '../store/app';
import { emergency, say, sounds } from '../runtime/engine';
import { AiFailure, askChat, type ChatTurn } from '../runtime/ai';
import { ScreenShell } from '../components/common';
import { ScrollArea, TextField } from '../components/ScrollArea';

const KEY = 'chat-history';

/** Aviso de urgência: aparece NA HORA (antes da IA responder). */
export function UrgencyBanner({ check }: { check: UrgencyCheck }) {
  if (!check.urgent) return null;
  return (
    <GlassCard className="la-emergency flex flex-col gap-3 p-4" role="alert" style={{ borderColor: 'var(--danger)' }}>
      <p className="text-[1.05em] font-bold" style={{ color: 'var(--danger-text)' }}>
        ⚠️ Isso pode ser urgente. Use o botão de emergência ou ligue 192 (SAMU).
      </p>
      {check.emotional && (
        <p className="font-semibold">
          💜 Você não está sozinho(a). O <strong>CVV</strong> conversa com você a qualquer hora: ligue <strong>188</strong> (grátis).
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <GlowButton tone="danger" icon="🆘" label="Emergência" className="flex-row" onClick={() => emergency.trigger('button')} />
        <a href="tel:192" className="la-btn la-tone-danger flex-row" style={{ textDecoration: 'none' }}>
          📞 SAMU 192
        </a>
        {check.emotional && (
          <a href="tel:188" className="la-btn la-tone-secondary flex-row" style={{ textDecoration: 'none' }}>
            💜 CVV 188
          </a>
        )}
      </div>
    </GlassCard>
  );
}

export function Chat() {
  const text = useApp((s) => s.text);
  const setText = useApp((s) => s.setText);
  const go = useApp((s) => s.go);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<UrgencyCheck>({ urgent: false, emotional: false });
  const [typed, setTyped] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void secureGet<ChatTurn[]>(KEY).then((h) => h && setHistory(h));
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [history, busy]);

  async function ask(question: string) {
    const q = finalizeText(question);
    if (!q || busy) return;
    setError(null);
    // filtro de segurança local: mostra emergência/SAMU/CVV na hora, sem esperar a IA
    const check = detectUrgency(q);
    setUrgency(check);
    if (check.urgent) sounds.error();
    const next: ChatTurn[] = [...history, { role: 'user', content: q }];
    setHistory(next);
    setBusy(true);
    try {
      const answer = await askChat(next);
      const done: ChatTurn[] = [...next, { role: 'assistant', content: answer }];
      setHistory(done);
      void secureSet(KEY, done.slice(-60));
      sounds.sent();
      void say(answer);
    } catch (e) {
      setError(e instanceof AiFailure ? e.message : 'Não consegui falar com a IA agora.');
      sounds.error();
    } finally {
      setBusy(false);
    }
  }

  const lastAnswer = [...history].reverse().find((m) => m.role === 'assistant');

  return (
    <ScreenShell icon="🤖" title="Chat LindaurIA" subtitle="tire dúvidas com a IA">
      <UrgencyBanner check={urgency} />

      <ScrollArea innerClassName="flex flex-col gap-3 pb-2">
        {history.length === 0 && (
          <>
            <p className="text-[0.9em]" style={{ color: 'var(--text-secondary)' }}>
              Escolha uma pergunta pronta, ou escreva a sua. A LindaurIA é uma inteligência artificial: ajuda a entender, mas
              não substitui médico nem a equipe de saúde.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CHAT_SUGGESTIONS.map((s) => (
                <GlowButton key={s.text} tone="secondary" icon={s.icon} label={s.text} className="la-btn--menu min-h-[3.8em] text-[0.95em]" onClick={() => void ask(s.text)} />
              ))}
            </div>
          </>
        )}

        {history.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={m.role === 'user' ? 'self-end' : 'self-start'}
            style={{ maxWidth: 'min(52em, 92%)' }}
          >
            <div
              className="la-glass whitespace-pre-line px-4 py-3 text-[1.02em]"
              style={
                m.role === 'assistant'
                  ? { borderColor: 'var(--secondary)', boxShadow: '0 0 calc(18px * var(--glow)) color-mix(in srgb, var(--secondary) 30%, transparent)' }
                  : { borderColor: 'var(--primary)' }
              }
            >
              <span className="mb-1 block text-[0.72em] font-bold" style={{ color: m.role === 'assistant' ? 'var(--secondary-text)' : 'var(--primary-text)' }}>
                {m.role === 'assistant' ? '🤖 LindaurIA' : '🙂 Você'}
              </span>
              {m.content}
            </div>
          </motion.div>
        ))}
        {busy && (
          <p className="self-start animate-pulse text-[0.95em] font-semibold" style={{ color: 'var(--secondary-text)' }} role="status">
            🤖 Pensando…
          </p>
        )}
        {error && (
          <p role="alert" className="la-glass p-3 font-semibold" style={{ color: 'var(--danger-text)', borderColor: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <div ref={endRef} />
      </ScrollArea>

      {/* ações: perguntar o texto escrito, ouvir, simplificar */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        <GlowButton
          tone="primary"
          icon="❓"
          label={text.trim() ? 'Perguntar o que escrevi' : 'Escrever pergunta'}
          className="text-[0.75em]"
          disabled={busy}
          onClick={() => {
            if (text.trim()) {
              void ask(text);
              setText('');
            } else go('speak');
          }}
        />
        <GlowButton tone="success" icon="🔊" label="Ouvir resposta" className="text-[0.75em]" disabled={!lastAnswer} onClick={() => lastAnswer && void say(lastAnswer.content)} />
        <GlowButton tone="secondary" icon="🙂" label="Mais simples" className="text-[0.75em]" disabled={!lastAnswer || busy} onClick={() => void ask('Explique de um jeito mais simples, em 2 frases.')} />
        <GlowButton tone="secondary" icon="➕" label="Explicar mais" className="text-[0.75em]" disabled={!lastAnswer || busy} onClick={() => void ask('Explique mais, com um pouco mais de detalhes.')} />
        <GlowButton
          tone="warning"
          icon="🧹"
          label="Nova conversa"
          className="text-[0.75em]"
          disabled={!history.length || busy}
          onClick={() => {
            setHistory([]);
            setUrgency({ urgent: false, emotional: false });
            void secureDelete(KEY);
          }}
        />
      </div>

      {/* campo para o cuidador digitar */}
      <form
        className="flex shrink-0 items-end gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void ask(typed);
          setTyped('');
        }}
      >
        <div className="min-w-0 flex-1">
          <TextField label="Ou digite aqui (cuidador)" icon="💬" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Escreva sua pergunta…" />
        </div>
        <GlowButton type="submit" dwell={false} tone="primary" icon="➤" label="Enviar" className="la-btn--bar" disabled={!typed.trim() || busy} />
      </form>
    </ScreenShell>
  );
}
