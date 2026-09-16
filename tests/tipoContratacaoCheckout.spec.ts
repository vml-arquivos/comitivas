import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("seleção explícita do tipo de contratação", () => {
  it("mostra as três opções antes do pacote e persiste a escolha", async () => {
    const [configurador, intent] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx"),
      fonte("../apps/web/src/utils/checkoutIntent.ts"),
    ]);
    expect(configurador).toContain("O que você quer contratar?");
    expect(configurador).toContain("Transporte + hospedagem");
    expect(configurador).toContain("Somente hospedagem");
    expect(configurador).toContain("Somente transporte");
    expect(configurador).toContain("forma_contratacao: formaContratacao");
    expect(configurador).toContain("Nenhum contrato será definido automaticamente pelo link");
    expect(configurador).not.toContain("if (formasAtivas.length === 1) setFormaContratacao");
    expect(configurador).not.toContain("if (selecionado) setFormaContratacao");
    expect(intent).toContain("formaContratacao?: 'onibus' | 'hospedagem' | 'onibus_hospedagem'");
  });

  it("não inventa preço: cada tipo só usa pacote publicado para aquele escopo", async () => {
    const configurador = await fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx");
    const servico = await fonte("../server/services/pacoteService.ts");
    expect(configurador).toContain("formasPublicas(pacote).includes(formaContratacao)");
    expect(configurador).toContain("O preço exibido é o preço real desse pacote");
    expect(servico).toContain("validarFormaContratacaoSelecionada(config, pacoteSelecionado)");
    expect(servico).toContain("O tipo de contratação escolhido não está habilitado neste pacote");
    expect(servico).toContain("Este pacote precisa ter ao menos um tipo de contratação configurado no Admin antes de ser vendido");
    expect(configurador).toContain("disponibilidade_por_forma");
    expect(configurador).toContain("return [];");
  });

  it("confirma novamente o escopo no checkout antes do contrato/pagamento", async () => {
    const checkout = await fonte("../apps/web/src/pages/cliente/Checkout.tsx");
    expect(checkout).toContain("Tipo de contratação");
    expect(checkout).toContain("tipoContratacaoLabel");
    expect(checkout).toContain("Este é o escopo que será usado no contrato e na operação da sua reserva");
  });

  it("permite ao admin habilitar formas de contratação no pacote", async () => {
    const admin = await fonte("../apps/web/src/pages/admin/Eventos.tsx");
    expect(admin).toContain("Formas de contratação habilitadas");
    expect(admin).toContain("Cada pacote tem seu próprio preço, modalidade, contratação e galeria");
    expect(admin).toContain("onibus_hospedagem");
    expect(admin).not.toContain('value="livre">Legado / livre');
    expect(admin).toContain("modeloContrato(pacoteForm.formaContratacao)");
  });
});


describe("correção de dados do catálogo em produção", () => {
  it("corrige especificamente o quarto ar-condicionado R$ 3.200 de Barretos 2027", async () => {
    const migration = await fonte("../drizzle/0022_corrige_escopo_comercial_pacotes.sql");
    expect(migration).toContain("p.valor_total = 3200.00");
    expect(migration).toContain("p.modalidade_hospedagem = 'quarto_ar_condicionado'");
    expect(migration).toContain("EXTRACT(YEAR FROM l.data_inicio) = 2027");
    expect(migration).toContain("forma_contratacao = 'onibus_hospedagem'");
  });

  it("expõe a condição de pagamento junto da oferta antes do checkout", async () => {
    const [configurador, rota] = await Promise.all([
      fonte("../apps/web/src/pages/cliente/ConfiguradorPacote.tsx"),
      fonte("../server/routes/pacotes.ts"),
    ]);
    expect(configurador).toContain("Pagamento");
    expect(configurador).toContain("rotuloPagamento");
    expect(rota).toContain("formas_pagamento: regras.formasPermitidas");
    expect(rota).toContain("boleto_parcelas_maximo");
  });
});
