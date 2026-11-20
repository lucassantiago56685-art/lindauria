import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { initRuntime } from './runtime/engine';
import { useMyPhrases } from './runtime/phrases';

/*
 * ATUALIZAÇÃO NA HORA: quando sai uma versão nova, o app guardado (offline) abre a versão antiga
 * primeiro. Assim que a nova assume, recarregamos — mas só logo depois de abrir (até 30 s) e nunca
 * durante uma emergência ou um lembrete tocando. Se não der, a versão nova entra na próxima abertura.
 */
const openedAt = Date.now();
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true; // primeira instalação: já é a versão nova
      return;
    }
    void Promise.all([import('./store/app'), import('./runtime/care')]).then(([{ useApp }, { useCare }]) => {
      const busy = !!useApp.getState().emergency || !!useCare.getState().ringing;
      if (!busy && Date.now() - openedAt < 30_000) location.reload();
    });
  });
}

// carrega ajustes (criptografados) ANTES de desenhar, para já abrir com o tema e tamanho certos
void initRuntime().finally(() => {
  void useMyPhrases.getState().load();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
