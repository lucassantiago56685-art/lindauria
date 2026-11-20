import { create } from "zustand";
import { secureGet, secureSet } from "@lindauria/shared";
import {
  EMERGENCY_PHRASES,
  NtfyNotifier,
  newAlertTopic,
  type AlertMessage,
  type EmergencyEvent,
} from "@lindauria/safety";
import { getSettings, useSettings } from "../store/settings";
import { enqueue, setOutboxDeliveredHandler, setOutboxSender } from "./outbox";
import { useApp } from "../store/app";
import {
  answerButton,
  sendTelegramAlert,
  sendTelegramPhoto,
  sendTelegramText,
  setTelegramUpdateHandler,
  telegramLink,
  useTelegram,
} from "./telegram";

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
  /** conversa do Telegram deste familiar (ele tocou em "Iniciar" no link do convite) */
  telegramChatId?: number;
  telegramName?: string;
}

export type Delivery = {
  text: "sending" | "sent" | "failed" | "queued";
  photos: number;
  onTheWay?: boolean;
};

interface FamilyState {
  list: FamilyMember[];
  loaded: boolean;
  /** situação do envio na emergência atual, por familiar */
  delivery: Record<string, Delivery>;
  /** quantas vezes o alarme já foi reenviado sem resposta */
  resends: number;
  load: () => Promise<void>;
  add: (
    m: Pick<FamilyMember, "name" | "relation" | "phone" | "permissions">,
  ) => FamilyMember;
  update: (
    id: string,
    m: Partial<
      Pick<FamilyMember, "name" | "relation" | "phone" | "permissions">
    >,
  ) => void;
  authorize: (id: string) => void;
  revoke: (id: string) => void;
  remove: (id: string) => void;
  linkTelegram: (id: string, chatId: number, name: string) => void;
  unlinkTelegram: (id: string) => void;
}

const KEY = "family";
const persist = (list: FamilyMember[]) => void secureSet(KEY, list);
const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

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
      const item: FamilyMember = {
        ...m,
        id: newId(),
        topic: newAlertTopic(),
        authorizedAt: null,
        createdAt: Date.now(),
      };
      save([...get().list, item]);
      return item;
    },
    update: (id, m) =>
      save(
        get().list.map((x) => {
          if (x.id !== id) return x;
          const next = { ...x, ...m };
          // pediu MAIS acesso (ex.: fotos)? precisa de nova autorização do paciente
          const more =
            (m.permissions?.photos && !x.permissions.photos) ||
            (m.permissions?.alerts && !x.permissions.alerts);
          return more ? { ...next, authorizedAt: null } : next;
        }),
      ),
    authorize: (id) => {
      const m = get().list.find((x) => x.id === id);
      save(
        get().list.map((x) =>
          x.id === id ? { ...x, authorizedAt: Date.now() } : x,
        ),
      );
      // o paciente autorizou fotos para esta pessoa → liga o envio de fotos na emergência
      if (m?.permissions.photos)
        useSettings.getState().update({ emergencyPhotos: true });
    },
    revoke: (id) =>
      save(
        get().list.map((x) => (x.id === id ? { ...x, authorizedAt: null } : x)),
      ),
    remove: (id) => save(get().list.filter((x) => x.id !== id)),
    // a mesma conversa do Telegram só fica ligada a UM familiar
    linkTelegram: (id, chatId, name) =>
      save(
        get().list.map((x) =>
          x.id === id
            ? { ...x, telegramChatId: chatId, telegramName: name }
            : x.telegramChatId === chatId
              ? { ...x, telegramChatId: undefined, telegramName: undefined }
              : x,
        ),
      ),
    unlinkTelegram: (id) =>
      save(
        get().list.map((x) =>
          x.id === id
            ? { ...x, telegramChatId: undefined, telegramName: undefined }
            : x,
        ),
      ),
  };
});

export const canReceiveAlerts = (m: FamilyMember) =>
  !!m.authorizedAt && m.permissions.alerts;
export const canReceivePhotos = (m: FamilyMember) =>
  canReceiveAlerts(m) && m.permissions.photos;

// ---------------------------------------------------------------------------------------------

export function patientDisplayName() {
  const s = getSettings().patientName.trim();
  if (s) return s;
  const acc = useApp.getState().account;
  return acc && acc.role === "paciente" ? acc.name : "o paciente";
}

const hhmm = (t = Date.now()) =>
  new Date(t).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
const notifier = () => new NtfyNotifier(getSettings().alertServer);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stillActive = (e: EmergencyEvent) =>
  useApp.getState().emergency?.id === e.id;

type Target = { topic: string; telegramChatId?: number };

/**
 * Envia um aviso para UM familiar por todos os caminhos que ele tem.
 * Se ele conectou o Telegram, o Telegram é o caminho principal (só conta como entregue se o
 * Telegram aceitou); o ntfy vai junto, como reserva (para quem acompanha pelo site ou app ntfy).
 */
export async function deliver(m: Target, msg: AlertMessage): Promise<void> {
  const ntfy = notifier().sendText(m.topic, msg);
  if (m.telegramChatId && useTelegram.getState().bot) {
    ntfy.catch(() => undefined);
    await sendTelegramAlert(m.telegramChatId, msg);
  } else await ntfy;
}

async function deliverPhoto(
  m: Target,
  photo: Blob,
  name: string,
  msg: AlertMessage,
): Promise<void> {
  const ntfy = notifier().sendPhoto(m.topic, photo, name, msg);
  if (m.telegramChatId && useTelegram.getState().bot) {
    ntfy.catch(() => undefined);
    await sendTelegramPhoto(
      m.telegramChatId,
      photo,
      `${msg.title}\n${msg.message}`,
    );
  } else await ntfy;
}

// a fila (sem internet) também manda pelos dois caminhos
setOutboxSender((item) =>
  deliver({ topic: item.topic, telegramChatId: item.chatId }, item.msg),
);

function setDelivery(id: string, patch: Partial<Delivery>) {
  useFamily.setState((st) => ({
    delivery: {
      ...st.delivery,
      [id]: {
        ...(st.delivery[id] ?? { text: "sending", photos: 0 }),
        ...patch,
      },
    },
  }));
}

/**
 * Envia; se falhar (sem internet), tenta mais 2 vezes e então coloca na FILA de envio:
 * o aviso sai sozinho quando a conexão voltar (mesmo que o app seja reaberto).
 */
async function sendWithRetry(
  e: EmergencyEvent,
  m: FamilyMember,
  msg: AlertMessage,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) break;
    try {
      setDelivery(m.id, { text: "sending" });
      await deliver(m, msg);
      setDelivery(m.id, { text: "sent" });
      return true;
    } catch {
      setDelivery(m.id, { text: "failed" });
      await sleep(3000);
    }
  }
  setDelivery(m.id, { text: "queued" });
  enqueue({
    id: `${e.id}-${m.id}`,
    topic: m.topic,
    chatId: m.telegramChatId,
    msg,
    memberId: m.id,
    kind: "emergency",
  });
  return false;
}

// quando a fila consegue enviar, a tela de emergência mostra "avisado(a)"
setOutboxDeliveredHandler((item) => {
  if (
    item.kind === "emergency" &&
    item.memberId &&
    useFamily.getState().delivery[item.memberId]
  ) {
    setDelivery(item.memberId, { text: "sent" });
  }
});

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
      temp = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      v = document.createElement("video");
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
  const c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * scale);
  c.height = Math.round(v.videoHeight * scale);
  c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
  temp?.getTracks().forEach((t) => t.stop());
  return new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.78));
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
        tags: ["camera"],
      };
      await Promise.all(
        members.map((m) =>
          deliverPhoto(m, photo, `lindauria-${i + 1}.jpg`, msg)
            .then(() =>
              setDelivery(m.id, {
                photos: (useFamily.getState().delivery[m.id]?.photos ?? 0) + 1,
              }),
            )
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

// ---- Telegram: "Iniciar" (liga a conversa ao familiar) e "Estou indo" ----
/** código que vai no link do Telegram: é o mesmo segredo do código de acesso */
export const telegramCode = (m: FamilyMember) =>
  m.topic.replace("lindauria-", "");
export const memberTelegramLink = (m: FamilyMember) => {
  const bot = useTelegram.getState().bot;
  return bot?.username ? telegramLink(bot.username, telegramCode(m)) : null;
};

function familyOnTheWay(m: FamilyMember, chatId: number) {
  if (useFamily.getState().delivery[m.id])
    setDelivery(m.id, { onTheWay: true });
  replyHandler(`🏃 ${m.name} está a caminho`);
  void sendTelegramText(
    chatId,
    `👍 Avisei ${patientDisplayName()}: “${m.name} está a caminho”.`,
  ).catch(() => undefined);
}

setTelegramUpdateHandler(async (u) => {
  await useFamily.getState().load();
  const list = useFamily.getState().list;
  const byChat = (chatId: number) =>
    list.find((x) => x.telegramChatId === chatId);
  const name = patientDisplayName();

  if (u.callback_query) {
    const q = u.callback_query;
    const chatId = q.message?.chat.id;
    const m = chatId != null ? byChat(chatId) : undefined;
    await answerButton(
      q.id,
      m ? "Avisado! Obrigado." : "Use o link de convite do cuidador.",
    ).catch(() => undefined);
    if (m && chatId != null && q.data === "going") familyOnTheWay(m, chatId);
    return;
  }

  const msg = u.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const start = text.match(/^\/start(?:\s+(\S+))?/);
  if (start) {
    const m = start[1]
      ? list.find((x) => telegramCode(x) === start[1].toLowerCase())
      : undefined;
    if (!m) {
      await sendTelegramText(
        chatId,
        "Olá! Este é o robô de alertas do LindaurIA. Para receber os avisos, toque no link de convite que o cuidador enviou para você.",
      );
      return;
    }
    useFamily
      .getState()
      .linkTelegram(m.id, chatId, msg.from?.first_name ?? m.name);
    await sendTelegramText(
      chatId,
      [
        `✅ Pronto, ${m.name}! Os alertas de ${name} vão chegar AQUI: emergência${m.permissions.photos ? " (com fotos)" : ""} e lembretes de remédio/comida.`,
        canReceiveAlerts(m)
          ? ""
          : `⏳ Falta só ${name} autorizar no LindaurIA. Depois disso, os avisos começam.`,
        "",
        "Para não perder um alarme:",
        "• Não silencie esta conversa.",
        "• Toque no nome do robô (lá em cima) → Notificações → escolha um som bem alto.",
        "• iPhone: com a chave do silencioso ligada, o aviso aparece sem som.",
        "",
        "Quando chegar um alarme, toque em “🏃 Estou indo”: o LindaurIA fala em voz alta para quem está com a pessoa.",
      ]
        .filter((l, i, a) => l !== "" || a[i - 1] !== "")
        .join("\n"),
    );
    return;
  }
  const m = byChat(chatId);
  if (!m) {
    await sendTelegramText(
      chatId,
      "Para receber os alertas, toque no link de convite que o cuidador enviou para você.",
    );
    return;
  }
  // respondeu escrevendo (ex.: "estou indo"), em até 30 minutos
  if (
    /\b(estou indo|t[oô] indo|indo a[ií]|chegando|a caminho|j[aá] vou|vou a[ií])\b/i.test(
      text,
    ) &&
    Date.now() / 1000 - msg.date < 1800
  ) {
    familyOnTheWay(m, chatId);
  } else {
    await sendTelegramText(
      chatId,
      "Recebi. Para avisar que está indo, toque em “🏃 Estou indo” no alarme ou escreva “estou indo”.",
    );
  }
});
const replySources: EventSource[] = [];

function listenReplies(members: FamilyMember[]) {
  stopReplyListeners();
  const server = getSettings().alertServer.replace(/\/+$/, "");
  const since = Math.floor(Date.now() / 1000);
  for (const m of members) {
    try {
      const es = new EventSource(
        `${server}/${encodeURIComponent(m.topic)}/sse?since=${since}`,
      );
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as {
            event: string;
            title?: string;
            tags?: string[];
          };
          if (msg.event === "message" && msg.tags?.includes("reply")) {
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
    tags: ["rotating_light"],
  };
  listenReplies(members);
  if (getSettings().emergencyPhotos) void sendPhotos(e);
  void escalate(e, msg);
  await Promise.all(members.map((m) => sendWithRetry(e, m, msg)));
  return true;
}

const RESEND_EVERY_MS = 60_000;
const MAX_RESENDS = 10;
const someoneOnTheWay = () =>
  Object.values(useFamily.getState().delivery).some((d) => d.onTheWay);

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
      tags: ["rotating_light", "repeat"],
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      continue; // a fila já guarda o 1º aviso
    for (const m of useFamily.getState().list.filter(canReceiveAlerts)) {
      void deliver(m, msg).catch(() => undefined);
    }
  }
}

/** Alarme de TESTE: toca de verdade no celular da família (para conferir se está alto). */
export async function sendTestAlarm(): Promise<{
  sent: number;
  failed: number;
  /** uma linha por familiar, dizendo POR ONDE foi ou POR QUE não foi */
  report: string[];
}> {
  const all = useFamily.getState().list;
  const members = all.filter(canReceiveAlerts);
  const name = patientDisplayName();
  const hasBot = !!useTelegram.getState().bot;
  let failed = 0;
  const report: string[] = all
    .filter((m) => !canReceiveAlerts(m))
    .map(
      (m) =>
        `⏳ ${m.name}: falta o paciente autorizar — não recebe nada ainda.`,
    );
  await Promise.all(
    members.map((m) =>
      deliver(m, {
        title: `🔔 TESTE DE ALARME — ${name}`,
        message:
          'Isto é só um teste. Se o celular tocou alto, está tudo certo! Toque em "Estou indo" para parar.',
        priority: 5,
        tags: ["rotating_light", "test-alarm"],
      })
        .then(() =>
          report.push(
            m.telegramChatId && hasBot
              ? `✔ ${m.name}: entregue no Telegram.`
              : hasBot
                ? `⚠ ${m.name}: NÃO está no Telegram (não tocou em INICIAR no link do convite). Foi só pelo site/ntfy.`
                : `✔ ${m.name}: enviado pelo ntfy (Telegram não configurado).`,
          ),
        )
        .catch((e: unknown) => {
          failed++;
          report.push(`✘ ${m.name}: ${explainTelegramError(e)}`);
        }),
    ),
  );
  return { sent: members.length - failed, failed, report };
}

/** traduz o erro do Telegram para algo que a família entende */
function explainTelegramError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/blocked by the user/i.test(msg))
    return 'bloqueou o robô no Telegram. Peça para abrir o robô e tocar em "Desbloquear"/"Reiniciar".';
  if (/chat not found|user is deactivated/i.test(msg))
    return "o Telegram não achou a conversa. Envie o convite de novo e peça para tocar em INICIAR.";
  if (/Unauthorized/i.test(msg))
    return "o token do robô não vale mais. Configure o Telegram de novo.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg))
    return "sem internet neste aparelho.";
  return `erro do Telegram: ${msg}`;
}

export function notifyKindChange(e: EmergencyEvent) {
  const name = patientDisplayName();
  for (const m of useFamily.getState().list.filter(canReceiveAlerts)) {
    void sendWithRetry(e, m, {
      title: `🆘 ATUALIZAÇÃO — ${name}`,
      message: `${EMERGENCY_PHRASES[e.kind]} (${hhmm()})`,
      priority: 5,
      tags: ["rotating_light"],
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
    tags: ["white_check_mark"],
  };
  for (const m of useFamily.getState().list.filter(canReceiveAlerts)) {
    void deliver(m, msg).catch(() => undefined);
  }
}

/** mensagem de teste para um familiar (para conferir se o alerta chega) */
export function sendTest(m: FamilyMember) {
  const name = patientDisplayName();
  return deliver(m, {
    title: `🔔 Teste do LindaurIA`,
    message: `Olá, ${m.name}! Se você recebeu isto, os alertas de emergência de ${name} vão chegar para você.`,
    priority: 4,
    tags: ["bell"],
  });
}

/** código de acesso legível: "abcde-fghij-klmno" */
export const accessCode = (m: FamilyMember) =>
  m.topic.replace("lindauria-", "").replace(/(.{5})(?=.)/g, "$1-");

/**
 * Endereço PÚBLICO do app (com certificado de verdade). O convite sempre aponta para ele, mesmo
 * que o paciente esteja usando o app pelo computador de casa (192.168..., que o celular de fora não abre).
 */
export const PUBLIC_APP_URL: string =
  import.meta.env.VITE_PUBLIC_URL ||
  "https://lucassantiago56685-art.github.io/lindauria/";
const isPrivateHost = (h: string) =>
  h === "localhost" || /^(127.|10.|192.168.|172.(1[6-9]|2d|3[01]).)/.test(h);
export const appUrl = () =>
  typeof location !== "undefined" && !isPrivateHost(location.hostname)
    ? `${location.origin}${import.meta.env.BASE_URL}`
    : PUBLIC_APP_URL;

/** link que abre o LindaurIA direto no modo familiar e JÁ conecta (só falta ativar o som) */
export const inviteLink = (m: FamilyMember) => {
  const nome = patientDisplayName();
  return `${appUrl()}?familia=${encodeURIComponent(accessCode(m))}${nome && !/paciente/i.test(nome) ? `&nome=${encodeURIComponent(nome)}` : ""}`;
};

/** texto do convite (WhatsApp etc.) */
export function inviteText(m: FamilyMember) {
  const tg = memberTelegramLink(m);
  if (tg) {
    return [
      `Olá, ${m.name}! Você vai receber no TELEGRAM os alertas de ${patientDisplayName()} (emergência e lembretes de remédio/comida), pelo LindaurIA.`,
      "",
      "PASSO 1 — tenha o Telegram instalado (grátis, iPhone ou Android).",
      "PASSO 2 — toque neste link:",
      `   ${tg}`,
      'PASSO 3 — toque em "INICIAR" (ou "START").',
      'PRONTO! O robô responde "✅ Pronto" e os alertas chegam ali, mesmo com o celular bloqueado.',
      "",
      'Na emergência, toque em "🏃 Estou indo": o LindaurIA avisa em voz alta.',
      "Não silencie essa conversa. Este link é como uma senha: não repasse.",
    ].join("\n");
  }
  const server = getSettings().alertServer.replace(/\/+$/, "");
  const custom = server !== "https://ntfy.sh";
  return [
    `Olá, ${m.name}! Você vai receber no celular os alertas de ${patientDisplayName()} (emergência e lembretes de remédio/comida) pelo LindaurIA.`,
    "",
    "PASSO 1 — toque neste link:",
    `   ${inviteLink(m)}`,
    'PASSO 2 — toque no botão amarelo "Ativar tudo" e aceite as notificações.',
    "PRONTO! Deixe a página aberta (pode bloquear a tela).",
    "",
    `Se pedir um código, digite: ${accessCode(m)}`,
    `(ou abra ${appUrl()} → "Sou familiar" → digite o código)`,
    "",
    'EXTRA (recomendado) — para tocar até com o celular bloqueado ou o navegador fechado, instale o app "ntfy" (grátis):',
    "   Android: https://play.google.com/store/apps/details?id=io.heckel.ntfy",
    "   iPhone: https://apps.apple.com/app/ntfy/id1625396347",
    `   No ntfy, toque em "+" e digite: ${m.topic}`,
    custom ? `   (em "Usar outro servidor", coloque: ${server})` : null,
    "   Ative a prioridade máxima para tocar mesmo no modo silencioso.",
    "",
    "Guarde este código: ele é como uma senha.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
