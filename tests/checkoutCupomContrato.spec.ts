import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { dataBancoOuNula } from "../server/services/otpService.js";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("checkout, cupom e contrato", () => {
  it("preserva o cupom durante login e retomada da compra", async () => {
    const [configurador, intent] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx"),
      fonte("../apps/web/src/utils/checkoutIntent.ts"),
    ]);

    expect(intent).toContain("cupomCodigo?: string");
    expect(configurador).toContain("setCupomCodigo(intencaoSalva.cupomCodigo || '')");
    expect(configurador).toContain("cupomCodigo: cupomCodigo.trim() || undefined");
    expect(configurador).toContain("cupom_codigo: cupomCodigo.trim() || undefined");
    expect(configurador).toContain("lead_intent_token: leadIntentToken || undefined");
  });

  it("mostra no checkout o cupom realmente persistido pelo backend", async () => {
    const [checkout, rota] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/Checkout.tsx"),
      fonte("../server/routes/pacotes.ts"),
    ]);

    expect(checkout).toContain("reserva?.desconto_cupom ?? reserva?.desconto_aplicado");
    expect(checkout).toContain("reserva?.cupom_codigo");
    expect(rota).toContain("cupom_codigo: cupomSelecionado?.codigo || null");
    expect(rota).toContain("desconto_cupom: reserva[0].desconto_aplicado");
    expect(rota).toContain('res.status(400).json({ erro: error?.message');
  });

  it("serializa datas do checkout sem assumir que o driver devolveu Date", async () => {
    const rota = await fonte("../server/routes/pacotes.ts");
    expect(rota).toContain("function dataIsoSegura(valor: unknown)");
    expect(rota).not.toContain("dataLimite?.toISOString()");
    expect(rota).not.toContain("dataLimitePagamento?.toISOString()");
  });

  it("disponibiliza a minuta em PDF sem regenerar contratos já assinados", async () => {
    const [checkout, rota] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/Checkout.tsx"),
      fonte("../server/routes/contratos.ts"),
    ]);
    expect(checkout).toContain("Baixar minuta");
    expect(checkout).toContain("contrato_id=");
    expect(rota).toContain('X-Contract-Document');
    expect(rota).toContain('["rascunho", "aguardando_validacao", "preparado"]');
    expect(rota).toContain("Nenhuma regeneração foi realizada");
  });

  it("exige documento validado no backend quando o gate estiver ativo", async () => {
    const rota = await fonte("../server/routes/contratos.ts");
    expect(rota).toContain('DOCUMENT_IDENTITY_REQUIRED_FOR_CONTRACT');
    expect(rota).toContain('eq(clienteDocumentos.validacao_status, "aprovado")');
    expect(rota).toContain("Envie e valide um documento de identificação com foto");
  });

  it("orienta o cliente a completar o cadastro e enviar o documento dentro do checkout", async () => {
    const [checkout, contratos, pagamentos] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/Checkout.tsx"),
      fonte("../server/routes/contratos.ts"),
      fonte("../server/routes/pagamentos.ts"),
    ]);
    expect(checkout).toContain("Completar cadastro e continuar");
    expect(checkout).toContain("enviarDocumento");
    expect(checkout).toContain("/cliente/documentos/identidade?tipo_identidade=");
    expect(checkout).toContain("documento_identidade?.validado");
    expect(contratos).toContain("campos_faltantes: faltantesCadastro");
    expect(contratos).toContain("documento_identidade:");
    expect(pagamentos).toContain('codigo: "CADASTRO_INCOMPLETO"');
    expect(pagamentos).toContain("camposFaltantesCadastroMinimo");
  });

  it("aprova automaticamente somente após documento válido e cadastro completo", async () => {
    const [rota, service] = await Promise.all([
      fonte("../server/routes/cliente.ts"),
      fonte("../server/services/cadastroAprovacaoService.ts"),
    ]);
    expect(rota).toContain("aprovarCadastroSeElegivel");
    expect(service).toContain("camposFaltantesCadastroMinimo(usuario)");
    expect(service).toContain("automatico_documento_validado");
    expect(service).toContain("cadastro_aprovado_automaticamente");
    expect(service).toContain("pg_advisory_xact_lock");
  });

  it("persiste o message_id somente após confirmação do provedor de e-mail", async () => {
    const [email, outbox] = await Promise.all([
      fonte("../server/services/emailService.ts"),
      fonte("../server/services/notificationOutboxService.ts"),
    ]);
    expect(email).toContain("enviarEmailDetalhado");
    expect(outbox).toContain("envio.sent");
    expect(outbox).toContain("message_id: envio.messageId || null");
    expect(outbox).toContain("status: \"falhou\"");
  });

  it("enfileira contrato e dados da cobrança após geração Cora", async () => {
    const pagamentos = await fonte("../server/routes/pagamentos.ts");
    expect(pagamentos).toContain("enfileirarCobrancaGerada");
    expect(pagamentos).toContain("cobranca-gerada:${params.idempotencyKey}");
    expect(pagamentos).toContain("anexoContratoSeDisponivel");
    expect(pagamentos).toContain("Cobrança gerada");
    expect(pagamentos).toContain("enfileirarPagamentoQuitado");
    expect(pagamentos).toContain("pagamento-quitado:${reservaId}");
  });

  it("reavalia aprovação automática quando o cliente completa o perfil", async () => {
    const auth = await fonte("../server/routes/auth.ts");
    const service = await fonte("../server/services/cadastroAprovacaoService.ts");
    expect(auth).toContain("aprovarCadastroSeElegivel(req.usuario.id)");
    expect(auth).toContain("aprovacao_automatica");
    expect(service).toContain("documentoId?: string | null");
    expect(service).toContain("orderBy(desc(clienteDocumentos.validado_em)");
    expect(service).toContain("pg_advisory_xact_lock");
  });

  it("normaliza o timestamp bruto do desafio antes de registrar a validação OTP", async () => {
    const otp = await fonte("../server/services/otpService.ts");
    expect(otp).toContain("function dataBancoOuNula(valor: unknown)");
    expect(otp).toContain("enviado_em: dataBancoOuNula(desafio.enviado_em)");
    expect(otp).not.toContain("enviado_em: desafio.enviado_em || null");
    expect(dataBancoOuNula("2026-09-11T02:00:00.000Z")).toEqual(new Date("2026-09-11T02:00:00.000Z"));
    expect(dataBancoOuNula("data-inválida")).toBeNull();
  });
});
