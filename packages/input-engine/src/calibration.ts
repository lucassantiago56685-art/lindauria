import type { Calibration, Vec2 } from '@lindauria/shared';
import { defaultCalibrationFor } from './head-mapping';

/**
 * Montagem da calibração a partir das amostras coletadas em cada etapa guiada.
 * Mantemos a lógica aqui (sem DOM) para poder testar.
 */

export type CalibrationStep = 'center' | 'right' | 'left' | 'up' | 'down' | 'blink';

export interface CalibrationSamples {
  center: Vec2[];
  right: Vec2[];
  left: Vec2[];
  up: Vec2[];
  down: Vec2[];
  /** score de piscada (0..1) durante a etapa "feche os olhos" */
  blink: number[];
  /** score de piscada com olhos abertos (etapa centro) */
  blinkOpen: number[];
}

export const emptySamples = (): CalibrationSamples => ({
  center: [],
  right: [],
  left: [],
  up: [],
  down: [],
  blink: [],
  blinkOpen: [],
});

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const medianVec = (vs: Vec2[]): Vec2 => ({ x: median(vs.map((v) => v.x)), y: median(vs.map((v) => v.y)) });

/**
 * Extremo de uma direção: entre as amostras, pega as 20% mais distantes do centro e tira a
 * mediana delas (robusto a um tranco isolado).
 */
function extreme(samples: Vec2[], center: Vec2): Vec2 | null {
  if (samples.length < 3) return null;
  const sorted = [...samples].sort(
    (a, b) => Math.hypot(b.x - center.x, b.y - center.y) - Math.hypot(a.x - center.x, a.y - center.y),
  );
  return medianVec(sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.2))));
}

/** Movimento mínimo (em unidades normalizadas) para aceitarmos uma direção. */
export const MIN_RANGE = 0.03;

export interface CalibrationResult {
  calibration: Calibration;
  /** direções em que a pessoa mexeu pouco demais (usamos o padrão nelas) */
  weakDirections: Array<'right' | 'left' | 'up' | 'down'>;
  ok: boolean;
}

export function buildCalibration(
  s: CalibrationSamples,
  now = Date.now(),
  source: 'pose' | 'nose' = 'nose',
): CalibrationResult {
  const DEFAULT_CALIBRATION = defaultCalibrationFor(source);
  const center = s.center.length >= 3 ? medianVec(s.center) : DEFAULT_CALIBRATION.center;
  const weak: CalibrationResult['weakDirections'] = [];
  const dirs = ['right', 'left', 'up', 'down'] as const;
  const out = {} as Record<(typeof dirs)[number], Vec2>;
  for (const d of dirs) {
    const e = extreme(s[d], center);
    if (!e || Math.hypot(e.x - center.x, e.y - center.y) < MIN_RANGE) {
      weak.push(d);
      const def = DEFAULT_CALIBRATION[d];
      // usa o vetor padrão deslocado para o centro real
      out[d] = {
        x: center.x + (def.x - DEFAULT_CALIBRATION.center.x),
        y: center.y + (def.y - DEFAULT_CALIBRATION.center.y),
      };
    } else out[d] = e;
  }

  // limiar de piscada: entre "aberto" e "fechado" medidos
  const open = s.blinkOpen.length ? median(s.blinkOpen) : 0.1;
  const closedPeak = s.blink.length ? [...s.blink].sort((a, b) => b - a)[Math.floor(s.blink.length * 0.1)] : NaN;
  let blinkThreshold = DEFAULT_CALIBRATION.blinkThreshold;
  if (Number.isFinite(closedPeak) && closedPeak - open > 0.2) {
    blinkThreshold = Math.min(0.75, Math.max(0.25, open + (closedPeak - open) * 0.55));
  }

  return {
    calibration: { center, ...out, blinkThreshold, createdAt: now, source },
    weakDirections: weak,
    ok: weak.length === 0,
  };
}

// =============================================================================================
// Calibração por PONTOS (9 alvos). A pessoa aponta o nariz para cada alvo; ajustamos uma curva
// de 2º grau (mínimos quadrados) que leva a direção da cabeça direto à posição na tela.
// Corrige perspectiva, posição da câmera e assimetria de movimento ao mesmo tempo.
// =============================================================================================

export interface TargetSample {
  /** posição do alvo na tela, 0..1 */
  target: Vec2;
  /** leituras da cabeça enquanto a pessoa apontava para o alvo */
  raw: Vec2[];
}

/** 9 alvos em grade 3x3, com margem para não exigir apontar para a quina da tela */
export const CALIBRATION_TARGETS: Vec2[] = [0.12, 0.5, 0.88].flatMap((y) => [0.1, 0.5, 0.9].map((x) => ({ x, y })));

const features = (u: number, v: number) => [1, u, v, u * v, u * u, v * v];

/** resolve (AᵀA + λI) c = Aᵀb por eliminação de Gauss */
function leastSquares(rows: number[][], b: number[], lambda = 1e-4): number[] | null {
  const n = rows[0].length;
  const M = Array.from({ length: n }, () => Array(n + 1).fill(0) as number[]);
  rows.forEach((r, k) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) M[i][j] += r[i] * r[j];
      M[i][n] += r[i] * b[k];
    }
  });
  for (let i = 1; i < n; i++) M[i][i] += lambda; // não penaliza o termo constante
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export type PointFit = NonNullable<Calibration['fit']>;

export function evalFit(fit: PointFit, raw: Vec2): Vec2 {
  const f = features((raw.x - fit.mu.x) / fit.sigma.x, (raw.y - fit.mu.y) / fit.sigma.y);
  let x = 0;
  let y = 0;
  for (let i = 0; i < f.length; i++) {
    x += fit.x[i] * f[i];
    y += fit.y[i] * f[i];
  }
  return { x, y };
}

/**
 * Monta a calibração a partir dos 9 alvos.
 * Também preenche centro/direita/esquerda/cima/baixo (formato antigo) como reserva.
 */
export function buildTargetCalibration(
  points: TargetSample[],
  blink: { open: number[]; closed: number[] },
  now = Date.now(),
  source: 'pose' | 'nose' = 'pose',
): CalibrationResult & { errorPct: number } {
  const good = points.filter((p) => p.raw.length >= 3).map((p) => ({ target: p.target, raw: medianVec(p.raw) }));
  const pick = (tx: number, ty: number) =>
    good.find((p) => Math.abs(p.target.x - tx) < 0.05 && Math.abs(p.target.y - ty) < 0.05)?.raw;
  const samples = emptySamples();
  const add = (arr: Vec2[], v?: Vec2) => {
    if (v) arr.push(v, v, v);
  };
  add(samples.center, pick(0.5, 0.5));
  add(samples.right, pick(0.9, 0.5));
  add(samples.left, pick(0.1, 0.5));
  add(samples.up, pick(0.5, 0.12));
  add(samples.down, pick(0.5, 0.88));
  samples.blink = blink.closed;
  samples.blinkOpen = blink.open;
  const base = buildCalibration(samples, now, source);

  if (good.length < 5) return { ...base, ok: false, errorPct: 100 };

  const mu = {
    x: good.reduce((a, p) => a + p.raw.x, 0) / good.length,
    y: good.reduce((a, p) => a + p.raw.y, 0) / good.length,
  };
  const sd = (k: 'x' | 'y') => Math.sqrt(good.reduce((a, p) => a + (p.raw[k] - mu[k]) ** 2, 0) / good.length) || 1;
  const sigma = { x: sd('x'), y: sd('y') };
  // com poucos pontos, usa só a parte linear (mais estável)
  const nTerms = good.length >= 8 ? 6 : 3;
  const rows = good.map((p) => features((p.raw.x - mu.x) / sigma.x, (p.raw.y - mu.y) / sigma.y).slice(0, nTerms));
  const cx = leastSquares(rows, good.map((p) => p.target.x));
  const cy = leastSquares(rows, good.map((p) => p.target.y));
  if (!cx || !cy) return { ...base, ok: false, errorPct: 100 };
  const pad = (v: number[]) => [...v, ...Array(6 - v.length).fill(0)];
  const fit: PointFit = { x: pad(cx), y: pad(cy), mu, sigma, errorPct: 0 };
  // erro médio nos próprios alvos, em % da tela
  const err =
    good.reduce((a, p) => {
      const q = evalFit(fit, p.raw);
      return a + Math.hypot(q.x - p.target.x, q.y - p.target.y);
    }, 0) / good.length;
  fit.errorPct = Math.round(err * 1000) / 10;
  return {
    calibration: { ...base.calibration, fit },
    weakDirections: base.weakDirections,
    ok: good.length >= 8 && fit.errorPct < 8,
    errorPct: fit.errorPct,
  };
}
