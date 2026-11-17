import { create } from 'zustand';
import { DEFAULT_SETTINGS, sanitizeSettings, secureGet, secureSet, type Settings } from '@lindauria/shared';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const scheduleSave = (s: Settings) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void secureSet('settings', s), 400);
};

/** Configurações do paciente, salvas criptografadas no aparelho. */
export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const raw = await secureGet<Partial<Settings>>('settings');
    set({ settings: sanitizeSettings(raw), loaded: true });
  },
  update: (patch) => {
    const next = sanitizeSettings({ ...get().settings, ...patch });
    set({ settings: next });
    scheduleSave(next);
  },
}));

export const getSettings = () => useSettings.getState().settings;
