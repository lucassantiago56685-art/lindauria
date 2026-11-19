import { EmergencyPulse, GlowButton, SpeechBar, type Tone } from '@lindauria/design-system';
import { useApp, type Screen, type SoonInfo } from '../store/app';
import { useSettings } from '../store/settings';
import { callCaregiver, emergency, say, speakText } from '../runtime/engine';
import { useCare } from '../runtime/care';
import { nextOccurrence, routineFor } from '../runtime/care-logic';
import { ScreenShell } from '../components/common';
import { ScrollArea } from '../components/ScrollArea';

interface Card {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  tone: Tone;
  screen?: Screen;
  soon?: SoonInfo;
}

/* Organização do Início (do mais usado para o menos usado):
   1. FALAR            → o essencial, cartões grandes
   2. ASSISTENTE E ATIVIDADES → IA, câmera, desenho
   3. MEU CUIDADO      → como estou, lembretes, relatórios, família
   4. AJUDA            → emergência (grande) e ajuste da seta
   5. EM BREVE         → próximas fases, pequenos                                      */

const FALAR: Card[] = [
  { id: 'speak', icon: '⌨️', label: 'Escrever', hint: 'letra por letra', tone: 'primary', screen: 'speak' },
  { id: 'compose', icon: '🧱', label: 'Montar frase', hint: 'palavra por palavra', tone: 'secondary', screen: 'compose' },
  { id: 'phrases', icon: '💬', label: 'Frases prontas', hint: 'e minhas frases', tone: 'accent', screen: 'phrases' },
  { id: 'yesno', icon: '👍', label: 'Sim / Não', tone: 'success', screen: 'yesno' },
];

const ATIVIDADES: Card[] = [
  { id: 'chat', icon: '🤖', label: 'Chat IA', hint: 'tirar dúvidas', tone: 'secondary', screen: 'chat' },
  { id: 'camera', icon: '📷', label: 'Câmera IA', hint: 'foto + pergunta', tone: 'secondary', screen: 'camera' },
  { id: 'conversation', icon: '🗣️', label: 'Conversa', hint: 'ouve e sugere respostas', tone: 'success', screen: 'conversation' },
  { id: 'voicebank', icon: '🎙️', label: 'Banco de voz', hint: 'grave a sua voz', tone: 'accent', screen: 'voicebank' },
  { id: 'draw', icon: '✏️', label: 'Desenhar', hint: 'escrever à mão', tone: 'accent', screen: 'draw' },
];

const CUIDADO: Card[] = [
  { id: 'feelings', icon: '💭', label: 'Como estou', hint: 'registrar', tone: 'warning', screen: 'feelings' },
  { id: 'painmap', icon: '🗺️', label: 'Mapa de dor', hint: 'onde dói', tone: 'danger', screen: 'painmap' },
  { id: 'reminders', icon: '⏰', label: 'Lembretes', hint: 'remédio, comida…', tone: 'warning', screen: 'reminders' },
  { id: 'reports', icon: '📄', label: 'Relatórios', hint: 'PDF dia/semana/mês', tone: 'primary', screen: 'reports' },
  { id: 'family', icon: '👨‍👩‍👧', label: 'Família', hint: 'quem é avisado', tone: 'accent', screen: 'family' },
  { id: 'privacy', icon: '🔒', label: 'Privacidade', hint: 'cópia e dados', tone: 'neutral', screen: 'privacy' },
];

const SOON: Card[] = [
  { id: 'boards', icon: '🧩', label: 'Pranchas', tone: 'accent', soon: { title: 'Pranchas', icon: '🧩', phase: 3, description: 'Pictogramas por categoria e pranchas com fotos reais da casa e da família.' } },
  { id: 'home', icon: '💡', label: 'Casa', tone: 'warning', soon: { title: 'Casa', icon: '💡', phase: 4, description: 'Luz, TV, ventilador e cama elétrica controlados pela cabeça.' } },
  { id: 'fun', icon: '🎵', label: 'Lazer', tone: 'primary', soon: { title: 'Lazer', icon: '🎵', phase: 4, description: 'Músicas, rádio, vídeos, livros e jogos controlados pela cabeça.' } },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[0.75em] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Hub() {
  const st = useSettings((x) => x.settings);
  const emergencyHint =
    st.emergencyGesture === 'off' ? 'ou F9' : `ou ${st.emergencyCount} ${st.emergencyGesture === 'longBlink3' ? 'piscadas longas' : 'sobrancelhas'} · F9`;
  const go = useApp((s) => s.go);
  const text = useApp((s) => s.text);
  const name = useApp((s) => s.account?.name.split(' ')[0]);
  const reminders = useCare((s) => s.reminders);

  const now = new Date();
  const next = reminders
    .filter((r) => r.active)
    .map((r) => ({ r, at: nextOccurrence(r, now) }))
    .filter((x): x is { r: (typeof reminders)[number]; at: Date } => !!x.at)
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  const routine = routineFor(now.getHours());

  const tile = (c: Card, cls: string) => (
    <GlowButton key={c.id} tone={c.tone} icon={c.icon} label={c.label} hint={c.hint} className={cls} onClick={() => (c.screen ? go(c.screen) : go('soon', c.soon))} />
  );

  return (
    <ScreenShell home={false} settings>
      <SpeechBar
        text={text}
        placeholder={name ? `Olá, ${name}! O que você quer fazer?` : 'Olá! O que você quer fazer?'}
        actions={
          text ? (
            <>
              <GlowButton tone="success" icon="🔊" label="Falar" className="w-[5em] text-[0.8em]" onClick={() => void speakText(text)} />
              <GlowButton tone="warning" icon="🧹" label="Limpar" className="w-[5em] text-[0.8em]" onClick={() => useApp.setState({ text: '' })} />
            </>
          ) : undefined
        }
      />

      <ScrollArea innerClassName="flex flex-col gap-4 pb-3">
        <Section title="💬 Falar">
          <div className="flex flex-col gap-1.5" aria-label={`Frases para agora (${routine.label})`}>
            <span className="px-1 text-[0.7em] font-bold" style={{ color: 'var(--text-secondary)' }}>
              {routine.icon} Para agora ({routine.label.toLowerCase()}) — toque para falar
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {routine.phrases.map((p) => (
                <GlowButton key={p} tone="neutral" label={p} className="min-h-[3em] px-1 text-[clamp(13px,1.6vw,0.9em)]" onClick={() => void say(p)} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{FALAR.map((c) => tile(c, 'min-h-[7.5em] px-1 text-[clamp(16px,2.4vw,1.4em)]'))}</div>
        </Section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_4fr]">
          <Section title="✨ Assistente e atividades">
            <div className="grid grid-cols-3 gap-3">{ATIVIDADES.map((c) => tile(c, 'min-h-[5.6em] px-1 text-[clamp(14px,1.8vw,1.05em)]'))}</div>
          </Section>
          <Section title="💜 Meu cuidado">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{CUIDADO.map((c) => tile(c, 'min-h-[5.6em] px-1 text-[clamp(14px,1.8vw,1.05em)]'))}</div>
          </Section>
        </div>

        {next && (
          <button
            type="button"
            data-dwell=""
            onClick={() => go('reminders')}
            className="la-glass flex items-center gap-3 px-4 py-2 text-left text-[0.9em]"
            style={{ borderColor: 'var(--warning)' }}
          >
            <span aria-hidden="true">⏰</span>
            <span>
              Próximo lembrete: <strong>{next.r.title}</strong> —{' '}
              {next.at.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </button>
        )}

        <Section title="🆘 Ajuda">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <EmergencyPulse className="col-span-2 min-h-[4.6em] flex-row gap-3 px-2 text-[clamp(16px,2.2vw,1.3em)]" hint={emergencyHint} onClick={() => emergency.trigger('button')} />
            <GlowButton tone="warning" icon="🛎️" label="Chamar cuidador" hint="campainha, sem alarme" className="col-span-2 min-h-[4.6em] px-1 text-[clamp(14px,1.8vw,1em)] sm:col-span-1" onClick={callCaregiver} />
            <GlowButton tone="primary" icon="🎯" label="Ajustar seta" hint="calibrar" className="min-h-[4.6em] px-1 text-[clamp(14px,1.8vw,1em)]" onClick={() => go('calibration')} />
            <GlowButton tone="secondary" icon="😴" label="Descansar" hint="não clica nada" className="min-h-[4.6em] px-1 text-[clamp(14px,1.8vw,1em)]" onClick={() => useApp.setState({ resting: true })} />
          </div>
        </Section>

        <Section title="🚧 Em breve">
          <div className="grid grid-cols-3 gap-3">{SOON.map((c) => tile(c, 'la-btn--soon min-h-[3.6em] px-1 text-[clamp(13px,1.5vw,0.9em)]'))}</div>
        </Section>
      </ScrollArea>
    </ScreenShell>
  );
}
