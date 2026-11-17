import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Blendshapes } from './gestures';
import { extractHeadFeatures, extractPoseFeatures, type HeadFeatures, type Landmark } from './head-mapping';

/**
 * Rastreador de rosto com MediaPipe Face Landmarker (478 pontos + 52 blendshapes).
 *
 * PRIVACIDADE: o vídeo vai da webcam direto para o modelo, que roda NO APARELHO (WebAssembly +
 * WebGL). Nenhum quadro é enviado para servidor algum. O modelo e o wasm são servidos pelo
 * próprio app (pasta /public), então também funciona offline depois do primeiro carregamento.
 *
 * Observação técnica: nesta fase o modelo roda na thread principal. Mover para Web Worker está
 * planejado (a interface deste módulo já isola isso), mas o MediaPipe em worker exige ajustes de
 * empacotamento que podem quebrar em alguns tablets; preferimos o caminho mais seguro primeiro.
 */

export interface FaceFrame {
  t: number;
  detected: boolean;
  /** quantos rostos aparecem (escolhemos o maior = mais perto da câmera) */
  faces: number;
  landmarks: Landmark[] | null;
  blendshapes: Blendshapes | null;
  features: HeadFeatures | null;
}

export interface FaceTrackerOptions {
  /** URL base onde estão /mediapipe/wasm e /models/face_landmarker.task */
  assetsBase: string;
  targetFps: number;
}

export type TrackerError = 'camera-denied' | 'camera-missing' | 'model-failed' | 'unknown';

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private running = false;
  private lastVideoTime = -1;
  private lastRun = 0;
  private listeners = new Set<(f: FaceFrame) => void>();
  private rafId = 0;
  fps = 0;
  delegate: 'GPU' | 'CPU' | null = null;

  constructor(public opts: FaceTrackerOptions) {}

  onFrame(cb: (f: FaceFrame) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private async createLandmarker() {
    const base = this.opts.assetsBase.replace(/\/$/, '');
    const fileset = await FilesetResolver.forVisionTasks(`${base}/mediapipe/wasm`);
    const make = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}/models/face_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numFaces: 2, // detecta até 2 para poder ignorar quem passa atrás
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true, // pose 3D da cabeça (seta mais precisa)
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      this.landmarker = await make('GPU');
      this.delegate = 'GPU';
    } catch (err) {
      console.warn('[face-tracker] GPU indisponível, usando CPU', err);
      this.landmarker = await make('CPU');
      this.delegate = 'CPU';
    }
  }

  /** Liga a câmera e o modelo. Lança TrackerError em caso de falha. */
  async start(video: HTMLVideoElement): Promise<void> {
    if (this.running) return;
    this.video = video;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      throw (name === 'NotAllowedError' || name === 'SecurityError'
        ? 'camera-denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'camera-missing'
          : 'unknown') satisfies TrackerError;
    }
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => undefined);

    if (!this.landmarker) {
      try {
        await this.createLandmarker();
      } catch (err) {
        console.error('[face-tracker] falha ao carregar modelo', err);
        this.stop();
        throw 'model-failed' satisfies TrackerError;
      }
    }
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  get isRunning() {
    return this.running;
  }

  private loop = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    const v = this.video;
    if (!v || !this.landmarker || v.readyState < 2) return;
    const now = performance.now();
    // limita FPS (modo economia de bateria)
    if (now - this.lastRun < 1000 / this.opts.targetFps - 2) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    const dt = now - this.lastRun;
    this.lastRun = now;
    if (dt > 0 && dt < 1000) this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;

    let frame: FaceFrame;
    try {
      const res = this.landmarker.detectForVideo(v, now);
      frame = this.pickFace(res.faceLandmarks, res.faceBlendshapes, now, res.facialTransformationMatrixes);
    } catch (err) {
      console.warn('[face-tracker] erro no quadro', err);
      return;
    }
    for (const l of this.listeners) l(frame);
  };

  private pickFace(
    all: Landmark[][],
    shapes: Array<{ categories: Array<{ categoryName: string; score: number }> }>,
    t: number,
    matrices?: Array<{ data: ArrayLike<number> }>,
  ): FaceFrame {
    if (!all?.length) {
      return { t, detected: false, faces: 0, landmarks: null, blendshapes: null, features: null };
    }
    // filtro de intenção: usa o rosto MAIOR (mais perto) e ignora quem passa atrás
    let best = 0;
    let bestFeat = extractHeadFeatures(all[0]);
    for (let i = 1; i < all.length; i++) {
      const f = extractHeadFeatures(all[i]);
      if (f && (!bestFeat || f.eyeDist > bestFeat.eyeDist)) {
        best = i;
        bestFeat = f;
      }
    }
    const bs: Blendshapes = {};
    for (const c of shapes?.[best]?.categories ?? []) bs[c.categoryName] = c.score;
    // prefere a pose 3D (mais precisa); se não vier a matriz, usa o método do nariz
    const pose = bestFeat && matrices?.[best] ? extractPoseFeatures(matrices[best].data, bestFeat.eyeDist) : null;
    const features = pose ?? bestFeat;
    return { t, detected: !!features, faces: all.length, landmarks: all[best], blendshapes: bs, features };
  }
}

/** Conexões da malha (para desenhar a "malha neural"). */
export const FACE_MESH_CONNECTIONS: Array<{ start: number; end: number }> =
  FaceLandmarker.FACE_LANDMARKS_TESSELATION;
export const FACE_OVAL_CONNECTIONS: Array<{ start: number; end: number }> = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
