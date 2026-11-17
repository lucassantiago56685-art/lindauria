/**
 * Fala (TTS) em português do Brasil usando a Web Speech API.
 *
 * OFFLINE: vozes marcadas como `localService` rodam no aparelho (ex.: "Microsoft Maria" no
 * Windows, vozes do Android/iOS). Vozes "Google ..." do Chrome precisam de internet.
 * Por isso preferimos vozes locais por padrão.
 *
 * Fase 4: a voz própria da pessoa (voice banking) entra como outro "VoiceProvider".
 */

import { prepareForSpeech, splitForSpeech } from './pronounce';
export { prepareForSpeech, splitForSpeech } from './pronounce';

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
  local: boolean;
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  /** interrompe o que está falando (padrão: sim) */
  interrupt?: boolean;
}

const isPt = (lang: string) => lang.toLowerCase().replace('_', '-').startsWith('pt');
const isPtBr = (lang: string) => lang.toLowerCase().replace('_', '-') === 'pt-br';
/** vozes "naturais" (Edge: Francisca/Antonio Online Natural; Chrome: Google português do Brasil) soam muito melhor */
const isNatural = (v: SpeechSynthesisVoice) => /natural|neural|online|google|enhanced|premium|luciana|felipe/i.test(v.name);
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export class Speaker {
  private voices: SpeechSynthesisVoice[] = [];
  private preferredURI: string | null = null;
  /** muda a cada fala nova / cancelamento: pedaços antigos não continuam */
  private gen = 0;
  private listeners = new Set<() => void>();
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor() {
    if (!this.supported) return;
    const load = () => {
      this.voices = speechSynthesis.getVoices();
      this.listeners.forEach((l) => l());
    };
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
  }

  onVoicesChanged(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Vozes em português, com PT-BR e locais primeiro. */
  listVoices(): VoiceInfo[] {
    return this.voices
      .filter((v) => isPt(v.lang))
      .sort((a, b) => Number(isPtBr(b.lang)) - Number(isPtBr(a.lang)) || Number(b.localService) - Number(a.localService))
      .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }));
  }

  setPreferred(uri: string | null) {
    this.preferredURI = uri;
  }

  private pick(): SpeechSynthesisVoice | null {
    if (this.preferredURI) {
      const v = this.voices.find((x) => x.voiceURI === this.preferredURI);
      if (v) return v;
    }
    const pt = this.voices.filter((v) => isPt(v.lang));
    return (
      pt.find((v) => isPtBr(v.lang) && isNatural(v) && (v.localService || online())) ??
      pt.find((v) => isPtBr(v.lang) && v.localService) ??
      pt.find((v) => isPtBr(v.lang)) ??
      pt.find((v) => v.localService) ??
      pt[0] ??
      null
    );
  }

  get hasPortugueseVoice() {
    return this.voices.some((v) => isPt(v.lang));
  }

  /** voz local em PT-BR (reserva quando a voz online falha sem internet) */
  private localFallback(): SpeechSynthesisVoice | null {
    const pt = this.voices.filter((v) => isPt(v.lang) && v.localService);
    return pt.find((v) => isPtBr(v.lang)) ?? pt[0] ?? null;
  }

  /**
   * Fala o texto. Antes, ajusta a pronúncia ("Dr." → "doutor", "14h" → "14 horas", sem emojis)
   * e divide em frases (o Chrome corta falas longas).
   */
  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!this.supported || !text.trim()) return Promise.resolve();
    if (opts.interrupt !== false) {
      this.gen++;
      speechSynthesis.cancel();
    }
    const myGen = this.gen;
    const spoken = prepareForSpeech(text);
    const chunks = splitForSpeech(spoken || text);
    const voice = this.pick();
    return chunks.reduce<Promise<void>>((prev, chunk) => prev.then(() => (this.gen === myGen ? this.speakOne(chunk, voice, opts) : undefined)), Promise.resolve());
  }

  private speakOne(text: string, v: SpeechSynthesisVoice | null, opts: SpeakOptions, retried = false): Promise<void> {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'pt-BR';
      u.rate = opts.rate ?? 0.95;
      u.pitch = opts.pitch ?? 1;
      u.volume = opts.volume ?? 1;
      let started = false;
      u.onstart = () => (started = true);
      u.onend = () => resolve();
      u.onerror = (e) => {
        // voz online sem internet: tenta de novo com a voz do aparelho
        const fb = this.localFallback();
        if (!retried && !started && e.error !== 'interrupted' && e.error !== 'canceled' && fb && fb !== v) {
          void this.speakOne(text, fb, opts, true).then(resolve);
        } else resolve();
      };
      speechSynthesis.speak(u);
      // Chrome às vezes "trava" a fila depois de um tempo parado
      if (speechSynthesis.paused) speechSynthesis.resume();
    });
  }

  cancel() {
    this.gen++;
    if (this.supported) speechSynthesis.cancel();
  }

  get speaking() {
    return this.supported && speechSynthesis.speaking;
  }
}
