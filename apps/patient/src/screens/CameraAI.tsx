import { useEffect, useRef, useState } from 'react';
import { GlassCard, GlowButton } from '@lindauria/design-system';
import { CAMERA_QUESTIONS, detectUrgency, type UrgencyCheck } from '@lindauria/ai';
import { finalizeText } from '@lindauria/keyboards';
import { useApp } from '../store/app';
import { getHead, say, sounds } from '../runtime/engine';
import { AiFailure, askVision, shrinkPhoto } from '../runtime/ai';
import { ScreenShell } from '../components/common';
import { AiConsentCard, useAiConsent } from '../components/AiConsent';
import { ScrollArea } from '../components/ScrollArea';
import { UrgencyBanner } from './Chat';

/**
 * Câmera Inteligente: tirar foto SEM AS MÃOS (mirar no botão; contagem 3-2-1) e perguntar à IA.
 * Do Início até ouvir a resposta: Câmera IA → Tirar foto → pergunta = 3 escolhas.
 * A foto só sai do aparelho quando a pessoa escolhe a pergunta (e só para a IA, sem ficar salva).
 */
export function CameraAI() {
  const setText = useApp((s) => s.setText);
  const go = useApp((s) => s.go);
  const writtenText = useApp((s) => s.text);
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [ownStream, setOwnStream] = useState<MediaStream | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, giveConsent] = useAiConsent('ai-photo-consent');
  const [urgency, setUrgency] = useState<UrgencyCheck>({ urgent: false, emotional: false });


  // câmera: a frontal é a mesma do rastreamento (não desliga a seta); a traseira abre à parte
  useEffect(() => {
    const v = video.current;
    if (!v || photo || consent !== true) return; // só liga depois do aviso de privacidade
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (facing === 'front' && getHead()?.stream) {
        stream = getHead()!.stream;
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing === 'back' ? 'environment' : 'user' }, audio: false });
          if (cancelled) return stream.getTracks().forEach((t) => t.stop());
          setOwnStream(stream);
        } catch {
          setError('Não consegui abrir essa câmera. Tente a outra ou escolha uma foto da galeria.');
          return;
        }
      }
      v.srcObject = stream;
      void v.play().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [facing, photo, consent]);

  // desliga a câmera própria (traseira) ao sair
  useEffect(() => () => ownStream?.getTracks().forEach((t) => t.stop()), [ownStream]);

  async function capture() {
    setError(null);
    for (const n of [3, 2, 1]) {
      setCount(n);
      sounds.focus();
      await new Promise((r) => setTimeout(r, 800));
    }
    setCount(null);
    const v = video.current;
    if (!v || !v.videoWidth) {
      setError('A câmera ainda não está pronta. Tente de novo.');
      return;
    }
    const blob = await shrinkPhoto(v, facing === 'front');
    sounds.click();
    setPhoto(blob);
    setPhotoUrl(URL.createObjectURL(blob));
    setAnswer(null);
  }

  async function fromGallery(file: File) {
    const blob = await shrinkPhoto(file);
    setPhoto(blob);
    setPhotoUrl(URL.createObjectURL(blob));
    setAnswer(null);
  }

  async function ask(question: string) {
    if (!photo || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const a = await askVision(photo, question);
      setAnswer(a);
      setUrgency(detectUrgency(a));
      sounds.sent();
      void say(a);
    } catch (e) {
      setError(e instanceof AiFailure ? e.message : 'Não consegui falar com a IA agora.');
      sounds.error();
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(null);
    setPhotoUrl(null);
    setAnswer(null);
    setError(null);
    setUrgency({ urgent: false, emotional: false });
  };

  // autorização explícita na primeira vez (LGPD)
  if (consent === false) {
    return (
      <ScreenShell icon="📷" title="Câmera Inteligente">
        <AiConsentCard what="photo" onAccept={giveConsent} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell icon="📷" title="Câmera Inteligente" subtitle="foto sem as mãos + pergunta à IA">
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* visor com moldura holográfica */}
        <GlassCard className="relative flex min-h-[38vh] flex-1 items-center justify-center overflow-hidden p-0" style={{ borderColor: 'var(--secondary)' }}>
          {photoUrl ? (
            <img src={photoUrl} alt="Foto tirada" className="h-full w-full object-contain" />
          ) : (
            <video ref={video} muted playsInline autoPlay className="h-full w-full object-cover" style={{ transform: facing === 'front' ? 'scaleX(-1)' : undefined }} aria-label="Visor da câmera" />
          )}
          <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-2xl" style={{ border: '2px dashed color-mix(in srgb, var(--secondary) 55%, transparent)' }} />
          {count !== null && (
            <span className="absolute text-[6em] font-bold" style={{ color: '#fff', textShadow: '0 0 30px var(--secondary)' }} aria-live="assertive">
              {count}
            </span>
          )}
          {busy && (
            <span className="la-glass absolute bottom-4 px-4 py-2 font-bold" role="status" style={{ color: 'var(--secondary-text)' }}>
              🤖 Olhando a foto…
            </span>
          )}
        </GlassCard>

        <div className="flex min-h-0 flex-col gap-3 lg:w-[44%]">
          <UrgencyBanner check={urgency} />
          {!photo ? (
            <>
              <GlowButton tone="secondary" icon="📸" label="Tirar foto" hint="contagem 3, 2, 1" className="min-h-[4.5em] text-[1.3em]" disabled={count !== null} onClick={() => void capture()} />
              <div className="grid grid-cols-2 gap-3">
                <GlowButton tone="neutral" icon="🔄" label={facing === 'front' ? 'Usar câmera de trás' : 'Usar câmera da frente'} className="text-[0.8em]" onClick={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} />
                <label className="la-btn la-tone-neutral cursor-pointer text-[0.8em]">
                  <span className="la-btn__icon" aria-hidden="true">🖼️</span>
                  <span>Foto da galeria</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void fromGallery(e.target.files[0])} />
                </label>
              </div>
            </>
          ) : (
            <ScrollArea innerClassName="flex flex-col gap-3 pb-2">
              {answer ? (
                <GlassCard className="flex flex-col gap-3 p-4" style={{ borderColor: 'var(--secondary)' }}>
                  <span className="text-[0.75em] font-bold" style={{ color: 'var(--secondary-text)' }}>🤖 LindaurIA</span>
                  <p className="whitespace-pre-line text-[1.05em]">{answer}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <GlowButton tone="success" icon="🔊" label="Ouvir" className="text-[0.8em]" onClick={() => void say(answer)} />
                    <GlowButton tone="accent" icon="🗣️" label="Usar como frase" className="text-[0.8em]" onClick={() => {
                      setText(finalizeText(answer) + ' ');
                      go('speak');
                    }} />
                  </div>
                </GlassCard>
              ) : (
                <span className="text-[0.85em] font-bold" style={{ color: 'var(--text-secondary)' }}>O que você quer saber?</span>
              )}
              <div className="grid grid-cols-2 gap-2">
                {CAMERA_QUESTIONS.map((q) => (
                  <GlowButton key={q.id} tone="secondary" icon={q.icon} label={q.label} disabled={busy} className="min-h-[3.4em] text-[0.85em]" onClick={() => void ask(q.prompt)} />
                ))}
                {writtenText.trim() && (
                  <GlowButton tone="primary" icon="❓" label={`Perguntar: “${writtenText.trim().slice(0, 40)}”`} disabled={busy} className="col-span-2 text-[0.8em]" onClick={() => void ask(finalizeText(writtenText))} />
                )}
              </div>
              <GlowButton tone="neutral" icon="📸" label="Nova foto" className="text-[0.85em]" onClick={reset} />
            </ScrollArea>
          )}
          {error && (
            <p role="alert" className="la-glass p-3 font-semibold" style={{ color: 'var(--danger-text)', borderColor: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}
