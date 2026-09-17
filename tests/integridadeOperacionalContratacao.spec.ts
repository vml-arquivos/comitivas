import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolverRecursosContratacao } from "../server/services/contratacaoRecursos.js";

const raiz = path.resolve(process.cwd());
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

describe("integridade operacional da contratação", () => {
  it("mantém transporte e hospedagem como recursos autoritativos", () => {
    expect(resolverRecursosContratacao("onibus_hospedagem", "quarto_ar_condicionado")).toEqual({
      transporte: true,
      hospedagem: true,
      estrutura_quarto: "ar_condicionado",
    });
  });

  it("reconcilia vaga física antes de contrato, OTP e pagamento", () => {
    const contratos = ler("server/routes/contratos.ts");
    const pagamentos = ler("server/routes/pagamentos.ts");
    expect(contratos).toContain('origem: "preparar_contrato"');
    expect(contratos).toContain('origem: "solicitar_otp"');
    expect(contratos).toContain('origem: "confirmar_otp"');
    expect(contratos).toContain('origem: "aceitar_contrato"');
    expect(pagamentos).toContain('origem: "criar_pagamento"');
    expect(pagamentos).toContain("converterHold: true");
  });

  it("converte o hold dentro da mesma transação que assina o contrato", () => {
    const otp = ler("server/services/otpService.ts");
    expect(otp).toContain("converterHoldNaTransacao(tx, input.reserva_id)");
    expect(otp.indexOf("converterHoldNaTransacao(tx, input.reserva_id)")).toBeLessThan(otp.indexOf("gerarContratoPDF"));
    const integridade = ler("server/services/contratacaoIntegridadeService.ts");
    expect(integridade).toContain("Barreira atômica da assinatura");
    expect(integridade).toContain("SELECT id FROM assento_alocacoes");
    expect(integridade).toContain("SELECT id FROM quarto_alocacoes");
    expect(integridade).toContain("FOR SHARE");
  });

  it("garante uma alocação ativa por viajante e corrige sobras", () => {
    const integridade = ler("server/services/contratacaoIntegridadeService.ts");
    expect(integridade).toContain("assentosAtivos !== quantidadePessoas");
    expect(integridade).toContain("quartosAtivos !== quantidadePessoas");
    expect(integridade).toContain("assento_reconciliado_contratacao");
    expect(integridade).toContain("hospede_reconciliado_contratacao");
    expect(integridade).toContain("Reconciliação de quantidade contratada");
  });

  it("não reaproveita silenciosamente carrinho de outro pacote ou escopo", () => {
    const pacote = ler("server/services/pacoteService.ts");
    const rota = ler("server/routes/pacotes.ts");
    expect(pacote).toContain("pacoteDiferente");
    expect(pacote).toContain("snapshotDivergenteDoCatalogo");
    expect(pacote).toContain('checkout_estado: "troca_pacote_cliente"');
    expect(rota).toContain("retomarCarrinho(req.usuario.id, config.lote_id, { pacote_id: config.pacote_id, periodo_id: config.periodo_id, forma_contratacao: config.forma_contratacao, transporte_proprio: config.transporte_proprio })");
  });

  it("impede liberar recurso físico de contrato já assinado sem remanejamento/cancelamento", () => {
    const onibus = ler("server/services/operacaoOnibusService.ts");
    const hospedagem = ler("server/services/hospedagemService.ts");
    expect(onibus).toContain("contrato validado com transporte");
    expect(hospedagem).toContain("hospedagem pertence a um contrato validado");
  });

  it("usa a mesma barreira de integridade nas vendas internas", () => {
    const admin = ler("server/routes/admin.ts");
    expect(admin).toContain('origem: "venda_interna"');
    expect(admin).not.toContain("OperacaoOnibusService.alocarPrimeiroDisponivel");
  });

  it("não usa parâmetro sem tipo em IS NOT NULL ao buscar participantes", () => {
    const integridade = ler("server/services/contratacaoIntegridadeService.ts");
    const pacotes = ler("server/routes/pacotes.ts");
    expect(integridade).toContain("OR grupo_id = ${reserva.grupo_id || null}");
    expect(integridade).not.toContain("${reserva.grupo_id} IS NOT NULL");
    expect(pacotes).toContain("function mensagemErroPublica");
    expect(pacotes).toContain("failed query:|params:|syntax error");
  });

  it("limpa ponteiros de assento e quarto quando o hold é liberado", () => {
    const inventario = ler("server/services/inventoryService.ts");
    expect(inventario).toContain("SET assento_id = NULL, quarto_id = NULL, vaga_quarto_id = NULL");
  });

  it("usa o contrato já assinado como autoridade para reparar reservas legadas", () => {
    const integridade = ler("server/services/contratacaoIntegridadeService.ts");
    expect(integridade).toContain("recursosDoContratoValidado");
    expect(integridade).toContain("rodoviario_incluido");
    expect(integridade).toContain("modelo_oficial");
    expect(integridade).toContain("recursosAutoritativos(reserva, contratoValidado?.snapshot)");
  });

  it("reconcilia contratos já assinados no startup", () => {
    const index = ler("server/index.ts");
    const integridade = ler("server/services/contratacaoIntegridadeService.ts");
    expect(index).toContain("reconciliarContratosValidados(500)");
    expect(integridade).toContain('origem: "reconciliacao_startup"');
  });
});
