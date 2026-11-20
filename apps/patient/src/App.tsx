import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AuroraBackground, OrbCursor } from "@lindauria/design-system";
import { useApp } from "./store/app";
import { useSettings } from "./store/settings";
import { subscribeCursor } from "./runtime/engine";
import { useTelegram } from "./runtime/telegram";
import {
  EmergencyHitsToast,
  EmergencyOverlay,
  OfflineBanner,
  RestOverlay,
} from "./components/common";
import { Splash } from "./screens/Splash";
import { Calibration } from "./screens/Calibration";
import { Hub } from "./screens/Hub";
import { Speak } from "./screens/Speak";
import { YesNo } from "./screens/YesNo";
import { Settings } from "./screens/Settings";
import { ComingSoon } from "./screens/ComingSoon";
import { Landing } from "./screens/Landing";
import { AuthScreen } from "./screens/Auth";
import { Phrases } from "./screens/Phrases";
import { Compose } from "./screens/Compose";
import { Family } from "./screens/Family";
import { FamilyWatch } from "./screens/FamilyWatch";
import { Chat } from "./screens/Chat";
import { CameraAI } from "./screens/CameraAI";
import { Draw } from "./screens/Draw";
import { Feelings } from "./screens/Feelings";
import { Reminders } from "./screens/Reminders";
import { Reports } from "./screens/Reports";
import { Privacy } from "./screens/Privacy";
import { PainMap } from "./screens/PainMap";
import { VoiceBank } from "./screens/VoiceBank";
import { Conversation } from "./screens/Conversation";
import { KeyboardShortcuts, ReminderOverlay } from "./components/extra";

const Login = () => <AuthScreen mode="login" />;
const Signup = () => <AuthScreen mode="signup" />;

const SCREENS = {
  landing: Landing,
  login: Login,
  signup: Signup,
  phrases: Phrases,
  compose: Compose,
  family: Family,
  familyView: FamilyWatch,
  chat: Chat,
  camera: CameraAI,
  draw: Draw,
  feelings: Feelings,
  reminders: Reminders,
  reports: Reports,
  splash: Splash,
  calibration: Calibration,
  hub: Hub,
  speak: Speak,
  yesno: YesNo,
  settings: Settings,
  privacy: Privacy,
  painmap: PainMap,
  voicebank: VoiceBank,
  conversation: Conversation,
  soon: ComingSoon,
} as const;

export function App() {
  const screen = useApp((s) => s.screen);
  const resting = useApp((s) => s.resting);
  const emergency = useApp((s) => s.emergency);
  const calm = useSettings((s) => s.settings.calmMode);
  // no modo Mouse/toque a bolinha só aparece se o cuidador ligou o clique automático (rastreador ocular)
  const cursorStyle = useSettings((s) => (s.settings.inputMode === 'pointer' && !s.settings.pointerDwell ? 'none' : s.settings.cursorStyle));
  const Current = SCREENS[screen];

  return (
    <MotionConfig reducedMotion={calm ? "always" : "user"}>
      <AuroraBackground />
      {/* atalho para leitores de tela / teclado */}
      <a href="#conteudo" className="la-sr-only focus:not-sr-only">
        Pular para o conteúdo
      </a>
      <main id="conteudo" className="relative h-dvh w-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            className="h-full"
            initial={{ opacity: 0, y: 14, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <Current />
          </motion.div>
        </AnimatePresence>
      </main>
      {resting && !emergency && <RestOverlay />}
      {emergency && <EmergencyOverlay />}
      <EmergencyHitsToast />
      <OfflineBanner />
      <TelegramSetupNotice />
      {cursorStyle !== "none" && (
        <OrbCursor subscribe={subscribeCursor} variant={cursorStyle} />
      )}
      <ReminderOverlay />
      <KeyboardShortcuts />
    </MotionConfig>
  );
}

/** resultado do link de configuração do Telegram (#telegram=...) */
function TelegramSetupNotice() {
  const r = useTelegram((s) => s.setupResult);
  const go = useApp((s) => s.go);
  const hasSession = useApp((s) => !!s.session);
  if (!r) return null;
  const close = () => useTelegram.setState({ setupResult: null });
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Configuração do Telegram"
      className="fixed inset-0 z-[1500] flex items-center justify-center p-4"
      style={{
        background: "color-mix(in srgb, var(--bg-deep) 92%, transparent)",
      }}
    >
      <div
        className="la-glass flex w-full max-w-md flex-col gap-4 p-5 text-center"
        style={{ borderColor: r.ok ? "var(--success)" : "var(--danger)" }}
      >
        <span className="text-[2.4em]">{r.ok ? "✅" : "⚠️"}</span>
        <p
          className="text-[1.1em] font-bold"
          style={{ color: r.ok ? "var(--success-text)" : "var(--danger-text)" }}
        >
          {r.text}
        </p>
        <div className="grid grid-cols-1 gap-2">
          {r.ok && hasSession && (
            <button
              type="button"
              className="la-btn la-btn--primary min-h-[3em] font-bold"
              onClick={() => {
                close();
                go("family");
              }}
            >
              👨‍👩‍👧 Ir para Família
            </button>
          )}
          <button
            type="button"
            className="la-btn min-h-[3em] font-bold"
            onClick={close}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
