import { create } from "zustand";
import { secureGet, secureSet } from "@lindauria/shared";
import type { AlertMessage } from "@lindauria/safety";

/**
 * AVISOS PELO TELEGRAM — sem servidor nosso.
 *
 * O cuidador cria um robô GRÁTIS no Telegram (@BotFather) e cola o "token" aqui. O token fica só
 * neste aparelho, criptografado (não vai para o código do site). Cada familiar toca no link
 * t.me/<robô>?start=<código> e em "Iniciar": a partir daí o robô manda os alertas (texto e fotos)
 * direto no Telegram dele, no iPhone ou no Android, mesmo com o celular bloqueado.
 * O botão "🏃 Estou indo" da mensagem volta para este aparelho, que fala em voz alta.
 *
 * Só usamos requisições "simples" (POST com FormData), porque a API do Telegram não aceita a
 * pré-verificação (preflight) dos navegadores.
 */

const API = "https://api.telegram.org";
const KEY = "telegram-bot";
const OFFSET_KEY = "lindauria-tg-offset";

export interface TelegramBot {
  token: string;
  username: string;
  name: string;
}

interface TgState {
  bot: TelegramBot | null;
  loaded: boolean;
  /** problema atual (token revogado, outro aparelho usando o robô...) */
  problem: string | null;
  /** resultado do link de configuração (#telegram=...) para mostrar na tela */
  setupResult: { ok: boolean; text: string } | null;
}

export const useTelegram = create<TgState>(() => ({
  bot: null,
  loaded: false,
  problem: null,
  setupResult: null,
}));

/**
 * LINK DE CONFIGURAÇÃO: abrir o LindaurIA com "#telegram=<token>" conecta o robô sozinho.
 * O token vai depois do "#", que o navegador NÃO envia para o site; e é apagado da barra de
 * endereço na hora.
 */
export async function setupFromLink() {
  if (typeof location === "undefined") return;
  const m = location.hash.match(/[#&]telegram=([^&]+)/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const bot = await connectBot(decodeURIComponent(m[1]));
    useTelegram.setState({
      setupResult: {
        ok: true,
        text: `Telegram conectado! Robô @${bot.username}. Agora, em Família, envie o convite para cada familiar.`,
      },
    });
  } catch (e) {
    useTelegram.setState({
      setupResult: {
        ok: false,
        text: `Não consegui conectar o Telegram: ${e instanceof Error ? e.message : "erro"}. Confira a internet e abra o link de novo.`,
      },
    });
  }
}

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number };
    from?: { first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { first_name?: string };
    message?: { chat: { id: number } };
  };
}

export const isTokenLike = (t: string) =>
  /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(t.trim());

async function call<T>(
  token: string,
  method: string,
  params: Record<string, string | Blob> = {},
  signal?: AbortSignal,
): Promise<T> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(params)) {
    if (v instanceof Blob) fd.append(k, v, "foto.jpg");
    else fd.append(k, v);
  }
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    body: fd,
    signal,
  });
  const data = (await res.json().catch(() => null)) as {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  } | null;
  if (!data?.ok)
    throw new TelegramError(
      data?.description ?? `HTTP ${res.status}`,
      data?.error_code ?? res.status,
    );
  return data.result as T;
}

// ---------------------------------------------------------------------------------------------
export async function loadTelegram() {
  if (useTelegram.getState().loaded) return;
  useTelegram.setState({
    bot: (await secureGet<TelegramBot>(KEY)) ?? null,
    loaded: true,
  });
}

/** confere o token com o Telegram e guarda (criptografado) */
export async function connectBot(rawToken: string): Promise<TelegramBot> {
  const token = rawToken.trim();
  if (!isTokenLike(token))
    throw new TelegramError(
      "Isso não parece um token. Ele tem números, dois-pontos e letras (ex.: 123456789:AAH...).",
      400,
    );
  let me: { username?: string; first_name?: string };
  try {
    me = await call<{ username?: string; first_name?: string }>(token, "getMe");
  } catch (e) {
    if (e instanceof TelegramError && (e.code === 401 || e.code === 404))
      throw new TelegramError(
        "O Telegram não aceitou esse token. Copie de novo a mensagem do @BotFather.",
        e.code,
      );
    throw new TelegramError(
      "Sem conexão com o Telegram. Verifique a internet.",
      0,
    );
  }
  // sem webhook, para podermos receber o "Iniciar" e o "Estou indo" daqui
  await call(token, "deleteWebhook").catch(() => undefined);
  const bot: TelegramBot = {
    token,
    username: me.username ?? "",
    name: me.first_name ?? "LindaurIA",
  };
  await secureSet(KEY, bot);
  useTelegram.setState({ bot, problem: null });
  startTelegramPolling();
  return bot;
}

export async function disconnectBot() {
  stopTelegramPolling();
  await secureSet(KEY, null);
  useTelegram.setState({ bot: null, problem: null });
}

export const telegramLink = (username: string, code: string) =>
  `https://t.me/${username}?start=${encodeURIComponent(code)}`;

// ---------------------------------------------------------------------------------------------
/** mensagens de alarme ganham o botão "Estou indo" */
const wantsGoingButton = (msg: AlertMessage) =>
  (msg.tags ?? []).includes("rotating_light");

export function sendTelegramText(
  chatId: number,
  text: string,
  extra: Record<string, string> = {},
) {
  const bot = useTelegram.getState().bot;
  if (!bot)
    return Promise.reject(new TelegramError("Telegram não configurado", 0));
  return call(bot.token, "sendMessage", {
    chat_id: String(chatId),
    text: text.slice(0, 4000),
    ...extra,
  });
}

export function sendTelegramAlert(chatId: number, msg: AlertMessage) {
  const extra: Record<string, string> = {};
  if (wantsGoingButton(msg))
    extra.reply_markup = JSON.stringify({
      inline_keyboard: [[{ text: "🏃 Estou indo", callback_data: "going" }]],
    });
  // avisos de baixa prioridade (ex.: "remédio tomado") chegam sem tocar
  if ((msg.priority ?? 3) <= 2) extra.disable_notification = "true";
  return sendTelegramText(chatId, `${msg.title}\n\n${msg.message}`, extra);
}

export function sendTelegramPhoto(
  chatId: number,
  photo: Blob,
  caption: string,
) {
  const bot = useTelegram.getState().bot;
  if (!bot)
    return Promise.reject(new TelegramError("Telegram não configurado", 0));
  return call(bot.token, "sendPhoto", {
    chat_id: String(chatId),
    photo,
    caption: caption.slice(0, 1000),
  });
}

export function answerButton(callbackId: string, text: string) {
  const bot = useTelegram.getState().bot;
  if (!bot) return Promise.resolve();
  return call(bot.token, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text,
  }).then(() => undefined);
}

// ---------------------------------------------------------------------------------------------
/** quem trata o "Iniciar" e o "Estou indo" (fica em family.ts, para não criar import circular) */
let onUpdate: (u: TgUpdate) => Promise<void> | void = () => undefined;
export function setTelegramUpdateHandler(
  fn: (u: TgUpdate) => Promise<void> | void,
) {
  onUpdate = fn;
}

let running = false;
let ctrl: AbortController | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readOffset() {
  try {
    return Number(localStorage.getItem(OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
}
function saveOffset(n: number) {
  try {
    localStorage.setItem(OFFSET_KEY, String(n));
  } catch {
    /* sem armazenamento: só reprocessa mensagens antigas, sem problema */
  }
}

/** escuta o robô enquanto o app do paciente está aberto */
export function startTelegramPolling() {
  if (running || !useTelegram.getState().bot) return;
  running = true;
  void loop();
}

export function stopTelegramPolling() {
  running = false;
  ctrl?.abort();
}

async function loop() {
  let offset = readOffset();
  while (running) {
    const bot = useTelegram.getState().bot;
    if (!bot) break;
    ctrl = new AbortController();
    try {
      const ups = await call<TgUpdate[]>(
        bot.token,
        "getUpdates",
        {
          offset: String(offset),
          timeout: "25",
          allowed_updates: JSON.stringify(["message", "callback_query"]),
        },
        ctrl.signal,
      );
      if (useTelegram.getState().problem)
        useTelegram.setState({ problem: null });
      for (const u of ups) {
        offset = u.update_id + 1;
        saveOffset(offset);
        try {
          await onUpdate(u);
        } catch {
          /* uma mensagem estranha não pode parar a escuta */
        }
      }
    } catch (e) {
      if (!running) break;
      if (e instanceof TelegramError && e.code === 401) {
        useTelegram.setState({
          problem:
            "O token do robô foi trocado ou apagado no @BotFather. Conecte o robô de novo.",
        });
        break;
      }
      if (e instanceof TelegramError && e.code === 409) {
        useTelegram.setState({
          problem:
            "Outro aparelho está usando este mesmo robô. O botão “Estou indo” só chega em um aparelho por vez.",
        });
        await sleep(30_000);
        continue;
      }
      await sleep(5000); // sem internet: tenta de novo
    }
  }
  running = false;
}
