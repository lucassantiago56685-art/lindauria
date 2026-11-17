import type { Calibration } from '@lindauria/shared';
import { FaceTracker, type FaceFrame } from './face-tracker';
import { GESTURE_PRESETS, HoldGestureDetector } from './gestures';
import { defaultCalibrationFor, HeadMapper } from './head-mapping';
import { OneEuroFilter, smoothingToParams } from './one-euro';

/**
 * InputProvider: contrato comum para QUALQUER forma de controle.
 * Hoje: cabeça (câmera) e ponteiro (mouse/caneta/toque).
 * Amanhã: chave externa, sopro/sucção, EMG, interface cérebro-computador (BCI).
 * O resto do app só conhece esta interface, então plugar um novo hardware não mexe nas telas.
 */

export interface PointerSample {
  x: number;
  y: number;
  visible: boolean;
  t: number;
}

export type GestureName = 'longBlink' | 'browRaise' | 'mouthOpen';

export interface InputStatus {
  /** rosto/sensor detectado agora */
  detected: boolean;
  fps: number;
}

export interface InputProvider {
  readonly kind: string;
  start(): Promise<void>;
  stop(): void;
  onPointer(cb: (p: PointerSample) => void): () => void;
  onGesture(cb: (g: GestureName, t: number) => void): () => void;
  onStatus(cb: (s: InputStatus) => void): () => void;
}

class Emitter<T extends unknown[]> {
  private l = new Set<(...a: T) => void>();
  on(cb: (...a: T) => void) {
    this.l.add(cb);
    return () => {
      this.l.delete(cb);
    };
  }
  emit(...a: T) {
    for (const cb of this.l) cb(...a);
  }
}

// ---------------------------------------------------------------------------------------------

export interface HeadConfig {
  calibration: Calibration | null;
  sensitivity: number;
  invertX: boolean;
  invertY: boolean;
  smoothing: number;
  deadZonePx: number;
  longBlinkMs: number;
  targetFps: number;
  /** velocidade máxima do cursor em px/s */
  maxSpeedPxS: number;
}

/** Cabeça → cursor, e rosto → gestos. */
export class HeadInputProvider implements InputProvider {
  readonly kind = 'head';
  readonly tracker: FaceTracker;
  private mapper = new HeadMapper();
  private fx = new OneEuroFilter();
  private fy = new OneEuroFilter();
  private shown: { x: number; y: number } | null = null;
  private lastPointerT = 0;
  /** fonte dos dados que o mapeador está usando (pose 3D ou nariz) */
  private mapperSource: 'pose' | 'nose' = 'pose';
  private gestures: Record<GestureName, HoldGestureDetector>;
  private pointerE = new Emitter<[PointerSample]>();
  private gestureE = new Emitter<[GestureName, number]>();
  private statusE = new Emitter<[InputStatus]>();
  private frameE = new Emitter<[FaceFrame]>();
  private lastDetected: boolean | null = null;
  private lastStatusAt = 0;
  private cfg: HeadConfig;
  /** durante a calibração o cursor fica escondido (nada é clicado) */
  pointerPaused = false;

  constructor(
    private video: HTMLVideoElement,
    assetsBase: string,
    cfg: HeadConfig,
  ) {
    this.cfg = cfg;
    this.tracker = new FaceTracker({ assetsBase, targetFps: cfg.targetFps });
    this.gestures = {
      longBlink: new HoldGestureDetector(GESTURE_PRESETS.longBlink()),
      browRaise: new HoldGestureDetector(GESTURE_PRESETS.browRaise()),
      mouthOpen: new HoldGestureDetector(GESTURE_PRESETS.mouthOpen()),
    };
    this.configure(cfg);
    this.tracker.onFrame(this.handleFrame);
  }

  configure(cfg: HeadConfig) {
    this.cfg = cfg;
    this.applyCalibration();
    this.mapper.opts = { sensitivity: cfg.sensitivity, invertX: cfg.invertX, invertY: cfg.invertY };
    const p = smoothingToParams(cfg.smoothing);
    for (const f of [this.fx, this.fy]) {
      f.minCutoff = p.minCutoff;
      f.beta = p.beta;
    }
    this.tracker.opts.targetFps = cfg.targetFps;
    const thr = cfg.calibration?.blinkThreshold ?? 0.45;
    this.gestures.longBlink.config = GESTURE_PRESETS.longBlink(cfg.longBlinkMs, thr);
  }

  /** usa a calibração salva só se ela foi feita com a mesma fonte de dados */
  private applyCalibration() {
    const cal = this.cfg.calibration;
    const calSource = cal?.source ?? 'nose';
    this.mapper.setCalibration(cal && calSource === this.mapperSource ? cal : defaultCalibrationFor(this.mapperSource));
  }

  start() {
    return this.tracker.start(this.video);
  }

  /** a câmera em uso (para mostrar o rosto real na calibração e tirar fotos na emergência) */
  get stream(): MediaStream | null {
    return (this.video.srcObject as MediaStream | null) ?? null;
  }
  get videoElement() {
    return this.video;
  }
  stop() {
    this.tracker.stop();
  }
  onPointer(cb: (p: PointerSample) => void) {
    return this.pointerE.on(cb);
  }
  onGesture(cb: (g: GestureName, t: number) => void) {
    return this.gestureE.on(cb);
  }
  onStatus(cb: (s: InputStatus) => void) {
    return this.statusE.on(cb);
  }
  /** quadros crus (malha neural, calibração) */
  onFrame(cb: (f: FaceFrame) => void) {
    return this.frameE.on(cb);
  }
  gesturePhase(name: GestureName, t = performance.now()) {
    return this.gestures[name].phase(t);
  }

  private handleFrame = (f: FaceFrame) => {
    this.frameE.emit(f);

    // status: emite quando muda, ou a cada 1 s (fps)
    if (f.detected !== this.lastDetected || f.t - this.lastStatusAt > 1000) {
      this.lastDetected = f.detected;
      this.lastStatusAt = f.t;
      this.statusE.emit({ detected: f.detected, fps: Math.round(this.tracker.fps) });
    }

    // gestos
    for (const [name, det] of Object.entries(this.gestures) as Array<[GestureName, HoldGestureDetector]>) {
      if (det.update(f.blendshapes, f.t)) this.gestureE.emit(name, f.t);
    }

    // cursor
    if (!f.features || this.pointerPaused) {
      this.fx.reset();
      this.fy.reset();
      this.shown = null;
      this.pointerE.emit({ x: 0, y: 0, visible: false, t: f.t });
      return;
    }
    if (f.features.source !== this.mapperSource) {
      this.mapperSource = f.features.source;
      this.applyCalibration();
    }
    const n = this.mapper.map(f.features.raw);
    if (HeadMapper.looksAsleep(n)) {
      this.pointerE.emit({ x: this.shown?.x ?? 0, y: this.shown?.y ?? 0, visible: false, t: f.t });
      return;
    }
    const s = HeadMapper.toScreen(n, window.innerWidth, window.innerHeight);
    const x = this.fx.filter(s.x, f.t);
    const y = this.fy.filter(s.y, f.t);
    const dt = f.t - this.lastPointerT;
    this.lastPointerT = f.t;
    // zona morta: micro-movimentos abaixo de N px não mexem o cursor
    if (!this.shown) this.shown = { x, y };
    else if (Math.hypot(x - this.shown.x, y - this.shown.y) >= this.cfg.deadZonePx) {
      // limite de velocidade: o cursor anda até o alvo, sem saltar
      this.shown = HeadMapper.limitSpeed(this.shown, { x, y }, dt, this.cfg.maxSpeedPxS);
    }
    this.pointerE.emit({ x: this.shown.x, y: this.shown.y, visible: true, t: f.t });
  };
}

// ---------------------------------------------------------------------------------------------

/**
 * Mouse / caneta / trackball / joystick adaptado. Toque com o dedo NÃO conta como cursor
 * (o dedo some da tela), mas toques funcionam normalmente como clique.
 */
export class PointerInputProvider implements InputProvider {
  readonly kind = 'pointer';
  private pointerE = new Emitter<[PointerSample]>();
  private gestureE = new Emitter<[GestureName, number]>();
  private statusE = new Emitter<[InputStatus]>();

  private move = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    this.pointerE.emit({ x: e.clientX, y: e.clientY, visible: true, t: performance.now() });
  };
  private leave = () => this.pointerE.emit({ x: 0, y: 0, visible: false, t: performance.now() });

  async start() {
    window.addEventListener('pointermove', this.move, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.leave);
    this.statusE.emit({ detected: true, fps: 0 });
  }
  stop() {
    window.removeEventListener('pointermove', this.move);
    document.documentElement.removeEventListener('pointerleave', this.leave);
  }
  onPointer(cb: (p: PointerSample) => void) {
    return this.pointerE.on(cb);
  }
  onGesture(cb: (g: GestureName, t: number) => void) {
    return this.gestureE.on(cb);
  }
  onStatus(cb: (s: InputStatus) => void) {
    return this.statusE.on(cb);
  }
}
