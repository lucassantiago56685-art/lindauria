# LindaurIA

> *A doença tira os movimentos. A LindaurIA devolve a voz, a autonomia e a conexão.*

App de comunicação aumentativa e alternativa (CAA) para pessoas com **ELA**, controlado **só com a cabeça**,
em português do Brasil, gratuito e rodando em hardware comum (notebook, tablet ou celular com câmera).
O nome homenageia a Lindaura, avó do criador.

**Status:** Fase 0 (fundação) e Fase 1 (MVP de comunicação) implementadas. 109 testes automatizados passando.

---

## Como rodar

Pré-requisito: **Node 20+**. O pnpm vem pelo corepack, sem precisar instalar.

```bash
corepack pnpm install        # instala tudo (1ª vez ~2 min)
corepack pnpm dev            # abre em http://localhost:5173
corepack pnpm test           # 109 testes (filtros, dwell, gestos, previsão, contraste, emergência)
```

Na primeira execução, o `dev` copia o WebAssembly do MediaPipe e baixa o modelo de rosto (~3,7 MB) para
`apps/patient/public/`. Depois disso, **nada de rastreamento depende de internet**.

**Testar num tablet/celular na mesma rede Wi-Fi:** `corepack pnpm --filter @lindauria/patient dev:https`
e abra o endereço `https://<ip-do-computador>:5173` no aparelho (aceite o aviso de certificado).
Os navegadores só liberam a câmera em `https` ou `localhost`.

**Build de produção / PWA:** `corepack pnpm --filter @lindauria/patient build`. O app fica instalável e
funciona offline depois do primeiro carregamento (modelo e wasm ficam em cache).

### Roteiro de teste com a webcam (5 minutos)

1. Toque em **Começar** e permita a câmera.
2. **Calibração (~30 s, guiada por voz):** centro → direita → esquerda → cima → baixo → piscar 2x.
   A malha neural mostra o rosto. Se o rosto sumir, o tempo da etapa para.
3. No **Início**, mexa a cabeça: o orbe de luz segue você. Pare sobre um cartão: o anel enche e ele é escolhido.
4. **Falar:** digite "bom dia" com a cabeça. Repare que, depois de um clique, nada mais é clicado até você
   mexer de novo (rearme). Use as sugestões e toque em **Falar**.
5. **Sim/Não:** respostas faladas em voz alta.
6. **Emergência por gesto:** faça **3 piscadas longas** (~1 s cada) em até 8 s. Aparece "1 de 3", depois
   "2 de 3", e na terceira o alarme dispara. Cancele mirando em "Cancelar" por 3 s.
7. **Descansar:** o app para de clicar. Para voltar, mire 3 s em "Voltar a usar".
8. **Ajustes** (PIN do cuidador, criado no 1º acesso): tempo de dwell, sensibilidade, gestos, tema, voz.

Sem câmera? Em **Ajustes → Controle**, escolha *Mouse / toque*. O dwell funciona com o mouse.

---

## O que foi entregue

### Fase 0 — Fundação
- Monorepo **pnpm + Turborepo**, TypeScript estrito.
- **Design system "Neural Aurora"**: tokens, aurora animada, vidro, `GlowButton` (5 estados: repouso,
  aproximação, mira, progresso, ativado), `OrbCursor` com rastro e anel de dwell, `NeuralMesh`,
  `SpeechBar`, `QuickYesNo`, `EmergencyPulse`, logo (L de luz que vira onda sonora) e **sons sintetizados**
  (foco, clique cristalino, enviado, alarme). Não usa arquivos de áudio.
- Temas **escuro, claro, alto contraste amarelo e branco**. **Teste automático garante contraste ≥ 7:1**
  (WCAG AAA) para todo texto, em todos os temas.
- Tipografia Space Grotesk, Atkinson Hyperlegible e Inter, empacotadas localmente (offline). Tamanho de
  18 a 48 px.
- `prefers-reduced-motion`, modo calmo e economia de bateria (aurora parada, câmera a 15 fps).
- Abertura e Hub navegável (9 cartões).

### Fase 1 — MVP de comunicação
| Item | Onde | Observações |
|---|---|---|
| Calibração com malha neural | `apps/patient/src/screens/Calibration.tsx`, `packages/input-engine/src/calibration.ts` | Mede o **alcance real de cada lado** (assimetria da ELA) e funciona com a **câmera em qualquer ângulo** (modo deitado). |
| Cursor por cabeça + One Euro Filter | `input-engine/src/head-mapping.ts`, `one-euro.ts` | Independente da distância da câmera. Ignora pessoas atrás (usa o rosto maior) e cabeça caída (cochilo). |
| Dwell | `input-engine/src/dwell.ts`, `dwell-dom.ts` | **Rearme por movimento** (zero cliques repetidos com a pessoa parada), tolerância a tremor, brilho por proximidade. |
| Piscada longa e outros gestos | `input-engine/src/gestures.ts` | Ignora piscadas naturais **e** olhos fechados por muito tempo. Sobrancelhas e boca também disponíveis. |
| Teclado QWERTY gigante + Frequência PT-BR | `packages/keyboards/src/layouts.ts` | No de frequência, A, E, O, S, R e I ficam no centro. |
| Previsão local + acentuação automática | `keyboards/src/predictor.ts`, `text.ts` | Aprende nomes e apelidos, atalhos pessoais ("bd" → "Bom dia..."), corrige erro de mira de 1 letra, "nao" → "não". |
| Falar (TTS PT-BR) | `packages/voice` | Prefere vozes **do aparelho** (funcionam offline). |
| Sim / Não / Não sei / Espera | `screens/YesNo.tsx` | |
| Emergência por gesto + alarme | `packages/safety` | Sirene sintetizada **imediata**. Funciona em qualquer tela, inclusive no descanso. Tipos: falta de ar, engasgo, dor... |
| Configurações com modo cuidador | `screens/Settings.tsx`, `PinGate.tsx` | PIN com hash PBKDF2 e bloqueio após 5 erros. Controles com botões −/+ (usáveis com toque **e** com a cabeça). |
| Dados locais criptografados | `packages/shared/src/secure-store.ts` | IndexedDB (Dexie) + AES-GCM 256 com chave não-extraível. Botão "apagar tudo" (LGPD). |

### Critérios de aceite do MVP
| Critério | Situação |
|---|---|
| Zero cliques acidentais em 5 min com a pessoa parada | ✅ Coberto por teste automático (`engine.test.ts`): no máximo 1 clique (o intencional), e tela nova embaixo do cursor parado não é clicada. |
| Emergência < 2 s após o gesto, inclusive offline | ✅ O alarme é local e começa no mesmo quadro em que o 3º gesto termina (teste em `emergency.test.ts`). |
| Funciona offline | ✅ PWA com precache de app, fontes, modelo e wasm. Voz offline depende de haver voz PT-BR instalada no aparelho. |
| Iniciante digita "bom dia" em 10 min | ⏳ Precisa de teste com pessoas reais (ver `docs/pesquisa`). |

---

## ⚠️ Limitações honestas desta versão

- **Aviso à família (WhatsApp/push) ainda NÃO existe.** A emergência toca alarme **só neste aparelho**.
  A tela de emergência diz isso claramente. O canal remoto entra na Fase 3 (o gancho `notifyRemote`,
  com janela de 5 s para cancelar, já está pronto e testado).
- **Um toque para começar:** os navegadores só liberam som e câmera depois de um toque. O cuidador toca
  uma vez em "Começar". Nos apps nativos (Tauri/Capacitor) dá para remover isso.
- **Aba em segundo plano:** se outra janela ficar na frente (ex.: WhatsApp Web), o navegador pausa a câmera
  e, com ela, o gesto de emergência. O app avisa antes de abrir o WhatsApp.
- **MediaPipe roda na thread principal**, não em Web Worker como pedia a especificação. Ele já roda em
  WebGL/GPU (com fallback para CPU) e o módulo está isolado para a troca. Escolhi o caminho mais estável
  primeiro. Também não usei XState nem Radix nesta fase: as máquinas de estado são pequenas classes testadas.
- **Varredura, rastreio de olhar e chave externa** são da Fase 4. A interface `InputProvider` já permite plugar.
- Cartões **Pranchas, Chat IA, Câmera IA, Família, Casa e Lazer** abrem uma tela que diz em qual fase chegam.
  Nenhum finge funcionar.
- No celular em pé, o QWERTY de 10 colunas fica com teclas menores que 32 px. O uso recomendado é tablet
  deitado ou notebook.
- **Não substitui médico, equipe de saúde nem monitores de sinais vitais.**

---

## Estrutura

```
apps/patient            App do paciente (PWA React 19 + Vite + Tailwind 4 + Framer Motion)
  src/runtime/engine.ts   liga entrada → dwell → gestos → emergência → voz
  src/screens/            Abertura, Calibração, Início, Falar, Sim/Não, Ajustes, Em breve
packages/
  design-system   tokens Neural Aurora (fonte única), componentes, sons
  input-engine    MediaPipe, One Euro, mapeamento da cabeça, calibração, gestos, dwell, InputProvider
  keyboards       layouts, previsão n-grama, acentuação, autocorreção, edição, palavras/min
  voice           TTS PT-BR (Web Speech)
  safety          emergência (janela de cancelamento), sirene
  shared          tipos de configuração, armazenamento criptografado, PIN, áudio
docs/pesquisa     registro dos testes com usuários
```

Próximas fases criam `packages/ai`, `camera`, `boards`, `home-control`, `apps/caregiver`,
`apps/professional` e `supabase/`.

## Tokens (resumo, modo escuro)

| Token | Valor | Uso |
|---|---|---|
| `--bg-deep` | `#060A17` | fundo |
| `--primary` | `#5EEAFF` | ações, cursor |
| `--secondary` | `#A78BFA` | IA |
| `--accent` | `#F0ABFC` | família, afeto |
| `--success` / `--warning` / `--danger` | `#4ADE80` / `#FBBF24` / `#FF4D6D` | sim / atenção / não e emergência |

As cores de marca são usadas em brilhos e bordas. Para **texto** há variantes próprias (`--danger-text`
`#FFB3C1` etc.) que passam no teste de 7:1. A fonte única de verdade é
`packages/design-system/src/tokens.ts`.

## Custos

A Fase 0/1 **não usa nenhum serviço pago** nem chave de API. Veja `.env.example` para as fases seguintes.
As chaves ficarão **só no backend**.

## No ar pelo GitHub Pages

A cada envio para a branch `main`, a Action `.github/workflows/deploy.yml` roda os testes,
gera o app e publica em `https://<usuario>.github.io/<repositorio>/`.

- Funciona on-line: controle pela cabeça, teclado, voz, frases, desenho, lembretes,
  relatórios em PDF e os alarmes da família (ntfy.sh).
- **Chat e Câmera com IA não funcionam no Pages** (site estático, sem servidor para guardar a
  chave da API). Eles funcionam rodando no computador (`INICIAR-LINDAURIA.bat`) com a chave no `.env`.
- Contas e dados ficam no aparelho de cada pessoa (no endereço em que o app foi aberto).
