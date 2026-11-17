import { defineConfig, loadEnv, type PluginOption } from 'vite';
import { fileURLToPath } from 'node:url';
import { aiApi } from './server/ai-api';

// .env fica na RAIZ do projeto (ver .env.example). A chave da IA só é lida aqui, no servidor.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// `pnpm dev:https` → HTTPS na rede local, para testar a câmera num tablet/celular
// (navegadores só liberam câmera em https ou em localhost).
export default defineConfig(({ mode }) => ({
  // no GitHub Pages o app fica em /<nome-do-repositório>/ (a Action define BASE_PATH)
  base: process.env.BASE_PATH || '/',
  plugins: [
    aiApi({ ...process.env, ...loadEnv(mode, repoRoot, '') }),
    react(),
    tailwindcss(),
    mode === 'https' ? (basicSsl() as PluginOption) : null,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'LindaurIA',
        short_name: 'LindaurIA',
        description: 'Comunicação, autonomia e inteligência artificial para pessoas com ELA.',
        lang: 'pt-BR',
        theme_color: '#060A17',
        background_color: '#060A17',
        display: 'fullscreen',
        orientation: 'any',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // OFFLINE: guarda o app, as fontes, o modelo de rosto e o wasm do MediaPipe.
        globPatterns: ['**/*.{js,css,html,svg,woff2,wasm,task}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        // a IA nunca é servida do cache
        navigateFallbackDenylist: [new RegExp('^/api/')],
      },
    }),
  ],
  resolve: { dedupe: ['react', 'react-dom', 'framer-motion'] },
  // porta FIXA: se a porta mudar, o navegador trata como outro site e "perde" contas e ajustes
  server: { host: true, port: 5173, strictPort: true },
}));
