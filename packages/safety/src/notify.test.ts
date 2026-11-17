import { describe, expect, it, vi } from 'vitest';
import { NtfyNotifier, newAlertTopic } from './notify';

describe('Avisos à família (ntfy)', () => {
  it('texto vai em JSON, com acentos, para o tópico certo', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200 }));
    const n = new NtfyNotifier('https://ntfy.sh/', fetcher);
    await n.sendText('lindauria-abc', { title: '🆘 Emergência — Dona Lindaura', message: 'Falta de ar', priority: 5 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ntfy.sh');
    expect(JSON.parse(init.body as string)).toMatchObject({ topic: 'lindauria-abc', title: '🆘 Emergência — Dona Lindaura', priority: 5 });
  });
  it('foto vai como anexo, textos codificados na URL', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200 }));
    const n = new NtfyNotifier('https://ntfy.sh', fetcher);
    await n.sendPhoto('lindauria-abc', new Blob(['x']), 'foto-1.jpg', { title: 'Foto às 10:00', message: 'Situação', priority: 5 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/ntfy\.sh\/lindauria-abc\?/);
    expect(url).toContain('filename=foto-1.jpg');
    expect((init as RequestInit).method).toBe('PUT');
  });
  it('erro do servidor vira exceção (para tentar de novo)', async () => {
    const n = new NtfyNotifier('https://ntfy.sh', async () => ({ ok: false, status: 429 }));
    await expect(n.sendText('t', { title: 'a', message: 'b', priority: 5 })).rejects.toThrow('429');
  });
  it('tópicos são aleatórios e únicos', () => {
    const a = newAlertTopic();
    expect(a).toMatch(/^lindauria-[a-z2-7]{15}$/);
    expect(newAlertTopic()).not.toBe(a);
  });
});
