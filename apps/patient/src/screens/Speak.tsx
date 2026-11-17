import { useMemo, useRef, useState } from 'react';
import { GlowButton, SpeechBar } from '@lindauria/design-system';
import {
  applySuggestion,
  backspace,
  deleteWord,
  finalizeText,
  LAYOUTS,
  typeChar,
  WpmMeter,
} from '@lindauria/keyboards';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { predictor, sounds, speakText } from '../runtime/engine';
import { ConfirmDialog, ScreenShell } from '../components/common';
import { saveTextAsPhrase } from '../runtime/phrases';

const wpm = new WpmMeter();

export function Speak() {
  const text = useApp((s) => s.text);
  const setText = useApp((s) => s.setText);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [confirm, setConfirm] = useState<null | 'clear' | 'whatsapp'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const layout = LAYOUTS[settings.keyboard];

  const suggestions = useMemo(
    () => predictor.predict({ text, shortcuts: settings.shortcuts, max: 5 }),
    [text, settings.shortcuts],
  );

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const type = (ch: string) => {
    wpm.add(1, performance.now());
    setText((t) => typeChar(t, ch));
  };

  async function copy() {
    const t = finalizeText(text);
    try {
      await navigator.clipboard.writeText(t);
      sounds.sent();
      flash('Copiado ✔');
    } catch {
      sounds.error();
      flash('Não consegui copiar');
    }
  }

  function sendWhatsApp() {
    setConfirm(null);
    const t = finalizeText(text);
    // abre o WhatsApp com o texto pronto; a PESSOA (ou o cuidador) escolhe o contato e envia
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener,width=900,height=700');
  }

  const wpmValue = wpm.wpm;

  return (
    <ScreenShell icon="⌨️" title="Escrever" subtitle="letra por letra, com sugestões">
      <SpeechBar
        text={text}
        actions={
          <>
            <GlowButton
              tone="success"
              icon="🔊"
              label="Falar"
              className="w-[5em] text-[0.85em]"
              disabled={!text.trim()}
              onClick={() => void speakText(text)}
            />
            <GlowButton
              tone="accent"
              icon="⭐"
              label="Salvar"
              className="w-[5em] text-[0.85em]"
              disabled={!text.trim()}
              onClick={async () => {
                if (await saveTextAsPhrase(finalizeText(text))) flash('Salvo em ⭐ Minhas frases');
              }}
            />
          </>
        }
      />

      {/* previsão */}
      <div className="grid shrink-0 grid-cols-5 gap-2 sm:gap-3" aria-label="Sugestões de palavras">
        {Array.from({ length: 5 }, (_, i) => suggestions[i]).map((s, i) =>
          s ? (
            <GlowButton
              key={`${i}-${s.text}`}
              tone={s.kind === 'shortcut' ? 'accent' : 'secondary'}
              label={s.text}
              hint={s.kind === 'shortcut' ? 'atalho' : s.kind === 'correction' ? 'correção?' : undefined}
              className="min-h-[2.6em] truncate text-[clamp(15px,2vw,1.05em)]"
              onClick={() => {
                wpm.add(s.text.length, performance.now());
                setText((t) => applySuggestion(t, s));
              }}
            />
          ) : (
            <div key={i} />
          ),
        )}
      </div>

      {/* teclas */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3" role="group" aria-label={`Teclado ${layout.name}`}>
        {layout.rows.map((row, r) => (
          <div key={r} className="flex min-h-0 flex-1 gap-2 sm:gap-3">
            {row.map((ch, c) =>
              ch ? (
                <GlowButton
                  key={c}
                  tone="primary"
                  label={ch}
                  aria-label={ch === ',' ? 'vírgula' : ch === '.' ? 'ponto' : ch === '?' ? 'interrogação' : ch}
                  className="min-h-0 flex-1 p-0 text-[clamp(20px,3.4vw,1.75em)]"
                  onClick={() => type(ch)}
                />
              ) : (
                <div key={c} className="flex-1" />
              ),
            )}
          </div>
        ))}
      </div>

      {/* ações fixas */}
      {/* ações fixas, em grupos: [apagar] [espaço] [usar o texto] */}
      <div className="grid shrink-0 grid-cols-4 gap-2 sm:grid-cols-9 sm:gap-3">
        <GlowButton tone="warning" icon="⌫" label="Letra" className="text-[0.75em]" disabled={!text} onClick={() => setText(backspace)} />
        <GlowButton tone="warning" icon="⌫" label="Palavra" className="text-[0.75em]" disabled={!text} onClick={() => setText(deleteWord)} />
        <GlowButton tone="warning" icon="🧹" label="Limpar" className="text-[0.75em]" disabled={!text} onClick={() => setConfirm('clear')} />
        <GlowButton tone="primary" icon="␣" label="Espaço" className="text-[0.85em] max-sm:col-span-1 sm:col-span-3" onClick={() => type(' ')} />
        <GlowButton tone="neutral" icon="📋" label="Copiar" className="text-[0.75em]" disabled={!text} onClick={() => void copy()} />
        <GlowButton tone="secondary" icon="💬" label="WhatsApp" className="text-[0.75em]" disabled={!text.trim()} onClick={() => setConfirm('whatsapp')} />
        <GlowButton
          tone="neutral"
          icon="⇄"
          label={settings.keyboard === 'qwerty' ? 'QWERTY' : 'Frequência'}
          hint="trocar"
          className="text-[0.75em] max-sm:col-span-2"
          onClick={() => update({ keyboard: settings.keyboard === 'qwerty' ? 'frequency' : 'qwerty' })}
        />
      </div>

      <div className="pointer-events-none absolute bottom-1 right-4 text-[0.65em]" style={{ color: 'var(--text-secondary)' }}>
        {wpmValue > 0 ? `${wpmValue.toFixed(1).replace('.', ',')} palavras/min` : ''}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center" role="status">
          <span className="la-glass px-5 py-2 font-bold">{toast}</span>
        </div>
      )}

      {confirm === 'clear' && (
        <ConfirmDialog
          title="Apagar todo o texto?"
          confirmLabel="Sim, apagar"
          cancelLabel="Não"
          danger
          onConfirm={() => {
            setText('');
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'whatsapp' && (
        <ConfirmDialog
          title="Abrir no WhatsApp?"
          message={
            <>
              <p>
                “{finalizeText(text)}”
              </p>
              <p className="mt-3 text-[0.85em]">
                O WhatsApp abre em outra janela para você escolher o contato. Enquanto ela estiver na frente, o controle
                pela cabeça e o gesto de emergência ficam pausados — peça ajuda para voltar.
              </p>
            </>
          }
          confirmLabel="Abrir"
          cancelLabel="Voltar"
          onConfirm={sendWhatsApp}
          onCancel={() => setConfirm(null)}
        />
      )}
    </ScreenShell>
  );
}
