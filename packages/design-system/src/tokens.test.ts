import { describe, expect, it } from 'vitest';
import { TEXT_TOKENS, THEMES, contrastRatio } from './tokens';

describe('Contraste WCAG AAA (≥ 7:1) em todos os temas', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const token of TEXT_TOKENS) {
      for (const bg of ['bgDeep', 'bgSurfaceSolid'] as const) {
        it(`${name}: ${token} sobre ${bg}`, () => {
          expect(contrastRatio(t[token], t[bg])).toBeGreaterThanOrEqual(7);
        });
      }
    }
  }
});
