import { motion } from 'framer-motion';
import { GlassCard, GlowButton, LogoMark, Wordmark } from '@lindauria/design-system';
import { useApp } from '../store/app';
import { auth } from '../runtime/engine';
import { ScrollArea } from '../components/ScrollArea';

const FEATURES = [
  { icon: '🙂', title: 'Controle pela cabeça', text: 'Uma câmera comum vira mouse: mexa a cabeça e pare sobre o botão para escolher.' },
  { icon: '⌨️', title: 'Teclado inteligente', text: 'Sugere palavras e aprende os nomes e o jeito de falar de cada pessoa.' },
  { icon: '🔊', title: 'Fala em voz alta', text: 'O que você escreve é falado na hora, em português do Brasil.' },
  { icon: '🆘', title: 'Emergência por gesto', text: 'Três piscadas longas tocam um alarme forte e avisam a família no celular, na hora.' },
  { icon: '🔒', title: 'Privacidade', text: 'O vídeo da câmera é processado só no aparelho. Família só recebe o que o paciente autorizar.' },
  { icon: '💚', title: 'Gratuito', text: 'Para pacientes e famílias. Funciona em notebook, tablet e celular.' },
];

const AUDIENCE = [
  { icon: '🧑‍🦽', title: 'Pacientes', text: 'ELA, AVC, lesão medular alta, distrofias e outras condições que tiram os movimentos.' },
  { icon: '🤝', title: 'Cuidadores e família', text: 'Configuram tudo rápido e ficam tranquilos com o botão de emergência.' },
  { icon: '🩺', title: 'Profissionais de saúde', text: 'Fonoaudiólogos e terapeutas acompanham a comunicação do paciente.' },
];

const SOON = ['Chat com IA especializada em ELA', 'Câmera inteligente: fotografe e pergunte', 'Pranchas com pictogramas e mapa de dor'];

/** Página de apresentação: o que é o LindaurIA, e entrada para cadastro e login. */
export function Landing() {
  const go = useApp((s) => s.go);

  async function guest() {
    await auth.continueAsGuest();
    useApp.setState({ session: { kind: 'guest' }, account: null });
    go('splash');
  }

  return (
    <div className="relative z-10 flex h-full flex-col gap-3 p-3 sm:p-4">
      <header className="flex shrink-0 items-center gap-3">
        <LogoMark size={44} />
        <Wordmark className="flex-1 text-[1.4em]" />
        <GlowButton tone="neutral" label="Entrar" className="la-btn--bar" onClick={() => go('login')} />
      </header>

      <ScrollArea innerClassName="mx-auto flex max-w-5xl flex-col gap-8 pb-8">
        {/* destaque */}
        <section className="flex flex-col items-center gap-5 pt-6 text-center">
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
            <LogoMark size={110} animated />
          </motion.div>
          <h1 className="la-display text-[clamp(28px,5vw,2.6em)] font-bold leading-tight">
            Sua voz de volta,
            <br />
            <span className="la-gradient-text">só com o movimento da cabeça.</span>
          </h1>
          <p className="max-w-3xl text-[1.05em]" style={{ color: 'var(--text-secondary)' }}>
            A doença tira os movimentos. A LindaurIA devolve a voz, a autonomia e a conexão.
          </p>
          <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <GlowButton tone="primary" icon="✨" label="Criar conta grátis" className="min-h-[3.6em] text-[1.1em]" onClick={() => go('signup')} />
            <GlowButton tone="neutral" icon="🔑" label="Já tenho conta" className="min-h-[3.6em] text-[1.1em]" onClick={() => go('login')} />
          </div>
          <GlowButton
            tone="accent"
            icon="👨‍👩‍👧"
            label="Sou familiar: acompanhar com código"
            hint="receba alertas e fotos de emergência"
            className="la-btn--menu w-full max-w-2xl text-[1em]"
            onClick={() => go('familyView')}
          />
          <button type="button" className="text-[0.9em] font-semibold underline" style={{ color: 'var(--primary-text)' }} onClick={() => void guest()}>
            Usar sem conta, só neste aparelho
          </button>
        </section>

        {/* recursos */}
        <section className="flex flex-col gap-4">
          <h2 className="text-center text-[1.4em] font-bold">O que o LindaurIA faz</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <GlassCard key={f.title} className="flex flex-col gap-2 p-5">
                <div className="text-[2em]" aria-hidden="true">
                  {f.icon}
                </div>
                <h3 className="text-[1.1em] font-bold" style={{ color: 'var(--primary-text)' }}>
                  {f.title}
                </h3>
                <p className="text-[0.9em]" style={{ color: 'var(--text-secondary)' }}>
                  {f.text}
                </p>
              </GlassCard>
            ))}
          </div>
        </section>

        {/* para quem */}
        <section className="flex flex-col gap-4">
          <h2 className="text-center text-[1.4em] font-bold">Para quem é</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {AUDIENCE.map((a) => (
              <GlassCard key={a.title} className="flex gap-4 p-5">
                <div className="text-[2em]" aria-hidden="true">
                  {a.icon}
                </div>
                <div>
                  <h3 className="font-bold" style={{ color: 'var(--accent-text)' }}>
                    {a.title}
                  </h3>
                  <p className="text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
                    {a.text}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>

        {/* em breve */}
        <GlassCard className="flex flex-col gap-3 p-5">
          <h2 className="text-[1.2em] font-bold" style={{ color: 'var(--secondary-text)' }}>
            🚧 Chegando nas próximas versões
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SOON.map((s) => (
              <li key={s} className="text-[0.9em]" style={{ color: 'var(--text-secondary)' }}>
                • {s}
              </li>
            ))}
          </ul>
        </GlassCard>

        <footer className="flex flex-col items-center gap-2 text-center text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
          <p>O nome LindaurIA é uma homenagem à Lindaura, avó do criador, que inspirou o projeto. 💜</p>
          <p>O LindaurIA não substitui médico, equipe de saúde nem monitores de sinais vitais. Em emergência: SAMU 192.</p>
        </footer>
      </ScrollArea>
    </div>
  );
}
