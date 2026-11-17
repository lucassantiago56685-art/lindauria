import type { ThemeName } from '@lindauria/shared';

/**
 * Tokens do design system "Neural Aurora" — FONTE ÚNICA DA VERDADE.
 *
 * Duas famílias de cor:
 *  - cores de MARCA (primary, secondary...) → brilhos, bordas, cursor, decoração;
 *  - cores de TEXTO (*Text) → sempre com contraste ≥ 7:1 (WCAG AAA) sobre o fundo e sobre os
 *    cartões de vidro. Isso é verificado por teste automático (tokens.test.ts).
 */

export interface ThemeTokens {
  bgDeep: string;
  bgSurface: string;
  /** cor sólida equivalente ao vidro sobre o fundo (usada no teste de contraste) */
  bgSurfaceSolid: string;
  borderGlow: string;
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  textPrimary: string;
  textSecondary: string;
  primaryText: string;
  secondaryText: string;
  accentText: string;
  successText: string;
  warningText: string;
  dangerText: string;
  focusRing: string;
  /** 1 = brilhos ligados, 0 = desligados (alto contraste) */
  glow: number;
  /** espessura das bordas dos botões */
  borderWidth: string;
  aurora: boolean;
  colorScheme: 'dark' | 'light';
}

export const BRAND_GRADIENT = 'linear-gradient(135deg, #5EEAFF 0%, #A78BFA 55%, #F0ABFC 100%)';

export const THEMES: Record<ThemeName, ThemeTokens> = {
  dark: {
    bgDeep: '#060A17',
    bgSurface: 'rgba(18, 26, 52, 0.72)',
    bgSurfaceSolid: '#0F162C',
    borderGlow: 'rgba(94, 234, 255, 0.35)',
    primary: '#5EEAFF',
    secondary: '#A78BFA',
    accent: '#F0ABFC',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#FF4D6D',
    textPrimary: '#F1F5FF',
    textSecondary: '#A9B4D6',
    primaryText: '#5EEAFF',
    secondaryText: '#C4B5FD',
    accentText: '#F5C2FD',
    successText: '#86EFAC',
    warningText: '#FCD34D',
    dangerText: '#FFB3C1',
    focusRing: '#5EEAFF',
    glow: 1,
    borderWidth: '2px',
    aurora: true,
    colorScheme: 'dark',
  },
  light: {
    bgDeep: '#F3F6FF',
    bgSurface: 'rgba(255, 255, 255, 0.82)',
    bgSurfaceSolid: '#FCFDFF',
    borderGlow: 'rgba(0, 110, 140, 0.35)',
    primary: '#0891B2',
    secondary: '#7C3AED',
    accent: '#C026D3',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#E11D48',
    textPrimary: '#0A1030',
    textSecondary: '#2E3A63',
    primaryText: '#00546A',
    secondaryText: '#4C1D95',
    accentText: '#86198F',
    successText: '#14532D',
    warningText: '#713F12',
    dangerText: '#9F1239',
    focusRing: '#00546A',
    glow: 0.6,
    borderWidth: '2px',
    aurora: true,
    colorScheme: 'light',
  },
  'hc-yellow': {
    bgDeep: '#000000',
    bgSurface: '#000000',
    bgSurfaceSolid: '#000000',
    borderGlow: '#FFFF00',
    primary: '#FFFF00',
    secondary: '#FFFF00',
    accent: '#FFFF00',
    success: '#FFFF00',
    warning: '#FFFF00',
    danger: '#FFFF00',
    textPrimary: '#FFFF00',
    textSecondary: '#FFFF00',
    primaryText: '#FFFF00',
    secondaryText: '#FFFF00',
    accentText: '#FFFF00',
    successText: '#FFFF00',
    warningText: '#FFFF00',
    dangerText: '#FFFF00',
    focusRing: '#FFFFFF',
    glow: 0,
    borderWidth: '4px',
    aurora: false,
    colorScheme: 'dark',
  },
  'hc-white': {
    bgDeep: '#000000',
    bgSurface: '#000000',
    bgSurfaceSolid: '#000000',
    borderGlow: '#FFFFFF',
    primary: '#FFFFFF',
    secondary: '#FFFFFF',
    accent: '#FFFFFF',
    success: '#FFFFFF',
    warning: '#FFFFFF',
    danger: '#FFFFFF',
    textPrimary: '#FFFFFF',
    textSecondary: '#FFFFFF',
    primaryText: '#FFFFFF',
    secondaryText: '#FFFFFF',
    accentText: '#FFFFFF',
    successText: '#FFFFFF',
    warningText: '#FFFFFF',
    dangerText: '#FFFFFF',
    focusRing: '#FFFF00',
    glow: 0,
    borderWidth: '4px',
    aurora: false,
    colorScheme: 'dark',
  },
};

export const THEME_LABELS: Record<ThemeName, string> = {
  dark: 'Escuro (padrão)',
  light: 'Claro',
  'hc-yellow': 'Alto contraste amarelo',
  'hc-white': 'Alto contraste branco',
};

export const FONT_STACKS = {
  atkinson: "'Atkinson Hyperlegible', 'Inter', system-ui, sans-serif",
  inter: "'Inter', 'Atkinson Hyperlegible', system-ui, sans-serif",
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export interface AppearanceOptions {
  theme: ThemeName;
  fontFamily: 'atkinson' | 'inter';
  fontSizePx: number;
  calmMode: boolean;
  batterySaver: boolean;
}

/** Aplica o tema como variáveis CSS no <html>. */
export function applyAppearance(o: AppearanceOptions, root: HTMLElement = document.documentElement) {
  const t = THEMES[o.theme];
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'string' || typeof v === 'number') root.style.setProperty(`--${kebab(k)}`, String(v));
  }
  root.dataset.theme = o.theme;
  root.dataset.aurora = t.aurora ? (o.batterySaver || o.calmMode ? 'static' : 'on') : 'off';
  root.dataset.calm = o.calmMode ? 'true' : 'false';
  root.style.colorScheme = t.colorScheme;
  root.style.setProperty('--font-base', `${o.fontSizePx}px`);
  root.style.setProperty('--font-body', FONT_STACKS[o.fontFamily]);
  root.style.setProperty('--font-display', FONT_STACKS.display);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', t.bgDeep);
}

// ---- contraste (WCAG) ----

function parseColor(c: string): [number, number, number] {
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = c.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((x) => parseFloat(x));
    return [r, g, b];
  }
  throw new Error(`cor inválida: ${c}`);
}

export function relativeLuminance(c: string) {
  const [r, g, b] = parseColor(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const TEXT_TOKENS = [
  'textPrimary',
  'textSecondary',
  'primaryText',
  'secondaryText',
  'accentText',
  'successText',
  'warningText',
  'dangerText',
] as const;
