import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, GlowButton, NeuralMesh } from '@lindauria/design-system';
import {
  CALIBRATION_TARGETS,
  FACE_MESH_CONNECTIONS,
  buildTargetCalibration,
  type HeadInputProvider,
  type TargetSample,
} from '@lindauria/input-engine';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { getHead, speaker } from '../runtime/engine';
import { subscribeFrames } from '../components/common';

/* =============================================================================================
   Calibração por pontos (~30 s, guiada por voz):
   1) posicionar o rosto (mostra o ROSTO REAL com a malha de pontos por cima);
   2) 9 pontos na tela: a pessoa aponta o nariz para cada um;
   3) piscar devagar 2x (aprende o limiar da piscada);
   4) resultado com a precisão medida.
   O tempo de cada etapa só anda quando o rosto está sendo visto.
   ============================================================================================= */

// ordem: centro primeiro, depois em volta (o ponto anda pouco de um para o outro)
const ORDER = [4, 0, 1, 2, 5, 8, 7, 6, 3];
const TARGETS = ORDER.map((i) => CALIBRATION_TARGETS[i]);
const POSITION_MS = 2500;
const SETTLE_MS = 900; // tempo para a cabeça chegar no ponto (não conta)
const SAMPLE_MS = 1300; // tempo coletando
const BLINK_MS = 5000;

type Phase = { kind: 'position' } | { kind: 'target'; i: number } | { kind: 'blink' } | { kind: 'done' };

function FacePreview({ head, className, style }: { head: HeadInputProvider; className?: string; style?: React.CSSProperties }) {
  const video = useRef<HTMLVideoElement>(null);
  const [aspect, setAspect] = useState(4 / 3);
  useEffect(() => {
    const v = video.current;
    const stream = head.stream;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      void v.play().catch(() => undefined);
    }
  }, [head]);
  return (
    <GlassCard className={`relative overflow-hidden p-0 ${className ?? ''}`} style={{ aspectRatio: String(aspect), ...style }}>
      {/* rosto real, espelhado (como um espelho) */}
      <video
        ref={video}
        muted
        playsInline
        autoPlay
        aria-label="Imagem da sua câmera"
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: 'fill', transform: 'scaleX(-1)', filter: 'brightness(0.8) saturate(0.85)' }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
        }}
      />
      {/* malha de pontos por cima do rosto */}
      <NeuralMesh
        subscribe={subscribeFrames}
        connections={FACE_MESH_CONNECTIONS}
        width={Math.round(480 * aspect)}
        height={480}
        className="absolute inset-0 h-full w-full"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-2xl" style={{ border: '2px dashed color-mix(in srgb, var(--primary) 45%, transparent)' }} />
    </GlassCard>
  );
}

export function Calibration() {
  const go = useApp((s) => s.go);
  const update = useSettings((s) => s.update);
  const head = getHead();
  const [phase, setPhase] = useState<Phase>({ kind: 'position' });
  const [progress, setProgress] = useState(0);
  const [seen, setSeen] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; errorPct: number } | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!head) return;
    head.pointerPaused = true;
    setResult(null);
    const points: TargetSample[] = TARGETS.map((t) => ({ target: t, raw: [] }));
    const blink = { open: [] as number[], closed: [] as number[] };
    let ph: Phase = { kind: 'position' };
    let elapsed = 0;
    let lastT: number | null = null;
    let lastUi = 0;
    let source: 'pose' | 'nose' = 'pose';
    setPhase(ph);
    void speaker.speak('Vamos ajustar a seta ao seu jeito. Deixe o rosto inteiro dentro da moldura.');

    const enter = (next: Phase) => {
      ph = next;
      elapsed = 0;
      setPhase(next);
      setProgress(0);
      if (next.kind === 'target' && next.i === 0) void speaker.speak('Agora aponte o nariz para cada ponto que aparecer. Mantenha até ele sumir.');
      if (next.kind === 'blink') void speaker.speak('Por último, feche os olhos devagar por um segundo, e abra. Faça isso duas vezes.');
    };

    const unsub = head.onFrame((f) => {
      const dt = lastT === null ? 0 : Math.min(100, f.t - lastT);
      lastT = f.t;
      if (!f.detected || !f.features) {
        if (f.t - lastUi > 200) {
          lastUi = f.t;
          setSeen(false);
        }
        return; // sem rosto: a etapa NÃO anda
      }
      source = f.features.source;
      elapsed += dt;
      const bs = f.blendshapes ?? {};
      const eyes = Math.min(bs.eyeBlinkLeft ?? 0, bs.eyeBlinkRight ?? 0);
      let dur = POSITION_MS;

      if (ph.kind === 'position') {
        blink.open.push(eyes);
      } else if (ph.kind === 'target') {
        dur = SETTLE_MS + SAMPLE_MS;
        if (elapsed > SETTLE_MS) points[ph.i].raw.push(f.features.raw);
        blink.open.push(eyes);
      } else if (ph.kind === 'blink') {
        dur = BLINK_MS;
        blink.closed.push(eyes);
      }

      if (elapsed >= dur) {
        if (ph.kind === 'position') enter({ kind: 'target', i: 0 });
        else if (ph.kind === 'target') enter(ph.i + 1 < TARGETS.length ? { kind: 'target', i: ph.i + 1 } : { kind: 'blink' });
        else if (ph.kind === 'blink') {
          const r = buildTargetCalibration(points, blink, Date.now(), source);
          update({ calibration: r.calibration });
          head.pointerPaused = false;
          ph = { kind: 'done' };
          setPhase(ph);
          setResult({ ok: r.ok, errorPct: r.errorPct });
          void speaker.speak(r.ok ? 'Pronto! Agora a seta vai até onde você apontar o nariz.' : 'Pronto. Alguns pontos ficaram imprecisos. Se quiser, refaça a calibração.');
        }
        return;
      }
      if (f.t - lastUi > 60) {
        lastUi = f.t;
        setSeen(true);
        setProgress(elapsed / dur);
      }
    });
    return () => {
      unsub();
      head.pointerPaused = false;
    };
  }, [head, run, update]);

  if (!head) {
    return (
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-[1.3em]">A calibração precisa da câmera ligada (modo cabeça).</p>
        <GlowButton tone="primary" label="Voltar ao início" onClick={() => go('hub')} className="min-h-[3.5em] w-80" />
      </div>
    );
  }

  const target = phase.kind === 'target' ? TARGETS[phase.i] : null;
  const totalSteps = TARGETS.length + 2;
  const stepIndex = phase.kind === 'position' ? 0 : phase.kind === 'target' ? phase.i + 1 : phase.kind === 'blink' ? totalSteps - 1 : totalSteps;
  const overall = Math.min(1, (stepIndex + (phase.kind === 'done' ? 0 : progress)) / totalSteps);

  return (
    <div className="relative z-10 h-full overflow-hidden">
      {/* barra de progresso geral */}
      <div className="absolute inset-x-4 top-3 z-20 h-2 overflow-hidden rounded-full" style={{ background: 'var(--bg-surface)' }}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${overall * 100}%`, background: 'var(--brand-gradient)' }} />
      </div>

      {/* ---------- 9 pontos ---------- */}
      {target && (
        <>
          <p className="absolute inset-x-0 top-7 z-20 px-4 text-center text-[clamp(16px,2.4vw,1.25em)] font-bold" aria-live="assertive">
            🎯 Aponte o nariz para o ponto · {phase.kind === 'target' ? phase.i + 1 : 0} de {TARGETS.length}
          </p>
          <motion.div
            aria-hidden="true"
            className="absolute z-10"
            initial={false}
            animate={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 18 }}
            style={{ width: 0, height: 0 }}
          >
            {/* anel que fecha enquanto coleta */}
            <svg width="96" height="96" viewBox="0 0 96 96" className="absolute -left-12 -top-12">
              <circle cx="48" cy="48" r="40" fill="none" stroke="var(--border-glow)" strokeWidth="4" />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={2 * Math.PI * 40 * (1 - progress)}
                transform="rotate(-90 48 48)"
              />
            </svg>
            <span
              className="absolute -left-4 -top-4 h-8 w-8 rounded-full"
              style={{ background: 'radial-gradient(circle, #fff, var(--primary) 55%, transparent 72%)', boxShadow: '0 0 calc(30px * var(--glow)) var(--primary)' }}
            />
          </motion.div>
          {/* rosto pequeno num canto livre, para a pessoa se ver */}
          <FacePreview head={head} className="absolute z-0 opacity-90" style={{ left: '28%', top: '24%', width: 'min(24vw, 200px)' }} />
        </>
      )}

      {/* ---------- posicionar / piscar / resultado ---------- */}
      {!target && (
        <div className="flex h-full flex-col items-center justify-center gap-4 overflow-auto px-4 pb-4 pt-8">
          <h1 className="la-display text-center text-[clamp(22px,3.5vw,1.6em)] font-bold">
            {phase.kind === 'done' ? 'Calibração concluída' : 'Calibração da seta'}
          </h1>
          <FacePreview head={head} style={{ width: 'min(92vw, 520px, calc(48vh * 1.333))' }} />
          {phase.kind === 'position' && (
            <p className="text-center text-[1.3em] font-bold" aria-live="assertive">
              🙂 Deixe o rosto inteiro dentro da moldura
            </p>
          )}
          {phase.kind === 'blink' && (
            <p className="text-center text-[1.3em] font-bold" aria-live="assertive">
              😌 Feche os olhos por 1 segundo e abra. Duas vezes.
            </p>
          )}
          {!seen && phase.kind !== 'done' && (
            <p className="text-center font-bold" style={{ color: 'var(--warning-text)' }}>
              Não estou vendo seu rosto. Ajuste a câmera ou a luz.
            </p>
          )}
          {phase.kind === 'done' && result && (
            <div className="flex w-[min(92vw,640px)] flex-col gap-4 text-center">
              <p className="text-[1.1em]">
                {result.ok ? '✅ ' : '⚠️ '}
                Precisão:{' '}
                <strong style={{ color: result.ok ? 'var(--success-text)' : 'var(--warning-text)' }}>
                  {result.errorPct < 3 ? 'ótima' : result.errorPct < 6 ? 'boa' : 'fraca'}
                </strong>{' '}
                (erro médio de {result.errorPct.toFixed(1).replace('.', ',')}% da tela).
                <br />
                <span className="text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
                  {result.ok
                    ? 'Mexa a cabeça: a seta vai até onde você aponta o nariz.'
                    : 'Dica: rosto bem iluminado, câmera na altura dos olhos, e aponte com calma para cada ponto.'}
                </span>
              </p>
              <div className="grid grid-cols-2 gap-4">
                <GlowButton tone="success" icon="▶️" label="Começar a usar" className="min-h-[4em] text-[1.2em]" onClick={() => go('hub')} />
                <GlowButton tone="neutral" icon="🔁" label="Refazer" className="min-h-[4em] text-[1.2em]" onClick={() => setRun((r) => r + 1)} />
              </div>
            </div>
          )}
        </div>
      )}

      {phase.kind !== 'done' && (
        <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center">
          <GlowButton dwell={false} tone="neutral" label="Pular (usar ajuste padrão)" className="la-btn--bar" onClick={() => go('hub')} />
        </div>
      )}
    </div>
  );
}
