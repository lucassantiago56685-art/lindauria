import type { Calibration, Vec2 } from '@lindauria/shared';

/**
 * Da malha do rosto para um cursor na tela.
 *
 * 1) extractHeadFeatures: posição da ponta do nariz em relação ao meio dos olhos, dividida pela
 *    distância entre os olhos. Assim o valor NÃO muda se a pessoa se aproxima/afasta da câmera,
 *    só quando ela gira a cabeça.
 * 2) HeadMapper: usa a calibração (centro + 4 extremos) para converter esse vetor em
 *    coordenadas normalizadas -1..1. Resolve uma transformação linear 2x2, então funciona com a
 *    câmera em qualquer ângulo (braço articulado acima da cama, tablet de lado...). Depois aplica
 *    escala separada para cada lado: se a pessoa vira menos para a esquerda que para a direita
 *    (comum na ELA), os dois lados ainda alcançam a borda da tela.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

// Índices do MediaPipe Face Mesh
export const LM = {
  noseTip: 1,
  leftEyeOuter: 263, // olho esquerdo da PESSOA (lado direito da imagem)
  rightEyeOuter: 33,
  forehead: 10,
  chin: 152,
} as const;

export interface HeadFeatures {
  /** valor 2D que representa para onde a cabeça aponta */
  raw: Vec2;
  /** distância entre olhos em coordenadas normalizadas da imagem (tamanho do rosto) */
  eyeDist: number;
  /**
   * pose = direção 3D da cabeça (matriz de transformação do MediaPipe, ajustada com os 478
   *        pontos ao mesmo tempo → bem menos tremor, mais precisa);
   * nose = posição do nariz em relação aos olhos (método antigo, usado se não houver matriz).
   */
  source: 'pose' | 'nose';
}

export function extractHeadFeatures(lm: ArrayLike<Landmark>): HeadFeatures | null {
  const nose = lm[LM.noseTip];
  const a = lm[LM.rightEyeOuter];
  const b = lm[LM.leftEyeOuter];
  if (!nose || !a || !b) return null;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const eyeDist = Math.hypot(b.x - a.x, b.y - a.y);
  if (eyeDist < 1e-4) return null;
  return { raw: { x: (nose.x - mx) / eyeDist, y: (nose.y - my) / eyeDist }, eyeDist, source: 'nose' };
}

/**
 * Pose 3D: a matriz 4x4 (coluna-maior) leva o rosto "canônico" para o espaço da câmera.
 * A 3ª coluna é o vetor "para onde o rosto aponta". Usamos as componentes x e y dele:
 * variam suavemente e sem saltos de ângulo (±90°), e a calibração cuida dos sinais.
 */
export function extractPoseFeatures(matrix: ArrayLike<number>, eyeDist: number): HeadFeatures | null {
  if (!matrix || matrix.length < 16) return null;
  const fx = matrix[8];
  const fy = matrix[9];
  const fz = matrix[10];
  const len = Math.hypot(fx, fy, fz);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return { raw: { x: fx / len, y: fy / len }, eyeDist, source: 'pose' };
}

/**
 * Calibração padrão (antes de calibrar). Câmera frontal, imagem NÃO espelhada:
 * virar a cabeça para a direita da pessoa leva o nariz para a esquerda da imagem (x menor).
 */
export const DEFAULT_CALIBRATION: Calibration = {
  center: { x: 0, y: 0.5 },
  right: { x: -0.22, y: 0.5 },
  left: { x: 0.22, y: 0.5 },
  up: { x: 0, y: 0.38 },
  down: { x: 0, y: 0.62 },
  blinkThreshold: 0.45,
  createdAt: 0,
};

/** Padrão para a pose 3D (antes de calibrar): ~20° para os lados, ~15° para cima/baixo. */
export const DEFAULT_POSE_CALIBRATION: Calibration = {
  center: { x: 0, y: 0 },
  right: { x: -0.34, y: 0 },
  left: { x: 0.34, y: 0 },
  up: { x: 0, y: 0.26 },
  down: { x: 0, y: -0.26 },
  blinkThreshold: 0.45,
  createdAt: 0,
  source: 'pose',
};

export const defaultCalibrationFor = (source: 'pose' | 'nose') =>
  source === 'pose' ? DEFAULT_POSE_CALIBRATION : DEFAULT_CALIBRATION;

export interface MapperOptions {
  sensitivity: number;
  invertX: boolean;
  invertY: boolean;
}

export class HeadMapper {
  private inv = [1, 0, 0, 1];
  private c: Vec2 = { x: 0, y: 0 };
  private scale = { right: 1, left: 1, down: 1, up: 1 };

  constructor(
    calibration: Calibration = DEFAULT_CALIBRATION,
    public opts: MapperOptions = { sensitivity: 1, invertX: false, invertY: false },
  ) {
    this.setCalibration(calibration);
  }

  setCalibration(cal: Calibration) {
    this.fit = cal.fit;
    this.c = cal.center;
    // eixos: ex aponta para a direita da tela, ey para baixo
    const ex = { x: (cal.right.x - cal.left.x) / 2, y: (cal.right.y - cal.left.y) / 2 };
    const ey = { x: (cal.down.x - cal.up.x) / 2, y: (cal.down.y - cal.up.y) / 2 };
    const det = ex.x * ey.y - ey.x * ex.y;
    if (Math.abs(det) < 1e-6) {
      // calibração degenerada: volta para o padrão em vez de travar o cursor
      if (cal !== DEFAULT_CALIBRATION) this.setCalibration(DEFAULT_CALIBRATION);
      return;
    }
    this.inv = [ey.y / det, -ey.x / det, -ex.y / det, ex.x / det];
    const r = this.solve(cal.right);
    const l = this.solve(cal.left);
    const d = this.solve(cal.down);
    const u = this.solve(cal.up);
    // usamos 85% do alcance medido: chegar na borda não exige esforço máximo
    const k = 0.85;
    this.scale = {
      right: Math.max(0.05, r.x * k),
      left: Math.max(0.05, -l.x * k),
      down: Math.max(0.05, d.y * k),
      up: Math.max(0.05, -u.y * k),
    };
  }

  private solve(v: Vec2): Vec2 {
    const dx = v.x - this.c.x;
    const dy = v.y - this.c.y;
    const [a, b, c, d] = this.inv;
    return { x: a * dx + b * dy, y: c * dx + d * dy };
  }

  private fit: Calibration['fit'] = undefined;

  /** Retorna coordenadas normalizadas, aproximadamente -1..1 (podem passar disso). */
  map(raw: Vec2): Vec2 {
    if (this.fit) {
      // calibração por pontos: a curva já devolve a posição na tela (0..1)
      const f = this.fit;
      const u = (raw.x - f.mu.x) / f.sigma.x;
      const v = (raw.y - f.mu.y) / f.sigma.y;
      const feats = [1, u, v, u * v, u * u, v * v];
      let px = 0;
      let py = 0;
      for (let i = 0; i < 6; i++) {
        px += f.x[i] * feats[i];
        py += f.y[i] * feats[i];
      }
      let x = (px - 0.5) * 2 * this.opts.sensitivity;
      let y = (py - 0.5) * 2 * this.opts.sensitivity;
      if (this.opts.invertX) x = -x;
      if (this.opts.invertY) y = -y;
      return { x, y };
    }
    const s = this.solve(raw);
    let x = s.x >= 0 ? s.x / this.scale.right : s.x / this.scale.left;
    let y = s.y >= 0 ? s.y / this.scale.down : s.y / this.scale.up;
    x *= this.opts.sensitivity;
    y *= this.opts.sensitivity;
    if (this.opts.invertX) x = -x;
    if (this.opts.invertY) y = -y;
    return { x, y };
  }

  /** Normalizado (-1..1) → pixels da tela, limitado às bordas. */
  static toScreen(n: Vec2, width: number, height: number): Vec2 {
    const cx = Math.min(1, Math.max(-1, n.x));
    const cy = Math.min(1, Math.max(-1, n.y));
    return { x: ((cx + 1) / 2) * width, y: ((cy + 1) / 2) * height };
  }

  /**
   * Limita a velocidade do cursor: anda no máximo `maxSpeedPxS` pixels por segundo
   * em direção ao alvo. Deixa o movimento calmo e previsível, sem "saltos".
   */
  static limitSpeed(from: Vec2, to: Vec2, dtMs: number, maxSpeedPxS: number): Vec2 {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = (maxSpeedPxS * Math.max(0, Math.min(dtMs, 100))) / 1000;
    if (dist <= maxStep || dist === 0) return to;
    const k = maxStep / dist;
    return { x: from.x + dx * k, y: from.y + dy * k };
  }

  /**
   * Filtro de intenção: cabeça muito além do extremo de baixo calibrado = provavelmente cochilando.
   * Nesses casos escondemos o cursor (nada é clicado).
   */
  static looksAsleep(n: Vec2): boolean {
    return n.y > 1.8;
  }
}
