import { describe, expect, it } from 'vitest';
import { validateSignUp, isValidEmail } from './auth';

const ok = { name: 'Ana', email: 'ana@exemplo.com', password: 'segredo1', role: 'cuidador' as const, consent: true };

describe('Cadastro', () => {
  it('aceita dados válidos', () => {
    expect(validateSignUp(ok)).toBeNull();
  });
  it('exige nome, e-mail válido, senha de 6+ e consentimento LGPD', () => {
    expect(validateSignUp({ ...ok, name: 'A' })).toBe('nome-curto');
    expect(validateSignUp({ ...ok, email: 'ana@' })).toBe('email-invalido');
    expect(validateSignUp({ ...ok, password: '123' })).toBe('senha-curta');
    expect(validateSignUp({ ...ok, consent: false })).toBe('sem-consentimento');
  });
  it('valida e-mail', () => {
    expect(isValidEmail(' maria.silva@gmail.com ')).toBe(true);
    expect(isValidEmail('maria@gmail')).toBe(false);
  });
});
