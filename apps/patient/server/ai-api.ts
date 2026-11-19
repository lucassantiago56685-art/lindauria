import Anthropic from '@anthropic-ai/sdk';
import type { Connect, Plugin } from 'vite';
import { CHAT_SYSTEM_PROMPT, PROMPT_VERSION, VISION_SYSTEM_PROMPT } from '../../../packages/ai/src/prompts';

/* =============================================================================================
   Servidor da IA (Chat LindaurIA e Câmera Inteligente).

   A CHAVE DA API FICA SÓ AQUI, no servidor — nunca vai para o navegador/celular.
   O app chama /api/ai/chat e /api/ai/vision; este código chama a API do Claude.

   Credenciais (em ordem): ANTHROPIC_API_KEY no arquivo .env da raiz do projeto, ou um login
   feito com `ant auth login` neste computador.

   Privacidade: nada é gravado aqui. Fotos e perguntas só passam (não ficam salvas no servidor).
   ============================================================================================= */

const MODEL = 'claude-opus-5-5';
const MAX_BODY = 8 * 1024 * 1024; // 8 MB (foto)

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function readJson(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('grande-demais'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function send(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

export function aiApi(env: Record<string, string | undefined>): Plugin {
  let client: Anthropic | null = null;
  const getClient = () => {
    // sem chave no .env, o SDK tenta o login do `ant auth login`
    client ??= new Anthropic(env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY } : {});
    return client;
  };

  async function ask(system: string, messages: Anthropic.Beta.BetaMessageParam[]) {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      // esforço baixo: respostas curtas e rápidas (meta < 6 s no 4G)
      output_config: { effort: 'low' },
      // se o modelo recusar por política de segurança, a API tenta outro modelo automaticamente
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return 'Desculpe, não posso ajudar com isso. Se for algo urgente, use o botão de emergência ou ligue 192 (SAMU).';
    }
    return textOf(response.content) || 'Não consegui responder agora. Tente de novo.';
  }

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/ai/')) return next();
    if (url.startsWith('/api/ai/status')) {
      const configured = !!env.ANTHROPIC_API_KEY;
      return send(res, 200, { configured, model: MODEL, promptVersion: PROMPT_VERSION });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'metodo' });

    try {
      const body = (await readJson(req)) as Record<string, unknown>;

      if (url.startsWith('/api/ai/chat')) {
        const history = (Array.isArray(body.messages) ? body.messages : []) as ChatTurn[];
        const messages = history
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
          .slice(-20) // contexto das últimas 20 falas
          .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
        if (!messages.length || messages[messages.length - 1].role !== 'user') return send(res, 400, { error: 'pergunta' });
        const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
        const text = await ask(`${CHAT_SYSTEM_PROMPT}

Data de hoje: ${today}.`, messages);
        return send(res, 200, { text, promptVersion: PROMPT_VERSION });
      }

      if (url.startsWith('/api/ai/vision')) {
        const image = String(body.image ?? '');
        const mediaType = String(body.mediaType ?? 'image/jpeg');
        const question = String(body.question ?? 'O que é isso?').slice(0, 2000);
        if (!image || !/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) return send(res, 400, { error: 'imagem' });
        const text = await ask(VISION_SYSTEM_PROMPT, [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: image } },
              { type: 'text', text: question },
            ],
          },
        ]);
        return send(res, 200, { text, promptVersion: PROMPT_VERSION });
      }

      return send(res, 404, { error: 'rota' });
    } catch (error) {
      // erros tipados do SDK → mensagens simples para o app
      if (error instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'chave-invalida' });
      if (error instanceof Anthropic.PermissionDeniedError) return send(res, 403, { error: 'sem-permissao' });
      if (error instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'limite' });
      if (error instanceof Anthropic.BadRequestError) return send(res, 400, { error: 'pedido-invalido', detail: error.message });
      if (error instanceof Anthropic.APIConnectionError) return send(res, 502, { error: 'sem-conexao' });
      if (error instanceof Anthropic.APIError) return send(res, 502, { error: 'api', status: error.status });
      if (error instanceof Anthropic.AnthropicError) return send(res, 503, { error: 'sem-chave' }); // sem credencial
      if (error instanceof Error && error.message === 'grande-demais') return send(res, 413, { error: 'grande-demais' });
      // nenhuma credencial encontrada (sem chave no .env e sem `ant auth login`)
      if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) return send(res, 503, { error: 'sem-chave' });
      console.error('[ia]', error);
      return send(res, 500, { error: 'interno' });
    }
  };

  return {
    name: 'lindauria-ai-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
