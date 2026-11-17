import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { AuroraBackground, OrbCursor } from '@lindauria/design-system';
import { useApp } from './store/app';
import { useSettings } from './store/settings';
import { subscribeCursor } from './runtime/engine';
import { EmergencyHitsToast, EmergencyOverlay, RestOverlay } from './components/common';
import { Splash } from './screens/Splash';
import { Calibration } from './screens/Calibration';
import { Hub } from './screens/Hub';
import { Speak } from './screens/Speak';
import { YesNo } from './screens/YesNo';
import { Settings } from './screens/Settings';
import { ComingSoon } from './screens/ComingSoon';
import { Landing } from './screens/Landing';
import { AuthScreen } from './screens/Auth';
import { Phrases } from './screens/Phrases';
import { Compose } from './screens/Compose';
import { Family } from './screens/Family';
import { FamilyWatch } from './screens/FamilyWatch';
import { Chat } from './screens/Chat';
import { CameraAI } from './screens/CameraAI';
import { Draw } from './screens/Draw';
import { Feelings } from './screens/Feelings';
import { Reminders } from './screens/Reminders';
import { Reports } from './screens/Reports';
import { KeyboardShortcuts, ReminderOverlay } from './components/extra';

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
  soon: ComingSoon,
} as const;

export function App() {
  const screen = useApp((s) => s.screen);
  const resting = useApp((s) => s.resting);
  const emergency = useApp((s) => s.emergency);
  const calm = useSettings((s) => s.settings.calmMode);
  const cursorStyle = useSettings((s) => s.settings.cursorStyle);
  const Current = SCREENS[screen];

  return (
    <MotionConfig reducedMotion={calm ? 'always' : 'user'}>
      <AuroraBackground />
      {/* atalho para leitores de tela / teclado */}
      <a href="#conteudo" className="la-sr-only focus:not-sr-only">Pular para o conteúdo</a>
      <main id="conteudo" className="relative h-dvh w-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            className="h-full"
            initial={{ opacity: 0, y: 14, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <Current />
          </motion.div>
        </AnimatePresence>
      </main>
      {resting && !emergency && <RestOverlay />}
      {emergency && <EmergencyOverlay />}
      <EmergencyHitsToast />
      {cursorStyle !== 'none' && <OrbCursor subscribe={subscribeCursor} variant={cursorStyle} />}
      <ReminderOverlay />
      <KeyboardShortcuts />
    </MotionConfig>
  );
}
