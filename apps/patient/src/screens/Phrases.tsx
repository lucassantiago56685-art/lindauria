import { useEffect, useState } from 'react';
import { GlowButton, type Tone } from '@lindauria/design-system';
import { useApp } from '../store/app';
import { ScreenShell } from '../components/common';
import { ScrollArea } from '../components/ScrollArea';
import { PhraseEditor } from '../components/PhraseEditor';
import { playPhrase, useMyPhrases, type CustomPhrase } from '../runtime/phrases';

interface Category {
  id: string;
  icon: string;
  label: string;
  tone: Tone;
  phrases: Array<{ icon: string; text: string }>;
}

/** Frases prontas: falar com UMA escolha, sem digitar. */
const CATEGORIES: Category[] = [
  {
    id: 'necessidades',
    icon: '🙋',
    label: 'Preciso',
    tone: 'primary',
    phrases: [
      { icon: '💧', text: 'Estou com sede.' },
      { icon: '🍽️', text: 'Estou com fome.' },
      { icon: '🚻', text: 'Preciso ir ao banheiro.' },
      { icon: '💨', text: 'Preciso de aspiração.' },
      { icon: '🛏️', text: 'Quero mudar de posição.' },
      { icon: '⬆️', text: 'Levanta a cabeceira, por favor.' },
      { icon: '😴', text: 'Quero dormir.' },
      { icon: '🧻', text: 'Pode limpar meu rosto, por favor?' },
      { icon: '🙏', text: 'Venha aqui, por favor.' },
    ],
  },
  {
    id: 'conforto',
    icon: '🌡️',
    label: 'Conforto',
    tone: 'warning',
    phrases: [
      { icon: '🥶', text: 'Estou com frio.' },
      { icon: '🥵', text: 'Estou com calor.' },
      { icon: '🤚', text: 'Estou com coceira.' },
      { icon: '🛋️', text: 'Arruma meu travesseiro, por favor.' },
      { icon: '💡', text: 'Apaga a luz, por favor.' },
      { icon: '🔆', text: 'Acende a luz, por favor.' },
      { icon: '📺', text: 'Liga a televisão, por favor.' },
      { icon: '🔇', text: 'Abaixa o volume, por favor.' },
      { icon: '🪟', text: 'Abre a janela, por favor.' },
    ],
  },
  {
    id: 'saude',
    icon: '🩺',
    label: 'Saúde',
    tone: 'danger',
    phrases: [
      { icon: '⚡', text: 'Estou com dor.' },
      { icon: '🤕', text: 'Estou com dor de cabeça.' },
      { icon: '🫁', text: 'Estou com um pouco de falta de ar.' },
      { icon: '🤢', text: 'Estou enjoado.' },
      { icon: '😵', text: 'Estou tonto.' },
      { icon: '💊', text: 'Está na hora do remédio?' },
      { icon: '🩹', text: 'Está machucando aqui.' },
      { icon: '😮‍💨', text: 'Estou cansado. Preciso descansar.' },
      { icon: '📞', text: 'Liga para o médico, por favor.' },
    ],
  },
  {
    id: 'sentimentos',
    icon: '💭',
    label: 'Sentimentos',
    tone: 'secondary',
    phrases: [
      { icon: '😊', text: 'Estou bem.' },
      { icon: '😄', text: 'Estou feliz.' },
      { icon: '😢', text: 'Estou triste.' },
      { icon: '😟', text: 'Estou preocupado.' },
      { icon: '😨', text: 'Estou com medo.' },
      { icon: '😤', text: 'Estou irritado.' },
      { icon: '🥺', text: 'Estou com saudade.' },
      { icon: '🫂', text: 'Preciso de um abraço.' },
      { icon: '🤫', text: 'Quero ficar um pouco quieto.' },
    ],
  },
  {
    id: 'familia',
    icon: '💜',
    label: 'Família',
    tone: 'accent',
    phrases: [
      { icon: '❤️', text: 'Eu te amo.' },
      { icon: '🙏', text: 'Obrigado por cuidar de mim.' },
      { icon: '😘', text: 'Me dá um beijo.' },
      { icon: '👋', text: 'Que bom que você veio.' },
      { icon: '📱', text: 'Liga para a minha família, por favor.' },
      { icon: '🖼️', text: 'Quero ver as fotos.' },
      { icon: '🧒', text: 'Quero ver meus netos.' },
      { icon: '🙂', text: 'Como foi o seu dia?' },
      { icon: '🎂', text: 'Parabéns! Feliz aniversário!' },
    ],
  },
  {
    id: 'conversa',
    icon: '💬',
    label: 'Conversa',
    tone: 'success',
    phrases: [
      { icon: '☀️', text: 'Bom dia!' },
      { icon: '🌤️', text: 'Boa tarde!' },
      { icon: '🌙', text: 'Boa noite!' },
      { icon: '🤔', text: 'Pode repetir, por favor?' },
      { icon: '⏳', text: 'Espera, estou escrevendo.' },
      { icon: '👍', text: 'Entendi.' },
      { icon: '😂', text: 'Que engraçado!' },
      { icon: '🙌', text: 'Concordo.' },
      { icon: '🙅', text: 'Não concordo.' },
    ],
  },
];

const MINE = 'minhas';

export function Phrases() {
  const myPhrases = useMyPhrases((s) => s.list);
  const loadMine = useMyPhrases((s) => s.load);
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const [last, setLast] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<null | { phrase?: CustomPhrase }>(null);
  const setText = useApp((s) => s.setText);
  const current = CATEGORIES.find((c) => c.id === cat);

  useEffect(() => void loadMine(), [loadMine]);

  const speak = (p: { text: string; audio: string | null }) => {
    setLast(p.text);
    setText(p.text + ' ');
    void playPhrase(p);
  };

  return (
    <ScreenShell icon="💬" title="Frases prontas" subtitle="uma escolha e a frase é falada">
      <nav className="grid shrink-0 grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3" aria-label="Categorias de frases">
        <GlowButton tone="accent" aria-pressed={cat === MINE} icon="⭐" label="Minhas" className="text-[0.8em]" onClick={() => setCat(MINE)} />
        {CATEGORIES.map((c) => (
          <GlowButton
            key={c.id}
            tone={c.tone}
            aria-pressed={cat === c.id}
            icon={c.icon}
            label={c.label}
            className="text-[0.8em]"
            onClick={() => setCat(c.id)}
          />
        ))}
      </nav>
      <p className="shrink-0 text-center text-[0.9em] font-semibold" aria-live="polite" style={{ color: 'var(--text-secondary)' }}>
        {last ? `Falado: “${last}”` : 'Escolha uma frase. Ela será falada em voz alta.'}
      </p>
      {cat === MINE ? (
        <ScrollArea innerClassName="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3">
          <GlowButton tone="primary" icon="➕" label="Nova frase" hint="com voz ou som gravado" className="la-btn--soon min-h-[4.2em] text-[clamp(15px,2vw,1.1em)]" onClick={() => setEditor({})} />
          {myPhrases.length > 0 && (
            <GlowButton
              tone="neutral"
              aria-pressed={editing}
              icon="✏️"
              label={editing ? 'Pronto' : 'Editar frases'}
              hint={editing ? 'toque numa frase para mudar' : undefined}
              className="min-h-[4.2em] text-[clamp(15px,2vw,1.1em)]"
              onClick={() => setEditing((v) => !v)}
            />
          )}
          {myPhrases.map((p) => (
            <GlowButton
              key={p.id}
              tone={editing ? 'neutral' : 'accent'}
              icon={p.icon}
              label={p.text}
              hint={editing ? '✏️ editar' : p.audio ? '🎙️ som gravado' : undefined}
              className="min-h-[4.2em] text-[clamp(15px,2vw,1.1em)]"
              onClick={() => (editing ? setEditor({ phrase: p }) : speak(p))}
            />
          ))}
          {myPhrases.length === 0 && (
            <p className="col-span-full p-4 text-center text-[0.9em]" style={{ color: 'var(--text-secondary)' }}>
              Ainda não há frases suas. Crie uma aqui, ou toque em ⭐ Salvar no teclado ou no Montar frase.
            </p>
          )}
        </ScrollArea>
      ) : (
        current && (
          <ScrollArea innerClassName="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3">
            {current.phrases.map((p) => (
              <GlowButton
                key={p.text}
                tone={current.tone}
                icon={p.icon}
                label={p.text}
                className="min-h-[4.2em] text-[clamp(15px,2vw,1.1em)]"
                onClick={() => speak({ text: p.text, audio: null })}
              />
            ))}
          </ScrollArea>
        )
      )}
      {editor && <PhraseEditor phrase={editor.phrase} onClose={() => setEditor(null)} />}
    </ScreenShell>
  );
}
