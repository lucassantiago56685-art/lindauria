import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { initRuntime } from './runtime/engine';
import { useMyPhrases } from './runtime/phrases';

// carrega ajustes (criptografados) ANTES de desenhar, para já abrir com o tema e tamanho certos
void initRuntime().finally(() => {
  void useMyPhrases.getState().load();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
