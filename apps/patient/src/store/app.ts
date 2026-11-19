import { create } from 'zustand';
import type { EmergencyEvent } from '@lindauria/safety';
import type { TrackerError } from '@lindauria/input-engine';
import type { Account, Session } from '@lindauria/shared';

export type Screen =
  | 'landing'
  | 'login'
  | 'signup'
  | 'splash'
  | 'calibration'
  | 'hub'
  | 'speak'
  | 'yesno'
  | 'phrases'
  | 'compose'
  | 'family'
  | 'familyView'
  | 'chat'
  | 'camera'
  | 'draw'
  | 'feelings'
  | 'reminders'
  | 'reports'
  | 'settings'
  | 'privacy'
  | 'painmap'
  | 'voicebank'
  | 'conversation'
  | 'soon';

/** Funções das próximas fases: aparecem no Hub, mas explicam honestamente quando chegam. */
export interface SoonInfo {
  title: string;
  icon: string;
  phase: number;
  description: string;
}

export interface TrackingState {
  status: 'off' | 'starting' | 'on' | 'error';
  mode: 'head' | 'pointer' | null;
  detected: boolean;
  fps: number;
  error: TrackerError | null;
}

interface AppState {
  screen: Screen;
  soon: SoonInfo | null;
  /** conta conectada (null = sem conta / convidado) */
  account: Account | null;
  session: Session | null;
  /** texto que será falado (compartilhado entre Hub e teclado) */
  text: string;
  resting: boolean;
  emergency: EmergencyEvent | null;
  /** quantos gestos de emergência já foram contados (1 de 3, 2 de 3) */
  emergencyHits: number;
  tracking: TrackingState;
  lastGesture: { name: string; at: number } | null;
  go: (screen: Screen, soon?: SoonInfo) => void;
  setText: (text: string | ((prev: string) => string)) => void;
}

export const useApp = create<AppState>((set) => ({
  screen: 'landing',
  soon: null,
  account: null,
  session: null,
  text: '',
  resting: false,
  emergency: null,
  emergencyHits: 0,
  tracking: { status: 'off', mode: null, detected: false, fps: 0, error: null },
  lastGesture: null,
  go: (screen, soon) => set({ screen, soon: soon ?? null }),
  setText: (text) => set((s) => ({ text: typeof text === 'function' ? text(s.text) : text })),
}));
