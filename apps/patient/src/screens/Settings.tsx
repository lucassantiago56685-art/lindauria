import { useEffect, useState, type ReactNode } from 'react';
import { GlassCard, GlowButton, THEME_LABELS, type Tone } from '@lindauria/design-system';
import {
  ALARM_MIN_VOLUME,
  DEFAULT_SETTINGS,
  LIMITS,
  isPersistentStorage,
  secureDelete,
  secureWipeAll,
  type Settings as SettingsT,
  type ThemeName,
} from '@lindauria/shared';
import { LAYOUTS } from '@lindauria/keyboards';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { clearLearnedVocabulary, say, signOut, speaker, startInput, testAlarm } from '../runtime/engine';
import { ScrollArea } from '../components/ScrollArea';
import { ConfirmDialog } from '../components/common';
import { PinGate } from './PinGate';

/* Controles pensados para TOQUE (cuidador) e também para CABEÇA: nada de slider fino,
   sempre botões grandes de − / + e opções em botões. */

type Tab = 'controle' | 'gestos' | 'aparencia' | 'voz' | 'teclado' | 'seguranca';
const TABS: Array<{ id: Tab; icon: string; label: string; desc: string }> = [
  { id: 'controle', icon: '🎯', label: 'Cursor e controle', desc: 'Calibrar, velocidade, sensibilidade, tempo para escolher, formato da seta' },
  { id: 'gestos', icon: '😉', label: 'Gestos', desc: 'Piscada para escolher e gesto de emergência' },
  { id: 'voz', icon: '🔊', label: 'Voz e sons', desc: 'Voz da fala, velocidade, sons e alarme' },
  { id: 'teclado', icon: '⌨️', label: 'Teclado e palavras', desc: 'Tipo de teclado, atalhos e vocabulário aprendido' },
  { id: 'aparencia', icon: '🎨', label: 'Aparência', desc: 'Tema, alto contraste, tamanho da letra, animações' },
  { id: 'seguranca', icon: '🛡️', label: 'Conta e segurança', desc: 'Conta, PIN do cuidador, dados e privacidade' },
];

function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <GlassCard className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-[1em] font-bold">{label}</div>
        {help && (
          <div className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
            {help}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </GlassCard>
  );
}

function Stepper({
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const round = (v: number) => Math.round(v / step) * step;
  return (
    <div className="flex items-center gap-2">
      <GlowButton tone="neutral" label="−" aria-label="Diminuir" className="h-[2.4em] w-[2.6em] text-[1.2em]" disabled={value <= min} onClick={() => onChange(Math.max(min, round(value - step)))} />
      <span className="min-w-[5.5em] text-center text-[1.05em] font-bold tabular-nums" aria-live="polite">
        {format(value)}
      </span>
      <GlowButton tone="neutral" label="+" aria-label="Aumentar" className="h-[2.4em] w-[2.6em] text-[1.2em]" disabled={value >= max} onClick={() => onChange(Math.min(max, round(value + step)))} />
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange, tone = 'primary' }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; tone?: Tone }) {
  return (
    <>
      {options.map((o) => (
        <GlowButton key={o.value} tone={tone} aria-pressed={value === o.value} label={o.label} className="min-h-[2.4em] text-[0.8em]" onClick={() => onChange(o.value)} />
      ))}
    </>
  );
}

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <Choice value={value ? 'on' : 'off'} options={[{ value: 'on', label: 'Ligado' }, { value: 'off', label: 'Desligado' }]} onChange={(v) => onChange(v === 'on')} />
);

const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => `${(v / 1000).toFixed(1).replace('.', ',')} s`;

export function Settings() {
  return (
    <PinGate>
      <SettingsInner />
    </PinGate>
  );
}

function SettingsInner() {
  const go = useApp((s) => s.go);
  const lastGesture = useApp((s) => s.lastGesture);
  const tracking = useApp((s) => s.tracking);
  const s = useSettings((st) => st.settings);
  const update = useSettings((st) => st.update);
  const [tab, setTab] = useState<Tab | null>(null);
  const tabInfo = TABS.find((t) => t.id === tab);
  const [confirm, setConfirm] = useState<null | 'wipe' | 'vocab' | 'emergency-off' | 'pin' | 'logout'>(null);
  const account = useApp((st) => st.account);
  const [voices, setVoices] = useState(() => speaker.listVoices());
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  useEffect(() => speaker.onVoicesChanged(() => setVoices(speaker.listVoices())), []);

  const set = <K extends keyof SettingsT>(k: K) => (v: SettingsT[K]) => update({ [k]: v } as Partial<SettingsT>);

  const conflict =
    (s.selectGesture === 'longBlink' && s.emergencyGesture === 'longBlink3') ||
    (s.selectGesture === 'browRaise' && s.emergencyGesture === 'browRaise3');

  return (
    <div className="relative z-10 flex h-full flex-col gap-3 p-3 sm:p-4">
      <header className="flex shrink-0 items-center gap-3">
        {tab ? (
          <GlowButton tone="neutral" icon="←" label="Ajustes" className="la-btn--bar" onClick={() => setTab(null)} />
        ) : (
          <GlowButton tone="neutral" icon="🏠" label="Início" className="la-btn--bar" onClick={() => go('hub')} />
        )}
        <h1 className="min-w-0 flex-1 truncate text-[clamp(18px,3vw,1.5em)] font-bold">
          {tabInfo ? `${tabInfo.icon} ${tabInfo.label}` : '⚙️ Ajustes do cuidador'}
        </h1>
      </header>

      {/* menu principal: cada seção com uma descrição curta */}
      {!tab && (
        <ScrollArea innerClassName="grid grid-cols-1 gap-3 pb-6 md:grid-cols-2">
          {TABS.map((t) => (
            <GlowButton
              key={t.id}
              tone="secondary"
              icon={t.icon}
              label={t.label}
              hint={t.desc}
              className="la-btn--menu min-h-[4.6em] text-[1em]"
              onClick={() => setTab(t.id)}
            />
          ))}
        </ScrollArea>
      )}

      {tab && (
      <ScrollArea innerClassName="flex flex-col gap-3 pb-6">
        {tab === 'controle' && (
          <>
            <Row label="Modo de controle" help="Cabeça usa a câmera. Mouse/toque é para fases iniciais ou para o cuidador.">
              <Choice
                value={s.inputMode}
                options={[
                  { value: 'head', label: '🙂 Cabeça (câmera)' },
                  { value: 'pointer', label: '🖱️ Mouse / toque' },
                ]}
                onChange={(m) => {
                  update({ inputMode: m });
                  void startInput(m);
                }}
              />
            </Row>
            <GlassCard className="flex flex-col gap-3 p-4" style={{ borderColor: s.scanEnabled ? 'var(--accent)' : undefined }}>
              <div className="font-bold">🔦 Varredura com acionador</div>
              <p className="text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
                Para quando mover a cabeça ficar difícil: o app acende as linhas de botões, uma por vez; a pessoa aciona, ele acende
                cada botão da linha; aciona de novo e escolhe. O acionador pode ser o gesto de “escolher” (piscada, sobrancelhas ou
                boca, na aba Gestos), a tecla espaço/Enter (acionadores USB e Bluetooth) ou um sopro/som perto do microfone.
              </p>
              <Row label="Varredura">
                <Toggle value={s.scanEnabled} onChange={set('scanEnabled')} />
              </Row>
              {s.scanEnabled && (
                <>
                  <Row label="Velocidade (tempo de cada passo)" help="Mais tempo = mais calma para acionar.">
                    <Stepper value={s.scanMs} min={LIMITS.scanMs[0]} max={LIMITS.scanMs[1]} step={100} format={secs} onChange={set('scanMs')} />
                  </Row>
                  <Row label="Acionar por sopro ou som" help="Usa o microfone. Funciona melhor em ambiente silencioso.">
                    <Toggle value={s.scanSound} onChange={set('scanSound')} />
                  </Row>
                  {s.selectGesture === 'none' && !s.scanSound && (
                    <p className="font-semibold" style={{ color: 'var(--warning-text)' }}>
                      ⚠️ Escolha um gesto em Gestos → “Gesto para escolher”, ligue o sopro, ou use um acionador de tecla.
                    </p>
                  )}
                </>
              )}
            </GlassCard>
            <Row
              label="Mouse / toque: bolinha e clique automático"
              help="Desligado (normal): no modo Mouse / toque, sem bolinha; clique ou toque normalmente. Ligue só para rastreador ocular (ex.: Tobii): a bolinha aparece e escolhe quando você para o olhar em cima."
            >
              <Toggle value={s.pointerDwell} onChange={set('pointerDwell')} />
            </Row>
            {tracking.status === 'error' && (
              <p className="font-semibold" style={{ color: 'var(--danger-text)' }}>
                A câmera não ligou. Verifique a permissão do navegador.
              </p>
            )}
            <Row label="Calibração" help={s.calibration ? `Feita em ${new Date(s.calibration.createdAt).toLocaleString('pt-BR')}` : 'Ainda não calibrado (usando ajuste padrão).'}>
              <GlowButton tone="primary" icon="🎯" label="Calibrar agora" disabled={s.inputMode !== 'head'} onClick={() => go('calibration')} />
            </Row>
            <Row label="Tempo para escolher (dwell)" help="Quanto tempo o cursor precisa ficar parado em cima de um botão.">
              <Stepper value={s.dwellMs} min={LIMITS.dwellMs[0]} max={LIMITS.dwellMs[1]} step={100} format={secs} onChange={set('dwellMs')} />
            </Row>
            <Row label="Sensibilidade" help="Maior = movimentos menores da cabeça alcançam a tela toda.">
              <Stepper value={s.sensitivity} min={LIMITS.sensitivity[0]} max={LIMITS.sensitivity[1]} step={0.1} format={(v) => `${v.toFixed(1).replace('.', ',')}x`} onChange={set('sensitivity')} />
            </Row>
            <Row label="Velocidade máxima do cursor" help="Menor = o cursor anda mais devagar e fica mais fácil de controlar.">
              <Stepper value={s.maxSpeedPxS} min={LIMITS.maxSpeedPxS[0]} max={LIMITS.maxSpeedPxS[1]} step={50} format={(v) => `${v} px/s`} onChange={set('maxSpeedPxS')} />
            </Row>
            <Row label="Suavidade do cursor" help="Mais suave = menos tremor, um pouco mais lento.">
              <Stepper value={s.smoothing} min={0} max={1} step={0.1} format={pct} onChange={set('smoothing')} />
            </Row>
            <Row label="Zona morta" help="Ignora micro-movimentos menores que isso.">
              <Stepper value={s.deadZonePx} min={LIMITS.deadZonePx[0]} max={LIMITS.deadZonePx[1]} step={1} format={(v) => `${v} px`} onChange={set('deadZonePx')} />
            </Row>
            <Row label="Distância para rearmar" help="Depois de escolher algo, o cursor precisa andar isso antes de escolher de novo. Evita cliques repetidos sem querer.">
              <Stepper value={s.rearmPx} min={LIMITS.rearmPx[0]} max={LIMITS.rearmPx[1]} step={10} format={(v) => `${v} px`} onChange={set('rearmPx')} />
            </Row>
            <Row label="Inverter horizontal">
              <Toggle value={s.invertX} onChange={set('invertX')} />
            </Row>
            <Row label="Inverter vertical">
              <Toggle value={s.invertY} onChange={set('invertY')} />
            </Row>
            <Row label="Formato do cursor">
              <Choice
                value={s.cursorStyle}
                options={[
                  { value: 'orb', label: '✨ Orbe de luz' },
                  { value: 'arrow', label: '➤ Seta' },
                  { value: 'none', label: '🚫 Sem seta (só o botão acende)' },
                ]}
                onChange={set('cursorStyle')}
              />
            </Row>
            <Row label="Mostrar malha do rosto no topo">
              <Toggle value={s.showMeshPreview} onChange={set('showMeshPreview')} />
            </Row>
          </>
        )}

        {tab === 'gestos' && (
          <>
            <GlassCard className="p-4" role="status" aria-live="polite">
              <span className="font-bold">Último gesto visto: </span>
              {lastGesture && Date.now() - lastGesture.at < 10_000
                ? { longBlink: 'piscada longa', browRaise: 'sobrancelhas levantadas', mouthOpen: 'boca aberta' }[lastGesture.name] ?? lastGesture.name
                : 'nenhum (faça um gesto para testar)'}
            </GlassCard>
            <Row label="Gesto para escolher" help="Alternativa ao dwell: escolhe na hora o botão sob o cursor.">
              <Choice
                value={s.selectGesture}
                options={[
                  { value: 'none', label: 'Nenhum (só dwell)' },
                  { value: 'longBlink', label: 'Piscada longa' },
                  { value: 'browRaise', label: 'Sobrancelhas' },
                  { value: 'mouthOpen', label: 'Abrir a boca' },
                ]}
                onChange={set('selectGesture')}
              />
            </Row>
            <Row label="Duração da piscada longa" help="Piscadas naturais (rápidas) são sempre ignoradas. Olho fechado por muito tempo (cochilo) também não conta. Se houver alarme falso por sono ou olho seco, aumente.">
              <Stepper value={s.longBlinkMs} min={LIMITS.longBlinkMs[0]} max={LIMITS.longBlinkMs[1]} step={100} format={secs} onChange={set('longBlinkMs')} />
            </Row>
            <Row label="Gesto de emergência" help="Funciona em qualquer tela, até no descanso.">
              <Choice
                value={s.emergencyGesture}
                tone="danger"
                options={[
                  { value: 'longBlink3', label: 'Piscadas longas' },
                  { value: 'browRaise3', label: 'Sobrancelhas' },
                  { value: 'off', label: 'Desligado' },
                ]}
                onChange={(v) => (v === 'off' ? setConfirm('emergency-off') : update({ emergencyGesture: v }))}
              />
            </Row>
            {s.emergencyGesture !== 'off' && (
              <>
                <Row label="Quantas vezes para a emergência" help="Mais vezes = menos alarme falso (sono, cansaço, olho seco), porém mais esforço.">
                  <Stepper value={s.emergencyCount} min={LIMITS.emergencyCount[0]} max={LIMITS.emergencyCount[1]} step={1} format={(v) => `${v} vezes`} onChange={set('emergencyCount')} />
                </Row>
                <Row label="Em quanto tempo" help="Os gestos precisam acontecer dentro deste tempo.">
                  <Stepper value={s.emergencyWindowMs} min={LIMITS.emergencyWindowMs[0]} max={LIMITS.emergencyWindowMs[1]} step={1000} format={secs} onChange={set('emergencyWindowMs')} />
                </Row>
              </>
            )}
            {conflict && (
              <p className="font-semibold" style={{ color: 'var(--warning-text)' }}>
                ⚠️ O gesto de escolher é o mesmo da emergência: {s.emergencyCount} seguidos (em até {s.emergencyWindowMs / 1000} s) disparam o alarme. Considere usar
                gestos diferentes.
              </p>
            )}
          </>
        )}

        {tab === 'aparencia' && (
          <>
            <Row label="Tema">
              <Choice value={s.theme} options={(Object.keys(THEME_LABELS) as ThemeName[]).map((t) => ({ value: t, label: THEME_LABELS[t] }))} onChange={set('theme')} />
            </Row>
            <Row label="Letra" help="Atkinson Hyperlegible foi feita para baixa visão.">
              <Choice
                value={s.fontFamily}
                options={[
                  { value: 'atkinson', label: 'Atkinson Hyperlegible' },
                  { value: 'inter', label: 'Inter' },
                ]}
                onChange={set('fontFamily')}
              />
            </Row>
            <Row label="Tamanho do texto">
              <Stepper value={s.fontSizePx} min={LIMITS.fontSizePx[0]} max={LIMITS.fontSizePx[1]} step={2} format={(v) => `${v} px`} onChange={set('fontSizePx')} />
            </Row>
            <Row label="Botões maiores" help="Para quem enxerga pouco. Combine com o tema de alto contraste (amarelo ou branco).">
              <Toggle value={s.bigTargets} onChange={set('bigTargets')} />
            </Row>
            <Row label="Modo calmo" help="Sem animações.">
              <Toggle value={s.calmMode} onChange={set('calmMode')} />
            </Row>
            <Row label="Economia de bateria" help="Aurora parada e câmera a 15 quadros por segundo.">
              <Toggle value={s.batterySaver} onChange={set('batterySaver')} />
            </Row>
          </>
        )}

        {tab === 'voz' && (
          <>
            <Row label="Voz" help={speaker.hasPortugueseVoice ? 'Vozes “no aparelho” funcionam sem internet.' : 'Nenhuma voz em português encontrada neste aparelho.'}>
              <Choice
                value={s.voiceURI ?? ''}
                options={[{ value: '', label: 'Automática' }, ...voices.map((v) => ({ value: v.uri, label: `${v.name}${v.local ? ' · no aparelho' : ' · online'}` }))]}
                onChange={(v) => update({ voiceURI: v || null })}
              />
            </Row>
            <Row label="Velocidade da fala">
              <Stepper value={s.speechRate} min={LIMITS.speechRate[0]} max={LIMITS.speechRate[1]} step={0.05} format={pct} onChange={set('speechRate')} />
            </Row>
            <Row label="Tom da voz">
              <Stepper value={s.speechPitch} min={LIMITS.speechPitch[0]} max={LIMITS.speechPitch[1]} step={0.05} format={pct} onChange={set('speechPitch')} />
            </Row>
            <Row label="Testar voz">
              <GlowButton tone="success" icon="🔊" label="Ouvir exemplo" onClick={() => void say('Olá! Esta é a minha voz no LindaurIA. Hoje às 14h30 tenho consulta com a Dra. Ana.')} />
            </Row>
            {(['focus', 'click', 'sent'] as const).map((k) => (
              <Row key={k} label={{ focus: 'Som de foco', click: 'Som de clique', sent: 'Som de enviado' }[k]}>
                <Stepper value={s.sounds[k]} min={0} max={1} step={0.1} format={pct} onChange={(v) => update({ sounds: { ...s.sounds, [k]: v } })} />
              </Row>
            ))}
            <Row label="Volume do alarme de emergência" help={`Nunca fica abaixo de ${pct(ALARM_MIN_VOLUME)}, por segurança.`}>
              <Stepper value={s.sounds.alarm} min={ALARM_MIN_VOLUME} max={1} step={0.1} format={pct} onChange={(v) => update({ sounds: { ...s.sounds, alarm: v } })} />
              <GlowButton tone="danger" icon="🔔" label="Testar alarme" onClick={() => testAlarm()} />
            </Row>
            <Row label="Vibração">
              <Toggle value={s.haptics} onChange={set('haptics')} />
            </Row>
          </>
        )}

        {tab === 'teclado' && (
          <>
            <Row label="Corrigir palavras ao escrever" help="“qeuro” vira “quero”. Abreviações (vc, pq, hj) e acentos são sempre corrigidos.">
              <Toggle value={s.autoCorrect !== false} onChange={set('autoCorrect')} />
            </Row>
            <Row label="Teclado padrão">
              <Choice value={s.keyboard} options={Object.values(LAYOUTS).map((l) => ({ value: l.id, label: l.name }))} onChange={set('keyboard')} />
            </Row>
            <GlassCard className="flex flex-col gap-3 p-4">
              <div className="font-bold">Atalhos pessoais</div>
              <div className="text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
                Ao digitar o atalho, a frase aparece como primeira sugestão.
              </div>
              {Object.entries(s.shortcuts).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <code className="min-w-[4em] font-bold" style={{ color: 'var(--primary-text)' }}>
                    {k}
                  </code>
                  <span className="flex-1">{v}</span>
                  <GlowButton
                    tone="warning"
                    label="Remover"
                    className="text-[0.7em]"
                    onClick={() => {
                      const next = { ...s.shortcuts };
                      delete next[k];
                      update({ shortcuts: next });
                    }}
                  />
                </div>
              ))}
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const k = newKey.trim().toLowerCase();
                  if (!k || !newVal.trim()) return;
                  update({ shortcuts: { ...s.shortcuts, [k]: newVal.trim() } });
                  setNewKey('');
                  setNewVal('');
                }}
              >
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.replace(/\s/g, ''))}
                  placeholder="atalho (ex.: cf)"
                  aria-label="Atalho"
                  className="la-glass w-40 px-3 py-2 select-text"
                  style={{ color: 'var(--text-primary)' }}
                />
                <input
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  placeholder="frase (ex.: Quero um café, por favor)"
                  aria-label="Frase do atalho"
                  className="la-glass min-w-0 flex-1 px-3 py-2 select-text"
                  style={{ color: 'var(--text-primary)' }}
                />
                <GlowButton type="submit" tone="success" label="Adicionar" dwell={false} />
              </form>
            </GlassCard>
            <Row label="Vocabulário aprendido" help="Palavras e nomes que a previsão aprendeu com o uso.">
              <GlowButton tone="warning" label="Apagar aprendizado" onClick={() => setConfirm('vocab')} />
            </Row>
          </>
        )}

        {tab === 'seguranca' && (
          <>
            <GlassCard className="p-4" style={{ borderColor: 'var(--warning)' }}>
              <p className="font-bold" style={{ color: 'var(--warning-text)' }}>
                O LindaurIA não substitui médico, equipe de saúde nem monitores de sinais vitais.
              </p>
              <p className="mt-2 text-[0.85em]" style={{ color: 'var(--text-secondary)' }}>
                A emergência toca um alarme forte NESTE aparelho e avisa no celular os familiares autorizados (precisa de
                internet; sem internet, o aviso fica na fila e sai quando a conexão voltar). Em risco de vida: SAMU 192.
              </p>
            </GlassCard>
            <Row
              label="Conta"
              help={account ? `${account.name} · ${account.email} · conta salva neste aparelho` : 'Usando sem conta, só neste aparelho.'}
            >
              {account ? (
                <GlowButton tone="neutral" icon="🚪" label="Sair da conta" onClick={() => setConfirm('logout')} />
              ) : (
                <GlowButton tone="primary" icon="✨" label="Criar conta" onClick={() => go('signup')} />
              )}
            </Row>
            <Row label="Privacidade e dados" help="Política (LGPD), cópia de segurança, exportar e apagar dados, consentimentos.">
              <GlowButton tone="primary" icon="🔒" label="Abrir" onClick={() => go('privacy')} />
            </Row>
            <Row label="Armazenamento" help="Tudo fica criptografado neste aparelho.">
              <span className="font-semibold" style={{ color: isPersistentStorage() ? 'var(--success-text)' : 'var(--warning-text)' }}>
                {isPersistentStorage() ? '✔ Salvando neste aparelho' : '⚠ Só em memória (modo privado?)'}
              </span>
            </Row>
            <Row label="PIN do cuidador">
              <GlowButton tone="neutral" label="Trocar PIN" onClick={() => setConfirm('pin')} />
            </Row>
            <Row label="Restaurar ajustes padrão" help="Mantém PIN, vocabulário e histórico.">
              <GlowButton tone="warning" label="Restaurar" onClick={() => update({ ...DEFAULT_SETTINGS, calibration: s.calibration })} />
            </Row>
            <Row label="Apagar todos os dados" help="LGPD: apaga ajustes, calibração, vocabulário, histórico de frases e registros de alarme deste aparelho.">
              <GlowButton tone="danger" label="Apagar tudo" onClick={() => setConfirm('wipe')} />
            </Row>
          </>
        )}
      </ScrollArea>
      )}

      {confirm === 'emergency-off' && (
        <ConfirmDialog
          title="Desligar o gesto de emergência?"
          message="A pessoa só poderá pedir ajuda pelo botão da tela. Recomendamos manter ligado."
          confirmLabel="Desligar mesmo"
          cancelLabel="Manter ligado"
          danger
          onConfirm={() => {
            update({ emergencyGesture: 'off' });
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'logout' && (
        <ConfirmDialog
          title="Sair da conta?"
          message="Os ajustes, a calibração e o vocabulário continuam salvos neste aparelho."
          confirmLabel="Sair"
          cancelLabel="Ficar"
          onConfirm={() => void signOut()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'vocab' && (
        <ConfirmDialog
          title="Apagar o vocabulário aprendido?"
          danger
          onConfirm={() => {
            clearLearnedVocabulary();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'pin' && (
        <ConfirmDialog
          title="Trocar o PIN?"
          message="Você vai criar um PIN novo agora."
          onConfirm={async () => {
            await secureDelete('caregiver-pin');
            setConfirm(null);
            go('hub');
            setTimeout(() => go('settings'), 0);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'wipe' && (
        <ConfirmDialog
          title="Apagar TODOS os dados deste aparelho?"
          message="Isso não pode ser desfeito."
          confirmLabel="Apagar tudo"
          cancelLabel="Cancelar"
          danger
          onConfirm={async () => {
            await secureWipeAll();
            location.reload();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
