import { defineConfig } from 'vitest/config';

// Testes de lógica pura (filtros, dwell, gestos, previsão, contraste) rodam em Node.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
