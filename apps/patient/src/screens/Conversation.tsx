import { useEffect, useRef, useState } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { useApp } from '../store/app';
import { say, sounds } from '../runtime/engine';
import { AiFailure, askChat } from '../runtime/ai';
import { ScreenShell } from '../components/common';
import { ScrollArea } from '../components/ScrollArea';

/*
 * MODO CONVERSA: o cuidador fala, o app escreve na tela (letras grandes) e sugere respostas
 * rápidas que a pessoa escolhe com a cabeça — e o app fala a resposta.
 * Reconhecimento de fala do próprio navegador (Chrome/Edge; pode usar a internet do navegador).
 */

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const RecCtor = (): (new () => Rec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const BASE = ['Sim', 'Não', 'Não sei', 'Talvez', 'Espera um pouco', 'Pode repetir?'];
const RULES: Array<[RegExp, string[]]> = [
  [/\b(como (voc[eê] )?(est[aá]|t[aá])|tudo bem|t[aá] bem)\b/i, ['Estou bem', 'Mais ou menos', 'Não estou bem']],
  [/\b(d[oó]i|dor|machuc)/i, ['Sim, estou com dor', 'Não estou com dor', 'Vou mostrar onde dói']],
  [/\b(fome|comer|almo[cç]|jant|lanche|comida)/i, ['Estou com fome', 'Agora não, obrigado', 'Só um pouco']],
  [/\b([aá]gua|sede|beber|suco|caf[eé])/i, ['Quero, sim', 'Agora não', 'Um pouquinho']],
  [/\b(dormir|sono|cansad|descansar)/i, ['Quero descansar', 'Ainda não', 'Estou cansado']],
  [/\b(banheiro|xixi|fralda|trocar)/i, ['Sim, preciso', 'Não preciso agora']],
  [/\b(frio|calor|cobert|ventilador|janela)/i, ['Estou com frio', 'Estou com calor', 'Está bom assim']],
  [/\b(posi[cç][aã]o|virar|deitar|sentar|levantar)/i, ['Quero mudar de posição', 'Estou confortável']],
  [/\b(quer|gostaria|vamos|pode)\b/i, ['Quero, sim', 'Não, obrigado']],
  [/\b(te amo|amo voc|saudade)/i, ['Eu também te amo', 'Também senti saudade']],
];

function suggest(heard: string): string[] {
  const out: string[] = [];
  for (const [re, list] of RULES) if (re.test(heard)) out.push(...list);
  return [...new Set([...out, ...BASE])].slice(0, 9);
}

export function Conversation() {
  const go = useApp((s) => s.go);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [interim, setInterim] = useState('');
  const [log, setLog] = useState<Array<{ who: 'eles' | 'eu'; text: string }>>([]);
  const [aiIdeas, setAiIdeas] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const want = useRef(false);
  const supported = !!RecCtor();

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    const C = RecCtor();
    if (!C) return;
    setError(null);
    const r = new C();
    r.lang = 'pt-BR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let fin = '';
      let mid = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript;
        else mid += res[0].transcript;
      }
      setInterim(mid);
      if (fin.trim()) {
        const t = fin.trim();
        setHeard(t);
        setAiIdeas([]);
        setLog((l) => [...l, { who: 'eles' as const, text: t }].slice(-30));
      }
    };
    r.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        want.current = false;
        setError('O microfone não foi liberado. Libere o microfone nas permissões do navegador.');
      } else if (ev.error === 'network') setError('O reconhecimento de fala precisa de internet neste navegador.');
    };
    // o navegador para sozinho depois de um silêncio: religa enquanto o modo estiver ligado
    r.onend = () => {
      if (want.current) {
        try {
          r.start();
        } catch {
          /* já ligado */
        }
      } else setListening(false);
    };
    rec.current = r;
    want.current = true;
    try {
      r.start();
      setListening(true);
    } catch {
      setError('Não consegui ligar o microfone.');
    }
  }

  function stop() {
    want.current = false;
    rec.current?.stop();
    setListening(false);
    setInterim('');
  }

  async function answer(t: string) {
    if (t === 'Vou mostrar onde dói') return go('painmap');
    setLog((l) => [...l, { who: 'eu' as const, text: t }].slice(-30));
    // não "ouvir" a própria resposta do app
    const was = want.current;
    if (was) stop();
    await say(t);
    if (was) start();
  }

  async function askAi() {
    if (!heard) return;
    setAiBusy(true);
    try {
      const raw = await askChat([
        {
          role: 'user',
          content: `Uma pessoa com ELA, que não fala, ouviu do cuidador: "${heard}". Sugira 4 respostas curtas (máximo 6 palavras cada), em primeira pessoa, variadas. Responda só com as 4 respostas, uma por linha, sem números.`,
        },
      ]);
      setAiIdeas(
        raw
          .split('\n')
          .map((x) => x.replace(/^[-•\d.)\s"]+|["\s]+$/g, '').trim())
          .filter(Boolean)
          .slice(0, 4),
      );
    } catch (e) {
      sounds.error();
      setError(e instanceof AiFailure ? e.message : 'A IA não respondeu agora.');
    } finally {
      setAiBusy(false);
    }
  }

  const ideas = [...aiIdeas, ...suggest(heard)].filter((x, i, a) => a.indexOf(x) === i).slice(0, 12);

  return (
    <ScreenShell icon="🗣️" title="Modo conversa" subtitle="quem está perto fala, eu respondo">
      <div className="flex shrink-0 flex-col gap-2">
        <GlassCard className="min-h-[5.5em] p-4" style={{ borderColor: listening ? 'var(--success)' : undefined }} aria-live="polite">
          <span className="text-[0.75em] font-bold" style={{ color: 'var(--text-secondary)' }}>
            {listening ? '🎙️ Ouvindo… fale perto do aparelho' : '👂 Ouviu por último:'}
          </span>
          <p className="la-display text-[clamp(20px,3.4vw,1.8em)] font-bold leading-snug">
            {interim || heard || (listening ? '…' : 'Toque em “Começar a ouvir” e fale com a pessoa.')}
          </p>
        </GlassCard>
        {!supported && (
          <p role="alert" className="la-glass p-3 font-semibold" style={{ color: 'var(--warning-text)' }}>
            Este navegador não transforma fala em texto. Use o Chrome ou o Edge. As respostas rápidas abaixo funcionam mesmo assim.
          </p>
        )}
        {error && (
          <p role="alert" className="la-glass p-3 font-semibold" style={{ color: 'var(--danger-text)' }}>
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {listening ? (
            <GlowButton tone="warning" icon="⏸️" label="Parar de ouvir" className="flex-row" onClick={stop} />
          ) : (
            <GlowButton tone="success" icon="🎙️" label="Começar a ouvir" disabled={!supported} className="flex-row" onClick={start} />
          )}
          <GlowButton tone="secondary" icon="🤖" label={aiBusy ? 'Pensando…' : 'Ideias da IA'} disabled={!heard || aiBusy} className="flex-row" onClick={() => void askAi()} />
        </div>
      </div>

      <ScrollArea innerClassName="flex flex-col gap-3 pb-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ideas.map((t, i) => (
            <GlowButton key={t} tone={i < aiIdeas.length ? 'secondary' : /^(Sim|Quero)/.test(t) ? 'success' : /^N[aã]o/.test(t) ? 'danger' : 'primary'} label={t} className="min-h-[3.4em] text-[clamp(14px,1.9vw,1.05em)]" onClick={() => void answer(t)} />
          ))}
          <GlowButton tone="neutral" icon="⌨️" label="Escrever resposta" className="min-h-[3.4em]" onClick={() => go('speak')} />
        </div>
        {log.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="px-1 text-[0.75em] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Conversa
            </h2>
            {log.map((m, i) => (
              <p key={i} className={`la-glass px-3 py-2 text-[0.9em] ${m.who === 'eu' ? 'self-end' : 'self-start'}`} style={{ borderColor: m.who === 'eu' ? 'var(--primary)' : 'var(--secondary)' }}>
                {m.who === 'eu' ? '🙂 ' : '👂 '}
                {m.text}
              </p>
            ))}
          </section>
        )}
      </ScrollArea>
    </ScreenShell>
  );
}
