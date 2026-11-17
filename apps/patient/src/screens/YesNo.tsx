import { useState } from 'react';
import { QuickYesNo, type QuickAnswer } from '@lindauria/design-system';
import { say } from '../runtime/engine';
import { ScreenShell } from '../components/common';

const SPOKEN: Record<QuickAnswer, string> = {
  sim: 'Sim',
  nao: 'Não',
  'nao-sei': 'Não sei',
  espera: 'Espera um pouco, por favor',
};

export function YesNo() {
  const [last, setLast] = useState<QuickAnswer | null>(null);
  return (
    <ScreenShell icon="👍" title="Sim / Não" subtitle="respostas rápidas faladas">
      <p className="shrink-0 text-center text-[1.1em] font-semibold" aria-live="polite" style={{ color: 'var(--text-secondary)' }}>
        {last ? `Você respondeu: ${SPOKEN[last]}` : 'Escolha a resposta. Ela será falada em voz alta.'}
      </p>
      <div className="min-h-0 flex-1">
        <QuickYesNo
          onAnswer={(a) => {
            setLast(a);
            void say(SPOKEN[a]);
          }}
        />
      </div>
    </ScreenShell>
  );
}
