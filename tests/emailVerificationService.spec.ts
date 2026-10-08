import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn(), send: vi.fn() }));
vi.mock('../server/db/index.js', () => ({ db: { select: mocks.select, update: mocks.update, insert: mocks.insert } }));
vi.mock('../server/services/notificationProvider.js', () => ({ EmailProvider: class { sendEmailVerification = mocks.send; } }));
import { emitirConfirmacaoEmail } from '../server/services/emailVerificationService.js';
const usuario = { id: 'cliente-teste', nome: 'Cliente', email: 'cliente@example.com' };
describe('confirmação de e-mail compartilhada entre cadastro público e administrativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
    mocks.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
    mocks.insert.mockReturnValue({ values: async () => undefined });
    mocks.send.mockResolvedValue({ sent: true });
  });
  it('persiste somente o hash e envia o código ao endereço do cliente', async () => {
    expect(await emitirConfirmacaoEmail(usuario)).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith(usuario.email, usuario.nome, expect.stringMatching(/^\d{6}$/));
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it('invalida o desafio quando o provedor rejeita o envio', async () => {
    mocks.send.mockResolvedValue({ sent: false, reason: 'SMTP não configurado' });
    expect(await emitirConfirmacaoEmail(usuario)).toBe(false);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
  it('não envia novamente durante a janela de 60 segundos', async () => {
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: 'recente' }] }) }) });
    expect(await emitirConfirmacaoEmail(usuario)).toBe(true);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
