import {
  DwellEngine,
  HeadInputProvider,
  PointerInputProvider,
  SequenceDetector,
  type CursorState,
  type GestureName,
  type HeadConfig,
  type InputProvider,
  type TrackerError,
} from '@lindauria/input-engine';
import { applyAppearance, UiSounds } from '@lindauria/design-system';
import { finalizeText, Predictor, setAutoCorrect, type UserModel } from '@lindauria/keyboards';
import { CANCEL_WINDOW_MS, EmergencyController, Siren, type EmergencyEvent } from '@lindauria/safety';
import { notifyCancelled, notifyFamily, notifyKindChange, setCaptureSource, setReplyHandler, useFamily } from './family';
import { setReminderRingHandler, startReminderScheduler, useCare } from './care';
import {
  DEFAULT_SETTINGS,
  getAudioContext,
  LocalAuthProvider,
  requestPersistentStorage,
  secureGet,
  secureSet,
  vibrate,
  type AuthProvider,
  type InputMode,
  type Settings,
} from '@lindauria/shared';
import { Speaker } from '@lindauria/voice';
import { useApp } from '../store/app';
import { startOutbox } from './outbox';
import { loadTelegram, startTelegramPolling } from './telegram';
import { playFromBank } from './voicebank';
import { Scanner, SoundSwitch } from './scanner';

// ---------------------------------------------------------------- varredura (um acionador)
export const scanner = new Scanner();
scanner.onStep = () => sounds.focus();
scanner.onSelect = () => sounds.click();
const soundSwitch = new SoundSwitch();
soundSwitch.onTrigger = () => scanner.select();
let soundOn = false;

function applyScan(s: Settings) {
  if (s.scanEnabled) {
    if (!scanner.running || scanner.stepMs !== s.scanMs) scanner.start(s.scanMs);
  } else scanner.stop();
  const wantSound = s.scanEnabled && s.scanSound;
  if (wantSound && !soundOn) {
    soundOn = true;
    void soundSwitch.start().catch(() => (soundOn = false));
  } else if (!wantSound && soundOn) {
    soundOn = false;
    soundSwitch.stop();
  }
}

// acionador por TECLA: espaço/Enter (acionadores USB/Bluetooth costumam "apertar" essas teclas)
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!getSettings().scanEnabled || (e.key !== ' ' && e.key !== 'Enter')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      scanner.select();
    },
    true,
  );
  // o botão em foco também "clicaria" ao soltar o espaço: bloqueia para não escolher duas vezes
  window.addEventListener(
    'keyup',
    (e) => {
      if (!getSettings().scanEnabled || (e.key !== ' ' && e.key !== 'Enter')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}
import { getSettings, useSettings } from '../store/settings';

/* ============================================================================================
   Runtime do app: uma única instância de cada motor, ligada às configurações.
   Fluxo: provedor de entrada (cabeça/mouse) → DwellEngine (clique) + gestos → emergência.
   ============================================================================================ */

export const speaker = new Speaker();
export const sounds = new UiSounds();
export const predictor = new Predictor();
const siren = new Siren();

export const dwell = new DwellEngine({
  dwellMs: DEFAULT_SETTINGS.dwellMs,
  rearmPx: DEFAULT_SETTINGS.rearmPx,
  onFocus: () => sounds.focus(),
  onSelect: () => {
    sounds.click();
    if (getSettings().haptics) vibrate(15);
  },
});

/** referência estável para o OrbCursor */
export const subscribeCursor = (cb: (s: CursorState) => void) => dwell.subscribe(cb);

// ---------------------------------------------------------------- emergência
async function logAlert(e: EmergencyEvent) {
  const list = (await secureGet<EmergencyEvent[]>('alerts')) ?? [];
  const i = list.findIndex((x) => x.id === e.id);
  if (i >= 0) list[i] = e;
  else list.push(e);
  await secureSet('alerts', list.slice(-200));
}

export const emergency = new EmergencyController({
  startAlarm: () => {
    siren.start(getSettings().sounds.alarm);
    vibrate([500, 200, 500, 200, 500]);
  },
  stopAlarm: () => siren.stop(),
  speak: (t) => void speaker.speak(t, { rate: 1, volume: 1 }),
  log: (e) => void logAlert(e),
  onChange: (e) => {
    useApp.setState({ emergency: e, emergencyHits: 0, resting: false });
    if (e) void logAlert(e);
    // o alarme abre por cima de tudo: desarma para não clicar sozinho no que aparecer embaixo do cursor
    dwell.disarm();
  },
  // aviso no celular da família (ntfy), na hora; com fotos se o paciente autorizou
  notifyRemote: notifyFamily,
  notifyKindChange,
  notifyCancelled,
});

/** Toca o alarme por alguns segundos (botão "testar alarme" das configurações). */
export function testAlarm(ms = 1500) {
  siren.start(getSettings().sounds.alarm);
  setTimeout(() => siren.stop(), ms);
}

// ---------------------------------------------------------------- entrada
let video: HTMLVideoElement | null = null;
const getVideo = () => {
  if (!video) {
    video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);
  }
  return video;
};

let head: HeadInputProvider | null = null;
let active: InputProvider | null = null;
let unsubs: Array<() => void> = [];
const emergencySeq = new SequenceDetector(3, 8000);
let hitsTimer: ReturnType<typeof setTimeout> | undefined;

export const getHead = () => head;
// fotos de emergência saem da mesma câmera do rastreamento
setCaptureSource(() => head?.videoElement ?? null);
// "Estou indo" de um familiar: fala em voz alta no aparelho do paciente
setReplyHandler((title) => void speaker.speak(title.replace(/^\S+\s/, ''), { interrupt: false }));

const headConfig = (s: Settings): HeadConfig => ({
  calibration: s.calibration,
  sensitivity: s.sensitivity,
  invertX: s.invertX,
  invertY: s.invertY,
  smoothing: s.smoothing,
  deadZonePx: s.deadZonePx,
  longBlinkMs: s.longBlinkMs,
  targetFps: s.batterySaver ? 15 : 30,
  maxSpeedPxS: s.maxSpeedPxS,
});

function onGesture(g: GestureName, t: number) {
  const s = getSettings();
  useApp.setState({ lastGesture: { name: g, at: Date.now() } });

  // emergência por gesto: funciona em QUALQUER tela, inclusive no descanso e nas configurações
  const eg: GestureName | null =
    s.emergencyGesture === 'longBlink3' ? 'longBlink' : s.emergencyGesture === 'browRaise3' ? 'browRaise' : null;
  if (g === eg && !emergency.active) {
    if (emergencySeq.hit(t)) {
      emergency.trigger('gesture');
      return;
    }
    useApp.setState({ emergencyHits: emergencySeq.progress(t) });
    clearTimeout(hitsTimer);
    hitsTimer = setTimeout(() => useApp.setState({ emergencyHits: 0 }), emergencySeq.windowMs);
  }

  // seleção por gesto (desligada durante o descanso)
  if (g === s.selectGesture && s.scanEnabled) return scanner.select();
  if (g === s.selectGesture && !useApp.getState().resting) dwell.selectCurrent();
}

export function stopInput() {
  unsubs.forEach((u) => u());
  unsubs = [];
  active?.stop();
  active = null;
  useApp.setState((st) => ({ tracking: { ...st.tracking, status: 'off', mode: null, detected: false } }));
}

/** Liga o modo de controle. Retorna o erro (câmera negada etc.) ou null. */
export async function startInput(mode: InputMode): Promise<TrackerError | null> {
  stopInput();
  useApp.setState({ tracking: { status: 'starting', mode, detected: false, fps: 0, error: null } });
  if (mode === 'head') {
    head ??= new HeadInputProvider(getVideo(), import.meta.env.BASE_URL, headConfig(getSettings()));
    active = head;
  } else {
    active = new PointerInputProvider();
  }
  const p = active;
  // com a varredura ligada, a seta não clica sozinha (quem escolhe é o acionador)
  unsubs.push(p.onPointer((s) => !getSettings().scanEnabled && dwell.feed(s)));
  unsubs.push(p.onGesture(onGesture));
  unsubs.push(
    p.onStatus((st) => useApp.setState((a) => ({ tracking: { ...a.tracking, detected: st.detected, fps: st.fps } }))),
  );
  try {
    await p.start();
    useApp.setState((a) => ({ tracking: { ...a.tracking, status: 'on' } }));
    dwell.disarm();
    return null;
  } catch (err) {
    const e = (typeof err === 'string' ? err : 'unknown') as TrackerError;
    stopInput();
    useApp.setState({ tracking: { status: 'error', mode, detected: false, fps: 0, error: e } });
    return e;
  }
}

// ---------------------------------------------------------------- fala
let vocabTimer: ReturnType<typeof setTimeout> | undefined;
const saveVocab = () => {
  clearTimeout(vocabTimer);
  vocabTimer = setTimeout(() => void secureSet('vocab', predictor.exportUserModel()), 1000);
};

async function addHistory(text: string) {
  const h = (await secureGet<Array<{ text: string; at: number }>>('history')) ?? [];
  h.push({ text, at: Date.now() });
  await secureSet('history', h.slice(-300));
}

/** Fala o texto que a PESSOA escreveu: corrige acentos, aprende vocabulário, guarda histórico. */
export async function speakText(raw: string) {
  const text = finalizeText(raw);
  if (!text) return;
  // a barra mostra exatamente o que vai ser falado (já corrigido)
  if (useApp.getState().text === raw) useApp.getState().setText(text);
  predictor.learn(text);
  saveVocab();
  void addHistory(text);
  sounds.sent();
  const s = getSettings();
  if (s.useMyVoice && (await playFromBank(text))) return; // a própria voz da pessoa (banco de voz)
  await speaker.speak(text, { rate: s.speechRate, pitch: s.speechPitch });
}

/** Fala uma resposta pronta (Sim, Não...) sem aprender vocabulário. */
export async function say(text: string) {
  const s = getSettings();
  sounds.sent();
  if (s.useMyVoice && (await playFromBank(text))) return;
  return speaker.speak(text, { rate: s.speechRate, pitch: s.speechPitch });
}

export function clearLearnedVocabulary() {
  predictor.clearUserModel();
  void secureSet('vocab', predictor.exportUserModel());
}

// ---------------------------------------------------------------- tela sempre acesa
let wakeLock: { released: boolean } | null = null;
export async function keepScreenAwake() {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ released: boolean }> } })
      .wakeLock;
    wakeLock = (await wl?.request('screen')) ?? null;
  } catch {
    /* sem suporte: ok */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock?.released) void keepScreenAwake();
});

// ---------------------------------------------------------------- configurações → motores
function applySettings(s: Settings) {
  applyAppearance(s);
  dwell.configure(s.dwellMs, s.rearmPx);
  head?.configure(headConfig(s));
  speaker.setPreferred(s.voiceURI);
  setAutoCorrect(s.autoCorrect !== false);
  applyScan(s);
  document.documentElement.toggleAttribute('data-big-targets', !!s.bigTargets);
  emergencySeq.count = s.emergencyCount;
  emergencySeq.windowMs = s.emergencyWindowMs;
  sounds.volumes = s.sounds;
  emergency.remoteDelayMs = s.alertImmediate ? 0 : CANCEL_WINDOW_MS;
}

export async function initRuntime() {
  void requestPersistentStorage();
  await useSettings.getState().load();
  applySettings(getSettings());
  useSettings.subscribe((st, prev) => {
    if (st.settings !== prev.settings) applySettings(st.settings);
  });
  predictor.importUserModel(await secureGet<UserModel>('vocab'));
  await useFamily.getState().load();
  // Telegram: se o cuidador conectou um robô, escuta o "Iniciar" e o "Estou indo" da família
  await loadTelegram();
  startTelegramPolling();
  await useCare.getState().load();
  // lembretes: toca um sininho 3x, vibra e fala o lembrete
  setReminderRingHandler((d) => {
    let n = 0;
    const chime = setInterval(() => {
      sounds.sent();
      if (++n >= 3) clearInterval(chime);
    }, 700);
    vibrate([300, 150, 300]);
    setTimeout(() => void speaker.speak(`Lembrete: ${d.reminder.title}.`, { interrupt: false }), 2200);
  });
  startReminderScheduler();
  void startOutbox(); // avisos que ficaram sem enviar (sem internet) saem agora
  // sessão salva: quem já entrou (ou escolheu usar sem conta) vai direto para "Começar"
  const { session, account } = await auth.restore();
  const invite = new URLSearchParams(location.search).has('familia');
  const watching = ((await secureGet<unknown[]>('watch')) ?? []).length > 0;
  useApp.setState({
    session,
    account,
    // link de convite → modo familiar; quem só acompanha (sem conta de paciente) também vai direto
    screen: invite ? 'familyView' : session ? 'splash' : watching ? 'familyView' : 'landing',
  });
}

// ---------------------------------------------------------------- contas
export const auth: AuthProvider = new LocalAuthProvider();

export async function signOut() {
  await auth.signOut();
  stopInput();
  useApp.setState({ session: null, account: null, screen: 'landing', text: '' });
}

// ---------------------------------------------------------------- campainha "chamar cuidador"
/**
 * Campainha LOCAL (ding-dong 3x + voz): para pedir ajuda em algo simples sem disparar a emergência
 * e sem mandar alerta para a família.
 */
export function callCaregiver() {
  const ctx = getAudioContext();
  if (ctx) {
    const vol = Math.max(0.4, getSettings().sounds.alarm * 0.8);
    const tone = (freq: number, at: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 1.2);
    };
    for (let i = 0; i < 3; i++) {
      const t0 = ctx.currentTime + i * 1.6;
      tone(880, t0);
      tone(660, t0 + 0.5);
    }
  }
  vibrate([200, 100, 200]);
  setTimeout(() => void speaker.speak('Pode vir aqui, por favor?', { interrupt: false }), 4900);
}
