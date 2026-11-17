import { useMemo, useState } from 'react';
import { GlowButton, SpeechBar, type Tone } from '@lindauria/design-system';
import { applySuggestion, deleteWord, typeChar } from '@lindauria/keyboards';
import { useApp } from '../store/app';
import { predictor, speakText } from '../runtime/engine';
import { saveTextAsPhrase } from '../runtime/phrases';
import { ScreenShell } from '../components/common';
import { ScrollArea } from '../components/ScrollArea';

interface Group {
  id: string;
  icon: string;
  label: string;
  tone: Tone;
  words: string[];
}

/**
 * Montar frase: em vez de letra por letra, a pessoa escolhe PALAVRAS inteiras com a cabeça.
 * Bem menos movimentos. As "próximas palavras" vêm da previsão (que aprende com o uso).
 */
const GROUPS: Group[] = [
  { id: 'pessoas', icon: '👤', label: 'Pessoas', tone: 'accent', words: ['eu', 'você', 'nós', 'ele', 'ela', 'mãe', 'pai', 'filho', 'filha', 'neto', 'neta', 'irmão', 'irmã', 'médico', 'enfermeira', 'cuidadora', 'amigo', 'família'] },
  { id: 'acoes', icon: '🏃', label: 'Ações', tone: 'primary', words: ['quero', 'não quero', 'preciso', 'estou', 'gosto', 'vou', 'pode', 'me ajuda', 'chama', 'liga', 'desliga', 'traz', 'dormir', 'comer', 'beber', 'ver', 'ouvir', 'falar', 'sair', 'virar', 'levantar', 'descansar'] },
  { id: 'coisas', icon: '📦', label: 'Coisas', tone: 'warning', words: ['água', 'comida', 'remédio', 'café', 'suco', 'leite', 'sopa', 'travesseiro', 'cobertor', 'televisão', 'celular', 'óculos', 'luz', 'ventilador', 'banho', 'cadeira', 'música', 'fralda'] },
  { id: 'sentir', icon: '💭', label: 'Sentir', tone: 'secondary', words: ['bem', 'mal', 'dor', 'frio', 'calor', 'fome', 'sede', 'sono', 'cansado', 'cansada', 'feliz', 'triste', 'medo', 'saudade', 'coceira', 'enjoo', 'falta de ar'] },
  { id: 'onde', icon: '📍', label: 'Onde/Quando', tone: 'success', words: ['aqui', 'agora', 'depois', 'hoje', 'amanhã', 'cedo', 'tarde', 'de noite', 'na cama', 'no banheiro', 'na sala', 'no quarto', 'lá fora', 'na cabeça', 'nas costas', 'na perna', 'no braço', 'na barriga'] },
  { id: 'ligar', icon: '🔗', label: 'Ligações', tone: 'neutral', words: ['e', 'com', 'de', 'para', 'um', 'uma', 'o', 'a', 'mais', 'menos', 'muito', 'pouco', 'também', 'não', 'sim', 'por favor', 'obrigado', 'obrigada'] },
];

export function Compose() {
  const text = useApp((s) => s.text);
  const setText = useApp((s) => s.setText);
  const [group, setGroup] = useState(GROUPS[0].id);
  const [toast, setToast] = useState<string | null>(null);
  const current = GROUPS.find((g) => g.id === group)!;

  // próximas palavras prováveis, depois do que já foi montado
  const next = useMemo(() => {
    const base = text && !/\s$/.test(text) ? `${text} ` : text;
    return predictor.predict({ text: base, max: 5 }).map((s) => s.text);
  }, [text]);

  const addWord = (w: string) =>
    setText((t) => applySuggestion(t && !/\s$/.test(t) ? `${t} ` : t, { text: w, kind: 'next' }));

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <ScreenShell icon="🧱" title="Montar frase" subtitle="escolha palavras inteiras">
      <SpeechBar
        text={text}
        placeholder="Escolha palavras para montar a frase."
        actions={
          <>
            <GlowButton tone="success" icon="🔊" label="Falar" className="w-[4.8em] text-[0.8em]" disabled={!text.trim()} onClick={() => void speakText(text)} />
            <GlowButton
              tone="accent"
              icon="⭐"
              label="Salvar"
              className="w-[4.8em] text-[0.8em]"
              disabled={!text.trim()}
              onClick={async () => {
                if (await saveTextAsPhrase(text)) flash('Salvo em ⭐ Minhas frases');
              }}
            />
          </>
        }
      />

      {/* próximas palavras + edição */}
      <div className="grid shrink-0 grid-cols-4 gap-2 sm:grid-cols-8 sm:gap-3">
        {next.slice(0, 5).map((w) => (
          <GlowButton key={w} tone="secondary" label={w} hint="próxima" className="truncate text-[clamp(14px,1.8vw,0.95em)]" onClick={() => addWord(w)} />
        ))}
        <GlowButton tone="neutral" label="?" aria-label="Interrogação" className="text-[1.1em]" onClick={() => setText((t) => typeChar(t, '?'))} />
        <GlowButton tone="warning" icon="⌫" label="Palavra" className="text-[0.75em]" disabled={!text} onClick={() => setText(deleteWord)} />
        <GlowButton tone="warning" icon="🧹" label="Limpar" className="text-[0.75em]" disabled={!text} onClick={() => setText('')} />
      </div>

      {/* grupos de palavras */}
      <nav className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3" aria-label="Grupos de palavras">
        {GROUPS.map((g) => (
          <GlowButton key={g.id} tone={g.tone} aria-pressed={group === g.id} icon={g.icon} label={g.label} className="text-[0.75em]" onClick={() => setGroup(g.id)} />
        ))}
      </nav>

      <ScrollArea innerClassName="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
        {current.words.map((w) => (
          <GlowButton key={w} tone={current.tone} label={w} className="min-h-[2.8em] text-[clamp(15px,2vw,1.15em)]" onClick={() => addWord(w)} />
        ))}
      </ScrollArea>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center" role="status">
          <span className="la-glass px-5 py-2 font-bold">{toast}</span>
        </div>
      )}
    </ScreenShell>
  );
}
