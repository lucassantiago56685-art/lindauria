/**
 * Configurações do paciente. Ficam criptografadas no aparelho (ver secure-store.ts).
 * Valores padrão pensados para quem está começando: dwell longo, alvos grandes, tema escuro.
 */

export type ThemeName = 'dark' | 'light' | 'hc-yellow' | 'hc-white';
export type InputMode = 'head' | 'pointer';
export type SelectGesture = 'none' | 'longBlink' | 'browRaise' | 'mouthOpen';
export type EmergencyGesture = 'longBlink3' | 'browRaise3' | 'off';
export type KeyboardLayoutName = 'qwerty' | 'frequency';

/** Ponto 2D cru (posição do nariz em relação aos olhos, normalizada). */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Resultado da calibração: posição neutra e os extremos confortáveis em cada direção.
 * Como guardamos vetores 2D, a calibração funciona até com a câmera girada (modo deitado).
 */
export interface Calibration {
  center: Vec2;
  right: Vec2;
  left: Vec2;
  up: Vec2;
  down: Vec2;
  /** Limiar de olho fechado aprendido na calibração (0..1). */
  blinkThreshold: number;
  createdAt: number;
  /** de onde vêm os números: pose 3D da cabeça (preciso) ou posição do nariz (antigo) */
  source?: 'pose' | 'nose';
  /**
   * Calibração por pontos (a mais precisa): curva ajustada que leva a direção da cabeça
   * direto ao ponto da tela (0..1). Coeficientes de [1, u, v, u·v, u², v²] com u,v normalizados.
   */
  fit?: { x: number[]; y: number[]; mu: Vec2; sigma: Vec2; errorPct: number };
}

export interface SoundVolumes {
  focus: number;
  click: number;
  sent: number;
  /** Alarme de emergência: nunca abaixo de ALARM_MIN_VOLUME. */
  alarm: number;
}

export interface Settings {
  // --- Controle ---
  inputMode: InputMode;
  dwellMs: number;
  /** Quanto o cursor precisa andar (px) depois de um clique para poder clicar de novo. */
  rearmPx: number;
  sensitivity: number;
  /** 0 = pouco suave (rápido), 1 = muito suave (estável). */
  smoothing: number;
  deadZonePx: number;
  /** velocidade máxima do cursor (pixels por segundo): evita que ele "voe" pela tela */
  maxSpeedPxS: number;
  invertX: boolean;
  invertY: boolean;
  selectGesture: SelectGesture;
  longBlinkMs: number;
  emergencyGesture: EmergencyGesture;
  calibration: Calibration | null;
  showMeshPreview: boolean;
  /** formato do cursor na tela ('none' = sem seta: só o botão mirado acende) */
  cursorStyle: 'orb' | 'arrow' | 'none';
  // --- Aparência ---
  theme: ThemeName;
  fontFamily: 'atkinson' | 'inter';
  fontSizePx: number;
  calmMode: boolean;
  batterySaver: boolean;
  // --- Voz e som ---
  voiceURI: string | null;
  speechRate: number;
  speechPitch: number;
  sounds: SoundVolumes;
  haptics: boolean;
  /** corrige letra trocada ao escrever ("qeuro" → "quero") */
  autoCorrect: boolean;
  // --- Teclado ---
  keyboard: KeyboardLayoutName;
  shortcuts: Record<string, string>;
  // --- Família e emergência ---
  /** nome do paciente que aparece no alerta da família */
  patientName: string;
  /** true = família é avisada NA HORA; false = espera a janela de 5 s para cancelar */
  alertImmediate: boolean;
  /** tirar fotos durante a emergência e enviar a quem o paciente autorizou */
  emergencyPhotos: boolean;
  /** servidor de notificações (ntfy). Pode ser trocado por um servidor próprio. */
  alertServer: string;
  /** versão do formato (para atualizar padrões de quem já usava o app) */
  settingsVersion: number;
}

export const ALARM_MIN_VOLUME = 0.6;

export const LIMITS = {
  dwellMs: [400, 4000],
  fontSizePx: [18, 48],
  sensitivity: [0.3, 3],
  maxSpeedPxS: [150, 3000],
  longBlinkMs: [400, 2000],
  rearmPx: [10, 200],
  deadZonePx: [0, 20],
  speechRate: [0.5, 1.6],
  speechPitch: [0.5, 1.5],
} as const;

export const DEFAULT_SETTINGS: Settings = {
  inputMode: 'head',
  dwellMs: 1200,
  rearmPx: 40,
  sensitivity: 1,
  smoothing: 0.5,
  deadZonePx: 2,
  maxSpeedPxS: 1800,
  invertX: false,
  invertY: false,
  selectGesture: 'none',
  longBlinkMs: 700,
  emergencyGesture: 'longBlink3',
  calibration: null,
  showMeshPreview: true,
  cursorStyle: 'orb',
  theme: 'dark',
  fontFamily: 'atkinson',
  fontSizePx: 22,
  calmMode: false,
  batterySaver: false,
  voiceURI: null,
  speechRate: 0.95,
  speechPitch: 1,
  sounds: { focus: 0.25, click: 0.5, sent: 0.5, alarm: 1 },
  haptics: true,
  autoCorrect: true,
  keyboard: 'qwerty',
  shortcuts: {
    bd: 'Bom dia, tudo bem com você?',
    bn: 'Boa noite, durma bem.',
    obg: 'Obrigada pelo carinho.',
    ta: 'Te amo muito.',
  },
  patientName: '',
  alertImmediate: true,
  emergencyPhotos: false,
  alertServer: 'https://ntfy.sh',
  settingsVersion: 5,
};

export const SETTINGS_VERSION = 5;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Mescla configurações salvas com os padrões e corrige valores fora dos limites. */
export function sanitizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    sounds: { ...DEFAULT_SETTINGS.sounds, ...(raw?.sounds ?? {}) },
    shortcuts: { ...(raw?.shortcuts ?? DEFAULT_SETTINGS.shortcuts) },
  };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const k = key as keyof typeof LIMITS;
    const n = Number(s[k]);
    s[k] = clamp(Number.isFinite(n) ? n : DEFAULT_SETTINGS[k], min, max) as never;
  }
  // v1/v2 → v3: novo ajuste do cursor (acompanha a cabeça com precisão, sem atraso)
  if (raw && (raw.settingsVersion ?? 1) < 3) {
    s.sensitivity = DEFAULT_SETTINGS.sensitivity;
    s.smoothing = DEFAULT_SETTINGS.smoothing;
    s.deadZonePx = DEFAULT_SETTINGS.deadZonePx;
    s.maxSpeedPxS = DEFAULT_SETTINGS.maxSpeedPxS;
  }
  // v4: a seta passou a usar a pose 3D da cabeça → calibração antiga não vale mais
  if (raw && (raw.settingsVersion ?? 1) < 4 && s.calibration?.source !== 'pose') s.calibration = null;
  // v5: calibração por pontos → sensibilidade 1 = a seta fica exatamente onde a pessoa aponta
  if (raw && (raw.settingsVersion ?? 1) < 5) s.sensitivity = 1;
  s.settingsVersion = SETTINGS_VERSION;
  s.smoothing = clamp(s.smoothing, 0, 1);
  s.sounds.alarm = Math.max(ALARM_MIN_VOLUME, clamp(s.sounds.alarm, 0, 1));
  return s;
}
