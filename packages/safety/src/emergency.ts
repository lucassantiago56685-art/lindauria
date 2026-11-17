/**
 * Controlador de emergência.
 *
 * Princípio: NUNCA atrasar o alarme. Ao disparar:
 *  1. o alarme sonoro LOCAL começa imediatamente (funciona offline);
 *  2. a fala "Preciso de ajuda" se repete entre as sirenes;
 *  3. o aviso à família é enviado NA HORA (padrão) ou após a janela de 5 s para cancelar
 *     (configurável). Em caso de dúvida (ninguém cancelou), ENVIA.
 *  4. se o alarme for cancelado depois do aviso, a família recebe "foi sem querer / resolvido".
 */

export type EmergencySource = 'gesture' | 'button' | 'switch';
export type EmergencyKind = 'geral' | 'falta-de-ar' | 'engasgo' | 'dor' | 'aspiracao' | 'posicao' | 'medo';

export interface EmergencyEvent {
  id: string;
  at: number;
  source: EmergencySource;
  kind: EmergencyKind;
  cancelledAt: number | null;
  /** cancelado dentro da janela de 5 s = alarme acidental */
  accidental: boolean;
}

export interface EmergencyHooks {
  startAlarm: () => void;
  stopAlarm: () => void;
  speak: (text: string) => void;
  /** envia o alerta à família. Retorna false se não houver ninguém para avisar. */
  notifyRemote?: (e: EmergencyEvent) => Promise<boolean>;
  /** o tipo da emergência mudou depois do aviso (ex.: escolheu "falta de ar") */
  notifyKindChange?: (e: EmergencyEvent) => void;
  /** cancelado DEPOIS de a família ter sido avisada */
  notifyCancelled?: (e: EmergencyEvent) => void;
  log?: (e: EmergencyEvent) => void;
  onChange?: (e: EmergencyEvent | null) => void;
}

export const CANCEL_WINDOW_MS = 5000;

export const EMERGENCY_PHRASES: Record<EmergencyKind, string> = {
  geral: 'Socorro! Preciso de ajuda agora!',
  'falta-de-ar': 'Socorro! Estou com falta de ar!',
  engasgo: 'Socorro! Estou engasgando!',
  dor: 'Socorro! Estou com muita dor!',
  aspiracao: 'Preciso de aspiração agora!',
  posicao: 'Preciso mudar de posição, por favor!',
  medo: 'Estou com medo. Venha aqui, por favor!',
};

export class EmergencyController {
  private current: EmergencyEvent | null = null;
  private speakTimer: ReturnType<typeof setInterval> | null = null;
  private remoteTimer: ReturnType<typeof setTimeout> | null = null;
  private notified = false;

  /** @param remoteDelayMs 0 = avisa a família na hora; CANCEL_WINDOW_MS = espera a janela */
  constructor(
    private hooks: EmergencyHooks,
    public remoteDelayMs = CANCEL_WINDOW_MS,
  ) {}

  get active() {
    return this.current;
  }

  trigger(source: EmergencySource, kind: EmergencyKind = 'geral'): EmergencyEvent {
    if (this.current) {
      // já está disparado: só atualiza o tipo (ex.: depois escolheu "falta de ar")
      const changed = this.current.kind !== kind;
      this.current = { ...this.current, kind };
      this.hooks.onChange?.(this.current);
      if (changed && this.notified) this.hooks.notifyKindChange?.(this.current);
      return this.current;
    }
    const e: EmergencyEvent = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      source,
      kind,
      cancelledAt: null,
      accidental: false,
    };
    this.current = e;
    this.notified = false;
    // 1) alarme imediato
    this.hooks.startAlarm();
    this.hooks.onChange?.(e);
    // 2) fala repetida
    const say = () => this.current && this.hooks.speak(EMERGENCY_PHRASES[this.current.kind]);
    setTimeout(say, 400);
    this.speakTimer = setInterval(say, 6000);
    // 3) aviso à família (na hora ou após a janela de cancelamento)
    if (this.hooks.notifyRemote) {
      const send = () => {
        if (!this.current) return;
        this.notified = true;
        void this.hooks.notifyRemote!(this.current);
      };
      if (this.remoteDelayMs <= 0) send();
      else this.remoteTimer = setTimeout(send, this.remoteDelayMs);
    }
    return e;
  }

  cancel(): EmergencyEvent | null {
    const e = this.current;
    if (!e) return null;
    const now = Date.now();
    const done = { ...e, cancelledAt: now, accidental: now - e.at <= CANCEL_WINDOW_MS };
    this.current = null;
    if (this.speakTimer) clearInterval(this.speakTimer);
    if (this.remoteTimer) clearTimeout(this.remoteTimer);
    this.speakTimer = this.remoteTimer = null;
    this.hooks.stopAlarm();
    if (this.notified) this.hooks.notifyCancelled?.(done);
    this.notified = false;
    this.hooks.log?.(done);
    this.hooks.onChange?.(null);
    return done;
  }
}
