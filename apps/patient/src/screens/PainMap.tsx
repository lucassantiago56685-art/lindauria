import { useEffect, useState } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { say } from '../runtime/engine';
import { useCare } from '../runtime/care';
import { PAIN_TYPES, painAreaLabel, type PainArea } from '../runtime/care-logic';
import { ScreenShell } from '../components/common';
import { ScrollArea } from '../components/ScrollArea';

/*
 * Mapa de dor: a pessoa mostra ONDE dói, QUANTO (0 a 10) e COMO (pontada, queimação…).
 * O corpo está de FRENTE para quem olha a tela, como num espelho: o lado DIREITO da pessoa fica à
 * esquerda da tela — e cada botão diz "direito"/"esquerdo" por extenso para não haver dúvida.
 * Os registros entram em "Como estou" e nos relatórios em PDF (para levar à consulta).
 */

// grade do corpo (5 colunas). null = espaço vazio
const FRONT: Array<Array<string | null>> = [
  [null, null, 'cabeca', null, null],
  [null, null, 'rosto', null, null],
  ['braco-d', 'ombro-d', 'pescoco', 'ombro-e', 'braco-e'],
  ['mao-d', 'peito', 'peito', 'peito', 'mao-e'],
  [null, 'barriga', 'barriga', 'barriga', null],
  [null, 'perna-d', null, 'perna-e', null],
  [null, 'joelho-d', null, 'joelho-e', null],
  [null, 'pe-d', null, 'pe-e', null],
];
const BACK = ['costas', 'lombar', 'quadril'];

const levelColor = (n: number) => (n >= 7 ? 'danger' : n >= 4 ? 'warning' : 'success');
const describe = (a: PainArea) =>
  `${painAreaLabel(a.area).toLowerCase()}, ${a.level} de 10${a.types.length ? `, ${a.types.map((t) => PAIN_TYPES.find((x) => x.id === t)?.label.toLowerCase() ?? t).join(' e ')}` : ''}`;

export function PainMap() {
  const load = useCare((s) => s.load);
  const addFeeling = useCare((s) => s.addFeeling);
  const [areas, setAreas] = useState<Record<string, PainArea>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => void load(), [load]);

  const cur = current ? (areas[current] ?? { area: current, level: 5, types: [] }) : null;
  const put = (a: PainArea) => setAreas((s) => ({ ...s, [a.area]: a }));
  const list = Object.values(areas);

  const areaBtn = (id: string, key: string, span = 1) => {
    const a = areas[id];
    return (
      <GlowButton
        key={key}
        tone={a ? levelColor(a.level) : current === id ? 'primary' : 'neutral'}
        aria-pressed={current === id || !!a}
        label={painAreaLabel(id)}
        hint={a ? `${a.level}/10` : undefined}
        className="min-h-[3.4em] px-1 text-[clamp(12px,1.6vw,0.85em)]"
        style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
        onClick={() => {
          setCurrent(id);
          if (!areas[id]) put({ area: id, level: 5, types: [] });
        }}
      />
    );
  };

  function speakAll() {
    if (!list.length) return;
    void say(`Estou com dor: ${list.map(describe).join('; ')}.`);
  }

  function save() {
    if (!list.length) return;
    addFeeling({ mood: 0, feelings: ['dor'], pain: Math.max(...list.map((a) => a.level)), painAreas: list, note: '' });
    void say(`Registrado. Dor: ${list.map(describe).join('; ')}.`);
    setAreas({});
    setCurrent(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 3500);
  }

  return (
    <ScreenShell icon="🗺️" title="Mapa de dor" subtitle="onde dói, quanto e como">
      <ScrollArea innerClassName="flex flex-col gap-3 pb-3">
        {saved && (
          <p role="status" className="la-glass p-3 text-center font-bold" style={{ color: 'var(--success-text)', borderColor: 'var(--success)' }}>
            ✔ Registrado! Aparece em “Como estou” e nos relatórios para o médico.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
          {/* corpo */}
          <GlassCard className="flex flex-col gap-2 p-3">
            <p className="text-center text-[0.8em]" style={{ color: 'var(--text-secondary)' }}>
              1. Escolha onde dói (pode escolher vários). Corpo de frente: o seu lado direito fica à esquerda.
            </p>
            <div className="grid grid-cols-5 gap-2">
              {FRONT.flatMap((row, r) => {
                const cells: React.ReactNode[] = [];
                for (let c = 0; c < row.length; c++) {
                  const id = row[c];
                  if (!id) {
                    cells.push(<div key={`${r}-${c}`} />);
                    continue;
                  }
                  let span = 1;
                  while (row[c + span] === id) span++;
                  cells.push(areaBtn(id, `${r}-${c}`, span));
                  c += span - 1;
                }
                return cells;
              })}
            </div>
            <p className="mt-1 text-center text-[0.8em] font-bold" style={{ color: 'var(--text-secondary)' }}>
              Costas
            </p>
            <div className="grid grid-cols-3 gap-2">{BACK.map((id) => areaBtn(id, id))}</div>
          </GlassCard>

          {/* quanto e como */}
          <GlassCard className="flex flex-col gap-3 p-3" style={{ borderColor: cur ? 'var(--primary)' : undefined }}>
            {!cur ? (
              <p className="text-center" style={{ color: 'var(--text-secondary)' }}>
                Escolha uma parte do corpo para dizer quanto dói.
              </p>
            ) : (
              <>
                <h2 className="text-center text-[1.1em] font-bold">2. {painAreaLabel(cur.area)}: quanto dói?</h2>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <GlowButton key={n} tone={levelColor(n)} aria-pressed={cur.level === n} label={String(n)} className="min-h-[3em] p-0 text-[1.1em]" onClick={() => put({ ...cur, level: n })} />
                  ))}
                </div>
                <p className="text-center text-[0.75em]" style={{ color: 'var(--text-secondary)' }}>
                  1 = quase nada · 5 = moderada · 10 = a pior dor
                </p>
                <h2 className="text-center font-bold">3. Como é a dor?</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PAIN_TYPES.map((t) => (
                    <GlowButton
                      key={t.id}
                      tone="secondary"
                      icon={t.icon}
                      aria-pressed={cur.types.includes(t.id)}
                      label={t.label}
                      className="min-h-[3em] text-[0.8em]"
                      onClick={() => put({ ...cur, types: cur.types.includes(t.id) ? cur.types.filter((x) => x !== t.id) : [...cur.types, t.id] })}
                    />
                  ))}
                </div>
                <GlowButton
                  tone="neutral"
                  icon="✖"
                  label="Tirar esta parte"
                  className="la-btn--bar"
                  onClick={() => {
                    setAreas((s) => {
                      const n = { ...s };
                      delete n[cur.area];
                      return n;
                    });
                    setCurrent(null);
                  }}
                />
              </>
            )}
          </GlassCard>
        </div>

        {list.length > 0 && (
          <GlassCard className="flex flex-col gap-3 p-3">
            <p className="font-semibold">📍 {list.map((a) => `${painAreaLabel(a.area)} ${a.level}/10`).join(' · ')}</p>
            <div className="grid grid-cols-2 gap-3">
              <GlowButton tone="success" icon="🔊" label="Falar" hint="avisar quem está perto" className="min-h-[3.6em]" onClick={speakAll} />
              <GlowButton tone="primary" icon="💾" label="Salvar registro" hint="para os relatórios" className="min-h-[3.6em]" onClick={save} />
            </div>
          </GlassCard>
        )}
      </ScrollArea>
    </ScreenShell>
  );
}
