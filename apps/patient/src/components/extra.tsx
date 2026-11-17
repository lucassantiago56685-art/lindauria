import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { useApp, type Screen } from '../store/app';
import { emergency } from '../runtime/engine';
import { markDone, snooze, useCare } from '../runtime/care';
import { REMINDER_KINDS } from '../runtime/care-logic';

// ---------------------------------------------------------------------------------------------
/** Lembrete tocando: tela grande com "Feito" e "Daqui 10 minutos". */
export function ReminderOverlay() {
  const ringing = useCare((s) => s.ringing);
  if (!ringing) return null;
  const k = REMINDER_KINDS.find((x) => x.id === ringing.reminder.kind)!;
  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Lembrete: ${ringing.reminder.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[950] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--bg-deep) 92%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <GlassCard className="flex w-full max-w-2xl flex-col gap-5 p-6 text-center" style={{ borderColor: 'var(--warning)' }}>
        <motion.div className="text-[4em]" animate={{ rotate: [0, -12, 12, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} aria-hidden="true">
          {k.icon}
        </motion.div>
        <p className="text-[1em] font-bold uppercase tracking-wider" style={{ color: 'var(--warning-text)' }}>
          ⏰ Hora de: {k.label} · {ringing.time}
        </p>
        <h2 className="la-display text-[clamp(24px,5vw,2em)] font-bold">{ringing.reminder.title}</h2>
        {ringing.reminder.note && <p style={{ color: 'var(--text-secondary)' }}>📝 {ringing.reminder.note}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <GlowButton tone="success" icon="✔" label="Feito" className="min-h-[4em] text-[1.3em]" onClick={() => markDone(ringing)} />
          <GlowButton tone="warning" icon="⏳" label="Daqui 10 minutos" className="min-h-[4em] text-[1.1em]" onClick={() => snooze(ringing)} />
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
const SHORTCUTS: Array<{ keys: string; what: string }> = [
  { keys: 'Tab / Shift+Tab', what: 'andar entre os botões' },
  { keys: 'Enter ou Espaço', what: 'apertar o botão em destaque' },
  { keys: 'F9  ou  Ctrl+Shift+E', what: '🆘 EMERGÊNCIA (em qualquer tela)' },
  { keys: 'Esc', what: 'voltar ao Início' },
  { keys: 'Alt+1', what: 'Escrever (teclado)' },
  { keys: 'Alt+2', what: 'Frases prontas' },
  { keys: 'Alt+3', what: 'Sim / Não' },
  { keys: 'Alt+4', what: 'Chat com IA' },
  { keys: 'Alt+5', what: 'Lembretes' },
  { keys: 'Alt+D', what: 'Descansar' },
  { keys: 'Ctrl + / Ctrl −', what: 'aumentar / diminuir o tamanho de tudo' },
  { keys: 'F1  ou  ?', what: 'mostrar esta ajuda' },
];

const ALT_SCREENS: Record<string, Screen> = { '1': 'speak', '2': 'phrases', '3': 'yesno', '4': 'chat', '5': 'reminders' };

/**
 * Acessibilidade no computador: atalhos de teclado globais (inclusive para "chave externa":
 * qualquer acionador que simule uma tecla funciona).
 */
export function KeyboardShortcuts() {
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
      const st = useApp.getState();
      if (e.key === 'F9' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e')) {
        e.preventDefault();
        emergency.trigger('switch');
        return;
      }
      if (typing) return;
      if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        if (help) return setHelp(false);
        if (!st.emergency && !['landing', 'login', 'signup', 'splash', 'familyView'].includes(st.screen)) st.go('hub');
        return;
      }
      if (e.altKey && !e.ctrlKey) {
        if (ALT_SCREENS[e.key] && st.session) {
          e.preventDefault();
          st.go(ALT_SCREENS[e.key]);
        } else if (e.key.toLowerCase() === 'd' && st.session) {
          e.preventDefault();
          useApp.setState({ resting: !st.resting });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [help]);

  if (!help) return null;
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos do teclado"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--bg-deep) 92%, transparent)' }}
      onClick={() => setHelp(false)}
    >
      <GlassCard className="flex w-full max-w-xl flex-col gap-3 p-6">
        <h2 className="text-[1.4em] font-bold">⌨️ Atalhos do teclado</h2>
        <table className="w-full text-[0.9em]">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td className="py-1 pr-4 font-bold" style={{ color: 'var(--primary-text)' }}>
                  <kbd>{s.keys}</kbd>
                </td>
                <td className="py-1">{s.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <GlowButton tone="neutral" label="Fechar (Esc)" onClick={() => setHelp(false)} />
      </GlassCard>
    </motion.div>
  );
}
