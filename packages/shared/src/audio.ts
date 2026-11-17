/**
 * Um único AudioContext para o app inteiro (sons da interface + alarme).
 * Navegadores só liberam áudio após um toque/clique: chamamos unlockAudio() na tela de abertura.
 */
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export async function unlockAudio(): Promise<boolean> {
  const c = getAudioContext();
  if (!c) return false;
  try {
    await c.resume();
    // toca 1 amostra silenciosa para garantir o desbloqueio no iOS
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
    return c.state === 'running';
  } catch {
    return false;
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* aparelho sem vibração */
  }
}
