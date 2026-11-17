import { create } from 'zustand';
import { secureGet, secureSet } from '@lindauria/shared';
import { EMERGENCY_PHRASES, NtfyNotifier, newAlertTopic, type AlertMessage, type EmergencyEvent } from '@lindauria/safety';
import { getSettings, useSettings } from '../store/settings';
import { useApp } from '../store/app';

/**
 * Família: quem recebe os alertas de emergência no celular.
 *
 * Regras de consentimento (LGPD e respeito à pessoa):
 *  - o cuidador CADASTRA, mas ninguém recebe nada até o PRÓPRIO PACIENTE autorizar;
 *  - fotos são uma permissão separada, também autorizada pelo paciente;
 *  - aumentar permissões (ex.: passar a receber fotos) exige nova autorização;
 *  - o paciente pode tirar o acesso a qualquer momento.
 */

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  phone: string;
  /** tópico secreto deste familiar no servidor de notificações */
  topic: string;
  permissions: { alerts: boolean; photos: boolean };
  /** quando o paciente autorizou (null = ainda não autorizou / acesso retirado) */
  authorizedAt: number | null;
  createdAt: number;
}

export type Delivery = { text: 'sending' | 'sent' | 'failed'; photos: number; onTheWay?: boolean };

interface FamilyState {
  list: FamilyMember[];
  loaded: boolean;
  /** situação do envio na emergência atual, por familiar */
  delivery: Record<string, Delivery>;
  /** quantas vezes o alarme já foi reenviado sem resposta */
  resends: number;
  load: () => Promise<void>;
  add: (m: Pick<FamilyMember, 'name' | 'relation' | 'phone' | 'permissions'>) => FamilyMember;
  update: (id: string, m: Partial<Pick<FamilyMember, 'name' | 'relation' | 'phone' | 'permissions'>>) => void;
  authorize: (id: string) => void;
  revoke: (id: string) => void;
  remove: (id: string) => void;
}

const KEY = 'family';
const persist = (list: FamilyMember[]) => void secureSet(KEY, list);
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const useFamily = create<FamilyState>((set, get) => {
  const save = (list: FamilyMember[]) => {
    set({ list });
    persist(list);
  };
  return {
    list: [],
    loaded: false,
    delivery: {},
    resends: 0,
    load: async () => {
      if (get().loaded) return;
      set({ list: (await secureGet<FamilyMember[]>(KEY)) ?? [], loaded: true });
    },
    add: (m) => {
      const item: FamilyMember = { ...m, id: newId(), topic: newAlertTopic(), authorizedAt: null, createdAt: Date.now() };
      save([...get().list, item]);
      return item;
    },
    update: (id, m) =>
      save(
        get().list.map((x) => {
          if (x.id !== id) return x;
          const next = { ...x, ...m };
          // pediu MAIS acesso (ex.: fotos)? precisa de nova autorização do paciente
          const more = (m.permissions?.photos && !x.permissions.photos) || (m.permissions?.alerts && !x.permissions.alerts);
          return more ? { ...next, authorizedAt: null } : next;
        }),
      ),
    authorize: (id) => {
      const m = get().list.find((x) => x.id === id);
      save(get().list.map((x) => (x.id === id ? { ...x, authorizedAt: Date.now() } : x)));
      // o paciente autorizou fotos para esta pessoa → liga o envio de fotos na emergência
      if (m?.permissions.photos) useSettings.getState().update({ emergencyPhotos: true });
    },
    revoke: (id) => save(get().list.map((x) => (x.id === id ? { ...x, authorizedAt: null } : x))),
    remove: (id) => save(get().list.filter((x) => x.id !== id)),
  };
});

export const canReceiveAlerts = (m: FamilyMember) => !!m.authorizedAt && m.permissions.alerts;
export const canReceivePhotos = (m: FamilyMember) => canReceiveAlerts(m) && m.permissions.photos;

// ---------------------------------------------------------------------------------------------

export function patientDisplayName() {
  const s = getSettings().patientName.trim();
  if (s) return s;
  const acc = useApp.getState().account;
  return acc && acc.role === 'paciente' ? acc.name : 'o paciente';
}

const hhmm = (t = Date.now()) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const notifier = () => new NtfyNotifier(getSettings().alertServer);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stillActive = (e: EmergencyEvent) => useApp.getState().emergency?.id === e.id;

function setDelivery(id: string, patch: Partial<Delivery>) {
  useFamily.setState((st) => ({
    delivery: { ...st.delivery, [id]: { ...(st.delivery[id] ?? { text: 'sending', photos: 0 }), ...patch } },
  }));
}

/** envia e, se falhar (sem internet), tenta de novo a cada 8 s enquanto a emergência durar */
async function sendWithRetry(e: EmergencyEvent, m: FamilyMember, msg: AlertMessage) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      setDelivery(m.id, { text: 'sending' });
      await notifier().sendText(m.topic, msg);
      setDelivery(m.id, { text: 'sent' });
      return true;
    } catch {
      setDelivery(m.id, { text: 'failed' });
      if (!stillActive(e)) return false;
      await sleep(8000);
    }
  }
  return false;
}

// ---- fotos ----
let captureSource: () => HTMLVideoElement | null = () => null;
/** o engine informa de onde tirar a foto (a mesma câmera do rastreamento) */
export function setCaptureSource(fn: () => HTMLVideoElement | null) {
  captureSource = fn;
}

/** tira uma foto da câmera (a do rastreamento, se ligada; senão liga a câmera rapidinho) */
export async function capturePhoto(): Promise<Blob | null> {
  let v = captureSource();
  let temp: MediaStream | null = null;
  if (!v || v.readyState < 2 || !v.videoWidth) {
    try {
      temp = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = temp;
      await v.play();
      await sleep(500); // deixa a câmera ajustar a luz
    } catch {
      return null;
    }
  }
  const scale = Math.min(1, 960 / v.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * scale);
  c.height = Math.round(v.videoHeight * scale);
  c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
  temp?.getTracks().forEach((t) => t.stop());
  return new Promise((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.78));
}

const PHOTO_COUNT = 3;
const PHOTO_INTERVAL_MS = 6000;

async function sendPhotos(e: EmergencyEvent) {
  const name = patientDisplayName();
  for (let i = 0; i < PHOTO_COUNT && stillActive(e); i++) {
    const members = useFamily.getState().list.filter(canReceivePhotos);
    if (!members.length) return;
    const photo = await capturePhoto();
    if (photo) {
      const msg: AlertMessage = {
        title: `📷 Foto ${i + 1} de ${PHOTO_COUNT} — ${name}`,
        message: `Como ${name} está agora (${hhmm()}).`,
        priority: 5,
        tags: ['camera'],
      };
      await Promise.all(
        members.map((m) =>
          notifier()
            .sendPhoto(m.topic, photo, `lindauria-${i + 1}.jpg`, msg)
            .then(() => setDelivery(m.id, { photos: (useFamily.getState().delivery[m.id]?.photos ?? 0) + 1 }))
            .catch(() => undefined),
        ),
      );
    }
    await sleep(PHOTO_INTERVAL_MS);
  }
}

// ---- respostas da família ("Estou indo") ----
let replyHandler: (title: string) => void = () => undefined;
export function setReplyHandler(fn: (title: string) => void) {
  replyHandler = fn;
}
const replySources: EventSource[] = [];

function listenReplies(members: FamilyMember[]) {
  stopReplyListeners();
  const server = getSettings().alertServer.replace(/\/+$/, '');
  const since = Math.floor(Date.now() / 1000);
  for (const m of members) {
    try {
      const es = new EventSource(`${server}/${encodeURIComponent(m.topic)}/sse?since=${since}`);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { event: string; title?: string; tags?: string[] };
          if (msg.event === 'message' && msg.tags?.includes('reply')) {
            setDelivery(m.id, { onTheWay: true });
            replyHandler(msg.title ?? `${m.name} está a caminho`);
          }
        } catch {
          /* mensagem inesperada: ignora */
        }
      };
      replySources.push(es);
    } catch {
      /* sem EventSource: segue sem respostas */
    }
  }
  // para de escutar depois de 1 hora, por segurança
  setTimeout(stopReplyListeners, 60 * 60 * 1000);
}

export function stopReplyListeners() {
  while (replySources.length) replySources.pop()?.close();
}

// ---- ganchos da emergência ----

/** Avisa NA HORA todos os familiares autorizados. */
export async function notifyFamily(e: EmergencyEvent): Promise<boolean> {
  await useFamily.getState().load();
  const members = useFamily.getState().list.filter(canReceiveAlerts);
  useFamily.setState({ delivery: {}, resends: 0 });
  if (!members.length) return false;
  const name = patientDisplayName();
  const msg: AlertMessage = {
    title: `🆘 EMERGÊNCIA — ${name}`,
    message: `${EMERGENCY_PHRASES[e.kind]}\nAlarme disparado às ${hhmm(e.at)}. Vá até ${name} agora.\nEm risco de vida, ligue 192 (SAMU).`,
    priority: 5,
    tags: ['rotating_light'],
  };
  listenReplies(members);
  if (getSettings().emergencyPhotos) void sendPhotos(e);
  void escalate(e, msg);
  await Promise.all(members.map((m) => sendWithRetry(e, m, msg)));
  return true;
}

const RESEND_EVERY_MS = 60_000;
const MAX_RESENDS = 10;
const someoneOnTheWay = () => Object.values(useFamily.getState().delivery).some((d) => d.onTheWay);

/**
 * Reenvio: enquanto NINGUÉM responder "Estou indo", o alarme é reenviado a cada 1 minuto
 * (até 10 vezes) — assim um celular no silencioso, sem sinal ou longe não deixa o paciente sem ajuda.
 */
async function escalate(e: EmergencyEvent, first: AlertMessage) {
  for (let n = 1; n <= MAX_RESENDS; n++) {
    await sleep(RESEND_EVERY_MS);
    if (!stillActive(e) || someoneOnTheWay()) return;
    useFamily.setState({ resends: n });
    const msg: AlertMessage = {
      ...first,
      title: `🆘 AINDA SEM RESPOSTA (${n}) — ${patientDisplayName()}`,
      tags: ['rotating_light', 'repeat'],
    };
    for (const m of useFamily.getState().list.filter(canReceiveAlerts)) {
      void notifier().sendText(m.topic, msg).catch(() => setDelivery(m.id, { text: 'failed' }));
    }
  }
}

/** Alarme de TESTE: toca de verdade no celular da família (para conferir se está alto). */
export async function sendTestAlarm(): Promise<{ sent: number; failed: number }> {
  const members = useFamily.getState().list.filter(canReceiveAlerts);
  const name = patientDisplayName();
  let failed = 0;
  await Promise.all(
    members.map((m) =>
      notifier()
        .sendText(m.topic, {
          title: `🔔 TESTE DE ALARME — ${name}`,
          message: 'Isto é só um teste. Se o celular tocou alto, está tudo certo! Toque em "Estou indo" para parar.',
          priority: 5,
          tags: ['rotating_light', 'test-alarm'],
        })
        .catch(() => {
          failed++;
        }),
    ),
  );
  return { sent: members.length - failed, failed };
}

export function notifyKindChange(e: EmergencyEvent) {
  const name = patientDisplayName();
  for (const m of useFamily.getState().list.filter(canReceiveAlerts)) {
    void sendWithRetry(e, m, {
      title: `🆘 ATUALIZAÇÃO — ${name}`,
      message: `${EMERGENCY_PHRASES[e.kind]} (${hhmm()})`,
      priority: 5,
      tags: ['rotating_light'],
    });
  }
}

export function notifyCancelled(e: EmergencyEvent) {
  setTimeout(stopReplyListeners, 2 * 60 * 1000); // ainda ouve "estou indo" por 2 minutos
  const name = patientDisplayName();
  const msg: AlertMessage = {
    title: `✅ Alarme desligado — ${name}`,
    message: e.accidental
      ? `O alarme das ${hhmm(e.at)} foi cancelado: foi sem querer.`
      : `O alarme das ${hhmm(e.at)} foi desligado às ${hhmm(e.cancelledAt ?? Date.now())}.`,
    priority: 3,
    tags: ['white_check_mark'],
  };
  for (const m of useFamily.getState().list.filter(canReceiveAlerts)) {
    void notifier().sendText(m.topic, msg).catch(() => undefined);
  }
}

/** mensagem de teste para um familiar (para conferir se o alerta chega) */
export function sendTest(m: FamilyMember) {
  const name = patientDisplayName();
  return notifier().sendText(m.topic, {
    title: `🔔 Teste do LindaurIA`,
    message: `Olá, ${m.name}! Se você recebeu isto, os alertas de emergência de ${name} vão chegar para você.`,
    priority: 4,
    tags: ['bell'],
  });
}

/** código de acesso legível: "abcde-fghij-klmno" */
export const accessCode = (m: FamilyMember) => m.topic.replace('lindauria-', '').replace(/(.{5})(?=.)/g, '$1-');

/** link que abre o LindaurIA direto no modo familiar, com o código preenchido */
export const inviteLink = (m: FamilyMember) => `${location.origin}${import.meta.env.BASE_URL}?familia=${encodeURIComponent(accessCode(m))}`;

/** texto do convite (WhatsApp etc.) */
export function inviteText(m: FamilyMember) {
  const server = getSettings().alertServer.replace(/\/+$/, '');
  const custom = server !== 'https://ntfy.sh';
  return [
    `Olá, ${m.name}! Você foi autorizado(a) a receber os alertas de emergência de ${patientDisplayName()} pelo LindaurIA.`,
    '',
    `🔑 Seu código de acesso: ${accessCode(m)}`,
    '',
    'Opção A — no próprio LindaurIA:',
    `   abra ${inviteLink(m)} (ou toque em "Sou familiar" e digite o código).`,
    '',
    'Opção B — para receber até com o celular bloqueado, instale o app "ntfy" (grátis):',
    '   Android: https://play.google.com/store/apps/details?id=io.heckel.ntfy',
    '   iPhone: https://apps.apple.com/app/ntfy/id1625396347',
    `   No ntfy, toque em "+" e digite: ${m.topic}`,
    custom ? `   (em "Usar outro servidor", coloque: ${server})` : null,
    '   Ative a prioridade máxima para tocar mesmo no modo silencioso.',
    '',
    'Guarde este código: ele é como uma senha.',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}
