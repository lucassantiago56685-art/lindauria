import { create } from 'zustand';
import { getAudioContext, secureGet, secureSet, unlockAudio, vibrate } from '@lindauria/shared';
import { NtfyNotifier, Siren } from '@lindauria/safety';
import { getSettings } from '../store/settings';

/* =============================================================================================
   Modo FAMILIAR: o celular de um familiar acompanha um paciente pelo CÓDIGO DE ACESSO
   (o tópico secreto que o paciente autorizou). Recebe em tempo real:
     - alerta de emergência → alarme sonoro + vibração + notificação do sistema;
     - fotos da emergência;
     - "alarme desligado".
   E pode responder "Estou indo", que aparece e é falado no aparelho do paciente.

   Limite honesto: um site só recebe alertas enquanto está aberto (mesmo em segundo plano, por um
   tempo). Para receber com o celular bloqueado/app fechado, use também o app ntfy.
   ============================================================================================= */

export interface WatchedPatient {
  code: string;
  label: string;
  addedAt: number;
}

export interface FeedMessage {
  id: string;
  code: string;
  time: number; // segundos
  title: string;
  message: string;
  priority: number;
  tags: string[];
  photoUrl: string | null;
  kind: 'alarm' | 'update' | 'photo' | 'resolved' | 'reply' | 'test' | 'reminder' | 'other';
}

type Conn = 'connecting' | 'online' | 'offline';

interface WatchState {
  patients: WatchedPatient[];
  loaded: boolean;
  feed: FeedMessage[];
  conn: Record<string, Conn>;
  /** emergência em andamento por código (última mensagem de alarme sem "desligado" depois) */
  activeAlarm: Record<string, FeedMessage | null>;
  alarmSounding: boolean;
  /** quando o familiar respondeu/silenciou por último (por código) — reenvios não tocam de novo */
  ackAt: Record<string, number>;
  /** tela acesa garantida (wake lock) */
  awake: boolean;
  load: () => Promise<void>;
  add: (code: string, label?: string) => Promise<WatchedPatient | null>;
  remove: (code: string) => void;
}

export const CODE_PREFIX = 'lindauria-';

/** aceita o código com ou sem o prefixo, espaços e traços */
export function normalizeCode(input: string): string | null {
  let c = input.trim().toLowerCase().replace(/[\s-]+/g, '');
  c = c.replace(/^lindauria/, '');
  if (!/^[a-z2-7]{15}$/.test(c)) return null;
  return CODE_PREFIX + c;
}

/** "lindauria-abcdefghijklmno" → "abcde-fghij-klmno" (mais fácil de ler e ditar) */
export const prettyCode = (topic: string) => topic.replace(CODE_PREFIX, '').replace(/(.{5})(?=.)/g, '$1-');

const KEY = 'watch';
const siren = new Siren();
const sources = new Map<string, EventSource>();
const seen = new Set<string>();
let openedAt = Date.now() / 1000;

function classify(tags: string[], priority: number, hasPhoto: boolean): FeedMessage['kind'] {
  if (tags.includes('reply')) return 'reply';
  if (tags.includes('white_check_mark')) return 'resolved';
  if (hasPhoto || tags.includes('camera')) return 'photo';
  if (tags.includes('test-alarm')) return 'alarm';
  if (tags.includes('bell')) return 'test';
  if (tags.includes('alarm_clock')) return 'reminder';
  if (tags.includes('rotating_light') && priority >= 5) return 'alarm';
  return 'other';
}

async function showSystemNotification(title: string, body: string, image?: string | null) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration(`${import.meta.env.BASE_URL}notify/`);
    const opts: NotificationOptions & { vibrate?: number[]; requireInteraction?: boolean; image?: string } = {
      body,
      icon: `${import.meta.env.BASE_URL}icon.svg`,
      tag: 'lindauria-alarme',
      requireInteraction: true,
      vibrate: [400, 150, 400, 150, 400],
    };
    if (image) opts.image = image;
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    /* sem notificação do sistema: o alarme na tela continua */
  }
}

let vibeTimer: ReturnType<typeof setInterval> | null = null;
let renotifyTimer: ReturnType<typeof setInterval> | null = null;

/** alarme INSISTENTE: sirene contínua + vibração a cada 3 s + notificação repetida a cada 30 s */
export function startAlarmSound(title?: string, body?: string) {
  siren.start(1);
  vibrate([600, 200, 600, 200, 600]);
  if (!vibeTimer) vibeTimer = setInterval(() => vibrate([600, 200, 600]), 3000);
  if (title && !renotifyTimer) renotifyTimer = setInterval(() => void showSystemNotification(title, body ?? ''), 30_000);
  useWatch.setState({ alarmSounding: true });
}
export function stopAlarmSound(code?: string) {
  siren.stop();
  if (vibeTimer) clearInterval(vibeTimer);
  if (renotifyTimer) clearInterval(renotifyTimer);
  vibeTimer = renotifyTimer = null;
  useWatch.setState((st) => ({ alarmSounding: false, ackAt: code ? { ...st.ackAt, [code]: Date.now() / 1000 } : st.ackAt }));
}

// ---- tela sempre acesa no modo familiar (para não perder o alarme) ----
let wakeLock: { released: boolean; release: () => Promise<void> } | null = null;
export async function keepAwake() {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof wakeLock> } }).wakeLock;
    wakeLock = (await wl?.request('screen')) ?? null;
    useWatch.setState({ awake: !!wakeLock });
  } catch {
    useWatch.setState({ awake: false });
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && useWatch.getState().patients.length && (!wakeLock || wakeLock.released)) void keepAwake();
  });
}

/** um toque libera tudo: som, notificações e tela acesa */
export async function enableEverything() {
  const sound = await unlockAudio();
  const perm = await enableNotifications();
  await keepAwake();
  return { sound, perm };
}

function onMessage(code: string, raw: string) {
  let m: {
    id: string;
    time: number;
    event: string;
    title?: string;
    message?: string;
    priority?: number;
    tags?: string[];
    attachment?: { url: string; type?: string };
  };
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.event !== 'message' || seen.has(m.id)) return;
  seen.add(m.id);
  const tags = m.tags ?? [];
  const photoUrl = m.attachment?.type?.startsWith('image/') ? m.attachment.url : null;
  const item: FeedMessage = {
    id: m.id,
    code,
    time: m.time,
    title: m.title ?? '',
    message: m.message ?? '',
    priority: m.priority ?? 3,
    tags,
    photoUrl,
    kind: classify(tags, m.priority ?? 3, !!photoUrl),
  };
  if (item.title.startsWith('🆘 ATUALIZAÇÃO')) item.kind = 'update';
  const fresh = item.time >= openedAt - 5;

  useWatch.setState((st) => {
    const feed = [item, ...st.feed].sort((a, b) => b.time - a.time).slice(0, 150);
    const activeAlarm = { ...st.activeAlarm };
    if (item.kind === 'alarm' || item.kind === 'update') activeAlarm[code] = item;
    if (item.kind === 'resolved') activeAlarm[code] = null;
    return { feed, activeAlarm };
  });

  if (!fresh) return; // histórico: mostra na lista, mas não toca alarme
  if (item.kind === 'alarm' || item.kind === 'update') {
    // reenvio de um alarme que este familiar já respondeu: só atualiza a lista, não toca de novo
    const ack = useWatch.getState().ackAt[code] ?? 0;
    if (tags.includes('repeat') && ack >= item.time - 15 * 60) return;
    startAlarmSound(item.title, item.message);
    void showSystemNotification(item.title, item.message);
  } else if (item.kind === 'photo') {
    void showSystemNotification(item.title, item.message, item.photoUrl);
  } else if (item.kind === 'reminder') {
    vibrate([300, 150, 300]);
    void showSystemNotification(item.title, item.message);
  } else if (item.kind === 'reply') {
    // alguém da família já está indo: avisa os outros (sem parar o alarme deles)
    void showSystemNotification(item.title, item.message);
  } else if (item.kind === 'resolved') {
    stopAlarmSound(code);
    void showSystemNotification(item.title, item.message);
  }
}

function connect(code: string) {
  if (sources.has(code)) return;
  const server = getSettings().alertServer.replace(/\/+$/, '');
  const es = new EventSource(`${server}/${encodeURIComponent(code)}/sse?since=12h`);
  sources.set(code, es);
  const setConn = (c: Conn) => useWatch.setState((st) => ({ conn: { ...st.conn, [code]: c } }));
  setConn('connecting');
  es.onopen = () => setConn('online');
  es.onerror = () => setConn('offline'); // o navegador reconecta sozinho
  es.onmessage = (ev) => onMessage(code, ev.data);
}

function disconnect(code: string) {
  sources.get(code)?.close();
  sources.delete(code);
}

export const useWatch = create<WatchState>((set, get) => ({
  patients: [],
  loaded: false,
  feed: [],
  conn: {},
  activeAlarm: {},
  alarmSounding: false,
  ackAt: {},
  awake: false,
  load: async () => {
    if (get().loaded) return;
    const patients = (await secureGet<WatchedPatient[]>(KEY)) ?? [];
    set({ patients, loaded: true });
  },
  add: async (input, label) => {
    const code = normalizeCode(input);
    if (!code) return null;
    await get().load();
    const existing = get().patients.find((p) => p.code === code);
    if (existing) return existing;
    const p: WatchedPatient = { code, label: label?.trim() || 'Paciente', addedAt: Date.now() };
    const patients = [...get().patients, p];
    set({ patients });
    await secureSet(KEY, patients);
    connect(code);
    return p;
  },
  remove: (code) => {
    disconnect(code);
    const patients = get().patients.filter((p) => p.code !== code);
    set((st) => ({ patients, feed: st.feed.filter((f) => f.code !== code) }));
    void secureSet(KEY, patients);
  },
}));

/** liga as conexões de todos os pacientes acompanhados (ao abrir o modo familiar) */
export async function startWatching() {
  openedAt = Date.now() / 1000;
  await useWatch.getState().load();
  for (const p of useWatch.getState().patients) connect(p.code);
}

/** pede permissão de notificação e registra o "ajudante" que mostra notificações no Android */
export async function enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
  getAudioContext(); // aproveita o toque para liberar o som do alarme
  if (!('Notification' in window)) return 'unsupported';
  try {
    await navigator.serviceWorker?.register(`${import.meta.env.BASE_URL}notify-sw.js`, { scope: `${import.meta.env.BASE_URL}notify/` });
  } catch {
    /* sem service worker: usa notificação simples */
  }
  return Notification.requestPermission();
}

/** "Estou indo": aparece e é falado no aparelho do paciente */
export function replyOnMyWay(code: string, myName: string) {
  const name = myName.trim() || 'Sua família';
  return new NtfyNotifier(getSettings().alertServer).sendText(code, {
    title: `🏃 ${name} está a caminho`,
    message: `${name} recebeu o alerta e está indo até você.`,
    priority: 3,
    tags: ['reply', 'runner'],
  });
}
