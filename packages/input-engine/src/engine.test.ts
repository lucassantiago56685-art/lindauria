import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './one-euro';
import { DEFAULT_CALIBRATION, HeadMapper, extractHeadFeatures } from './head-mapping';
import { buildCalibration, emptySamples } from './calibration';
import { GESTURE_PRESETS, HoldGestureDetector, SequenceDetector } from './gestures';
import { DwellTracker } from './dwell';

describe('OneEuroFilter', () => {
  it('reduz tremor quando parado', () => {
    const f = new OneEuroFilter(1, 0.01);
    let out = 0;
    const outs: number[] = [];
    for (let i = 0; i < 120; i++) {
      const noisy = 500 + (i % 2 ? 6 : -6); // tremor de ±6 px
      out = f.filter(noisy, i * 33);
      if (i > 60) outs.push(out);
    }
    const spread = Math.max(...outs) - Math.min(...outs);
    expect(spread).toBeLessThan(4); // tremor de 12 px vira < 4 px
  });
  it('acompanha movimento grande sem grande atraso', () => {
    const f = new OneEuroFilter(1, 0.02);
    let out = 0;
    for (let i = 0; i <= 30; i++) out = f.filter(i * 30, i * 33); // 0 → 900 px em 1 s
    expect(out).toBeGreaterThan(800);
  });
});

describe('Ajuste padrão do cursor', () => {
  it('acompanha a cabeça: chega a 90% de um movimento em até 150 ms', async () => {
    const { smoothingToParams } = await import('./one-euro');
    const p = smoothingToParams(0.5);
    const f = new OneEuroFilter(p.minCutoff, p.beta);
    for (let t = 0; t <= 300; t += 33) f.filter(200, t); // parado
    let out = 0;
    let t = 333;
    for (; t <= 333 + 150; t += 33) out = f.filter(800, t); // vira a cabeça: alvo 600 px adiante
    expect(out).toBeGreaterThan(200 + 600 * 0.9);
  });
  it('continua estável parado (tremor de ±5 px vira < 4 px)', async () => {
    const { smoothingToParams } = await import('./one-euro');
    const p = smoothingToParams(0.5);
    const f = new OneEuroFilter(p.minCutoff, p.beta);
    const outs: number[] = [];
    for (let i = 0; i < 120; i++) {
      const o = f.filter(500 + (i % 2 ? 5 : -5), i * 33);
      if (i > 60) outs.push(o);
    }
    expect(Math.max(...outs) - Math.min(...outs)).toBeLessThan(4);
  });
});

describe('HeadMapper', () => {
  const lm = (noseX: number, noseY: number) => {
    const arr = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    arr[33] = { x: 0.4, y: 0.4 };
    arr[263] = { x: 0.6, y: 0.4 };
    arr[1] = { x: noseX, y: noseY };
    return arr;
  };

  it('ignora distância da câmera (rosto maior ou menor)', () => {
    const near = extractHeadFeatures(lm(0.5, 0.5))!;
    const far = extractHeadFeatures([
      ...lm(0.5, 0.5).map((p) => ({ x: 0.5 + (p.x - 0.5) / 2, y: 0.5 + (p.y - 0.5) / 2 })),
    ])!;
    expect(far.raw.x).toBeCloseTo(near.raw.x);
    expect(far.raw.y).toBeCloseTo(near.raw.y);
  });

  it('centro calibrado vai para o meio da tela e extremos para as bordas', () => {
    const m = new HeadMapper(DEFAULT_CALIBRATION);
    const c = HeadMapper.toScreen(m.map(DEFAULT_CALIBRATION.center), 1000, 800);
    expect(c.x).toBeCloseTo(500);
    expect(c.y).toBeCloseTo(400);
    const r = HeadMapper.toScreen(m.map(DEFAULT_CALIBRATION.right), 1000, 800);
    expect(r.x).toBe(1000);
    const u = HeadMapper.toScreen(m.map(DEFAULT_CALIBRATION.up), 1000, 800);
    expect(u.y).toBe(0);
  });

  it('funciona com câmera girada 90° (modo deitado)', () => {
    // imagem girada: "virar à direita" agora move o nariz no eixo y da imagem
    const rot = (v: { x: number; y: number }) => ({ x: -v.y, y: v.x });
    const cal = {
      ...DEFAULT_CALIBRATION,
      center: rot(DEFAULT_CALIBRATION.center),
      right: rot(DEFAULT_CALIBRATION.right),
      left: rot(DEFAULT_CALIBRATION.left),
      up: rot(DEFAULT_CALIBRATION.up),
      down: rot(DEFAULT_CALIBRATION.down),
    };
    const m = new HeadMapper(cal);
    const r = m.map(cal.right);
    expect(r.x).toBeGreaterThan(1);
    expect(Math.abs(r.y)).toBeLessThan(0.01);
  });

  it('limita a velocidade do cursor', () => {
    // salto de 1000 px em 1 quadro (33 ms) com limite de 600 px/s → anda só ~20 px
    const p = HeadMapper.limitSpeed({ x: 0, y: 0 }, { x: 1000, y: 0 }, 33, 600);
    expect(p.x).toBeCloseTo(19.8, 1);
    // movimento pequeno passa direto
    expect(HeadMapper.limitSpeed({ x: 0, y: 0 }, { x: 5, y: 0 }, 33, 600)).toEqual({ x: 5, y: 0 });
  });

  it('lado mais fraco ainda alcança a borda (assimetria)', () => {
    const cal = { ...DEFAULT_CALIBRATION, left: { x: 0.08, y: 0.5 } }; // vira pouco à esquerda
    const m = new HeadMapper(cal);
    expect(m.map(cal.left).x).toBeLessThan(-1);
  });
});

describe('buildCalibration', () => {
  it('usa padrão nas direções em que a pessoa não conseguiu mexer', () => {
    const s = emptySamples();
    for (let i = 0; i < 20; i++) {
      s.center.push({ x: 0.01, y: 0.5 });
      s.right.push({ x: -0.2 * (i / 19), y: 0.5 });
      s.left.push({ x: 0.012, y: 0.5 }); // quase nada
      s.up.push({ x: 0, y: 0.5 - 0.1 * (i / 19) });
      s.down.push({ x: 0, y: 0.5 + 0.1 * (i / 19) });
    }
    const r = buildCalibration(s);
    expect(r.weakDirections).toEqual(['left']);
    expect(r.calibration.right.x).toBeLessThan(-0.15);
  });
});

describe('Gestos', () => {
  const open = { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 };
  const closed = { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 };
  const run = (d: HoldGestureDetector, closedMs: number) => {
    let fired = false;
    let t = 0;
    for (; t < 300; t += 33) fired ||= d.update(open, t);
    const end = t + closedMs;
    for (; t < end; t += 33) fired ||= d.update(closed, t);
    for (let k = 0; k < 5; k++, t += 33) fired ||= d.update(open, t);
    return fired;
  };

  it('ignora piscada natural', () => {
    expect(run(new HoldGestureDetector(GESTURE_PRESETS.longBlink(700)), 200)).toBe(false);
  });
  it('reconhece piscada longa', () => {
    expect(run(new HoldGestureDetector(GESTURE_PRESETS.longBlink(700)), 1000)).toBe(true);
  });
  it('ignora olhos fechados por muito tempo (cochilo)', () => {
    expect(run(new HoldGestureDetector(GESTURE_PRESETS.longBlink(700)), 10_000)).toBe(false);
  });
  it('só pisca um olho não conta como piscada dos dois', () => {
    const d = new HoldGestureDetector(GESTURE_PRESETS.longBlink(700));
    let fired = false;
    for (let t = 0; t < 2000; t += 33) fired ||= d.update({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 }, t);
    fired ||= d.update(open, 2100);
    expect(fired).toBe(false);
  });
  it('3 repetições na janela disparam a sequência (emergência)', () => {
    const s = new SequenceDetector(3, 8000);
    expect(s.hit(0)).toBe(false);
    expect(s.hit(2000)).toBe(false);
    expect(s.hit(4000)).toBe(true);
  });
  it('repetições muito espaçadas não disparam', () => {
    const s = new SequenceDetector(3, 8000);
    s.hit(0);
    s.hit(5000);
    expect(s.hit(9000)).toBe(false); // a primeira já saiu da janela
  });
});

describe('DwellTracker', () => {
  const opts = { dwellMs: 1000, rearmPx: 40, graceMs: 150 };

  it('não clica antes da pessoa se mexer (começa desarmado)', () => {
    const d = new DwellTracker<string>(opts);
    let fired = 0;
    for (let t = 0; t < 5 * 60_000; t += 33) if (d.update('btn', 100, 100, t).fired) fired++;
    expect(fired).toBe(0);
  });

  it('pessoa parada: no máximo 1 clique em 5 minutos', () => {
    const d = new DwellTracker<string>(opts);
    d.update(null, 0, 0, 0);
    d.update(null, 100, 100, 10); // mexeu: arma
    let fired = 0;
    for (let t = 20; t < 5 * 60_000; t += 33) if (d.update('btn', 100, 100, t).fired) fired++;
    expect(fired).toBe(1);
  });

  it('tela nova embaixo do cursor parado não é clicada', () => {
    const d = new DwellTracker<string>(opts);
    d.update(null, 0, 0, 0);
    d.update(null, 100, 100, 10);
    let t = 20;
    let fired = 0;
    for (; t < 1200; t += 33) if (d.update('a', 100, 100, t).fired) fired++;
    expect(fired).toBe(1);
    for (; t < 10_000; t += 33) if (d.update('b', 101, 101, t).fired) fired++; // nova tela, botão b
    expect(fired).toBe(1);
  });

  it('tremor rápido para fora do botão não zera o progresso', () => {
    const d = new DwellTracker<string>(opts);
    d.update(null, 0, 0, 0);
    d.update(null, 100, 100, 10);
    d.update('a', 100, 100, 20);
    d.update('a', 100, 100, 500);
    d.update(null, 100, 100, 560); // escapou por 60 ms
    const r = d.update('a', 100, 100, 620);
    expect(r.progress).toBeGreaterThan(0.55);
  });

  it('botão de repetição (rolar tela) dispara de novo sem precisar mexer', () => {
    const d = new DwellTracker<string>(opts);
    d.update(null, 0, 0, 0);
    d.update(null, 100, 100, 10);
    let fired = 0;
    for (let t = 20; t < 3500; t += 33) if (d.update('descer', 100, 100, t, 1000, true).fired) fired++;
    expect(fired).toBe(3);
  });

  it('respeita tempo de dwell específico do alvo', () => {
    const d = new DwellTracker<string>(opts);
    d.update(null, 0, 0, 0);
    d.update(null, 100, 100, 10);
    d.update('cancel', 100, 100, 20);
    expect(d.update('cancel', 100, 100, 1100, 3000).fired).toBeNull();
    expect(d.update('cancel', 100, 100, 3100, 3000).fired).toBe('cancel');
  });
});

describe('Calibração por pontos (9 alvos)', () => {
  it('a seta cai exatamente onde a pessoa aponta (erro < 2% da tela)', async () => {
    const { buildTargetCalibration, CALIBRATION_TARGETS } = await import('./calibration');
    // cabeça simulada: relação não linear, girada e assimétrica entre tela e direção
    const toRaw = (t: { x: number; y: number }) => {
      const a = (t.x - 0.5) * 0.6;
      const b = (t.y - 0.5) * 0.4;
      return { x: -(a * 0.95 + b * 0.1 + 0.15 * a * a), y: -(b - a * 0.08) + 0.05 };
    };
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.004;
    const points = CALIBRATION_TARGETS.map((target) => ({
      target,
      raw: Array.from({ length: 20 }, () => {
        const r = toRaw(target);
        return { x: r.x + noise(), y: r.y + noise() };
      }),
    }));
    const r = buildTargetCalibration(points, { open: [0.05], closed: [0.8] }, 1, 'pose');
    expect(r.ok).toBe(true);
    expect(r.errorPct).toBeLessThan(2);
    // confere num ponto que NÃO foi usado na calibração
    const m = new HeadMapper(r.calibration);
    const s = HeadMapper.toScreen(m.map(toRaw({ x: 0.3, y: 0.7 })), 1000, 1000);
    expect(Math.abs(s.x - 300)).toBeLessThan(20);
    expect(Math.abs(s.y - 700)).toBeLessThan(20);
  });

  it('com poucos pontos válidos, não confia na curva', async () => {
    const { buildTargetCalibration } = await import('./calibration');
    const one = { target: { x: 0.5, y: 0.5 }, raw: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] };
    const r = buildTargetCalibration([one], { open: [], closed: [] });
    expect(r.ok).toBe(false);
    expect(r.calibration.fit).toBeUndefined();
  });
});
