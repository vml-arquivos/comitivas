import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(process.cwd());
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

describe("períodos múltiplos dentro do pacote", () => {
  it("mantém migration forward-only e vínculo opcional na reserva", () => {
    const schema = ler("server/db/schema.ts");
    const migration = ler("drizzle/0024_periodos_por_pacote.sql");
    const journal = ler("drizzle/meta/_journal.json");
    expect(schema).toContain('pgTable("pacote_periodos"');
    expect(schema).toContain("periodo_id: text(\"periodo_id\")");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS pacote_periodos");
    expect(migration).toContain("ALTER TABLE reservas ADD COLUMN IF NOT EXISTS periodo_id TEXT");
    expect(journal).toContain('"tag": "0024_periodos_por_pacote"');
  });

  it("valida, publica e persiste o período escolhido sem mudar a unidade de inventário", () => {
    const rotas = ler("server/routes/pacotes.ts");
    const servico = ler("server/services/pacoteService.ts");
    const publico = ler("server/routes/publico.ts");
    expect(rotas).toContain('router.post("/:pacote_id/periodos"');
    expect(rotas).toContain('router.delete("/:pacote_id/periodos/:periodo_id"');
    expect(rotas).toContain("periodos");
    expect(servico).toContain("periodo_id: config.periodo_id || null");
    expect(servico).toContain("O período escolhido não pertence a este pacote");
    expect(publico).toContain("pacotePeriodos");
    expect(servico).toContain("lotes SET \"vagas_disponíveis\"");
  });

  it("faz o cliente escolher e retomar o período e remove o card após arquivamento/exclusão", () => {
    const configurador = ler("apps/web/src/pages/cliente/ConfiguradorPacote.tsx");
    const intent = ler("apps/web/src/utils/checkoutIntent.ts");
    const admin = ler("apps/web/src/pages/admin/Eventos.tsx");
    const exclusao = ler("server/services/catalogoExclusaoService.ts");
    expect(configurador).toContain("Escolha o período");
    expect(configurador).toContain("periodo_id: periodoId || undefined");
    expect(intent).toContain("periodoId?: string");
    expect(admin).toContain("Períodos vinculados ao pacote");
    expect(admin).toContain("AdminModal");
    expect(admin).toContain("periodosCentrais");
    expect(admin).toContain("adicionarPeriodoAoPacote");
    expect(admin).toContain("removerPeriodoDoPacote");
    expect(admin).toContain('type="date"');
    expect(admin).toContain("abrirCalendario");
    expect(admin).toContain("setPacotesPorLote");
    expect(admin).toContain("setPeriodosPacoteAberto(abrir ? pacoteId : null)");
    expect(admin).toContain("carregarPeriodosPacote(pacote.id)");
    expect(exclusao).toContain("DELETE FROM pacote_periodos");
  });

  it("interliga ônibus e quartos ao período e mantém a venda interna no mesmo fluxo", () => {
    const migration = ler("drizzle/0026_periodo_inventario_operacional.sql");
    const migrationOnibus = ler("drizzle/0027_periodo_por_onibus.sql");
    const schema = ler("server/db/schema.ts");
    const onibus = ler("server/services/operacaoOnibusService.ts");
    const periodoOperacional = ler("server/services/periodoOperacional.ts");
    const hospedagem = ler("server/services/hospedagemService.ts");
    const integridade = ler("server/services/contratacaoIntegridadeService.ts");
    const vendas = ler("apps/web/src/pages/admin/Vendas.tsx");
    expect(migration).toContain("ALTER TABLE saidas_operacionais");
    expect(migration).toContain("ALTER TABLE quartos_hospedagem");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS periodo_id");
    expect(migrationOnibus).toContain("ALTER TABLE onibus_operacionais");
    expect(migrationOnibus).toContain("ADD COLUMN IF NOT EXISTS periodo_id");
    expect(schema).toContain('periodo_id: text("periodo_id").references(() => pacotePeriodos.id)');
    expect(onibus).toContain("s.periodo_id");
    expect(onibus).toContain("o.periodo_id");
    expect(onibus).toContain("periodo_nome");
    expect(onibus).toContain("mesmo período de calendário da saída");
    expect(onibus).toContain("periodoOperacionalCompativel");
    expect(periodoOperacional).toContain("DATE(periodo_solicitado.data_inicio)");
    expect(periodoOperacional).toContain("periodoReservadoColunaCompativel");
    expect(hospedagem).toContain("q.periodo_id");
    expect(hospedagem).toContain("const periodoId = texto(input?.periodo_id");
    expect(integridade).toContain("periodoOperacionalCompativel");
    expect(integridade).toContain("q.periodo_id = ${reserva.periodo_id}");
    expect(vendas).toContain("periodo_id: periodoId || undefined");
    expect(vendas).toContain("Período da viagem");
    expect(vendas).toContain("selecionarPeriodo");
    expect(vendas).toContain("periodo_id: id");
    expect(vendas).toContain("forma_contratacao: formaContratacao");
  });

  it("mantém o mapa de ônibus compatível com PostgreSQL e entrega o catálogo completo ao comercial", () => {
    const onibus = ler("server/services/operacaoOnibusService.ts");
    const pacotes = ler("server/routes/pacotes.ts");
    const vendas = ler("apps/web/src/pages/admin/Vendas.tsx");
    expect(onibus).toContain("GROUP BY o.id, pp.nome, ep.nome");
    expect(onibus).toContain("o.evento_periodo_id");
    expect(pacotes).toContain("ativo: pacote.ativo");
    expect(pacotes).toContain("lote_id: pacote.lote_id");
    expect(vendas).toContain("Promise.allSettled");
    expect(vendas).toContain("Selecione um dos pacotes publicados");
  });

  it("centraliza os períodos da excursão e permite selecionar a mesma janela em cada pacote", () => {
    const migration = ler("drizzle/0033_periodos_centrais_excursao.sql");
    const servico = ler("server/services/periodoExcursaoService.ts");
    const eventos = ler("server/routes/eventos.ts");
    const rotas = ler("server/routes/pacotes.ts");
    const admin = ler("apps/web/src/pages/admin/Eventos.tsx");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS evento_periodos");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS evento_periodo_id");
    expect(servico).toContain("adicionarAoPacote");
    expect(servico).toContain("removerDoPacote");
    expect(eventos).toContain('router.post("/:evento_id/periodos"');
    expect(rotas).toContain('router.post("/:pacote_id/periodos-excursao/:evento_periodo_id"');
    expect(rotas).toContain('router.delete("/:pacote_id/periodos-excursao/:evento_periodo_id"');
    expect(admin).toContain("Janelas disponíveis para todos os pacotes");
  });

  it("permite escolher o escopo de contratação por pacote sem romper o legado", () => {
    const schema = ler("server/db/schema.ts");
    const migration = ler("drizzle/0028_formas_contratacao_pacotes.sql");
    const recursos = ler("server/services/contratacaoRecursos.ts");
    const rotas = ler("server/routes/pacotes.ts");
    const configurador = ler("apps/web/src/pages/cliente/ConfiguradorPacote.tsx");
    const vendas = ler("apps/web/src/pages/admin/Vendas.tsx");
    expect(schema).toContain('formas_contratacao: jsonb("formas_contratacao")');
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS formas_contratacao JSONB");
    expect(migration).toContain("modalidade_hospedagem = 'camping'");
    expect(recursos).toContain("normalizarFormasContratacao");
    expect(rotas).toContain("formas_contratacao: comercial.formas_contratacao");
    expect(configurador).toContain("formasPublicas");
    expect(configurador).toContain("disponibilidade_por_forma");
    expect(vendas).toContain("Tipo de contratação");
    expect(vendas).toContain("formasDoPacote");
  });

  it("devolve a configuração completa para hidratar a edição do pacote", () => {
    const rotas = ler("server/routes/pacotes.ts");
    const admin = ler("apps/web/src/pages/admin/Eventos.tsx");
    expect(rotas).toContain("onibus_config: pacote.onibus_config");
    expect(rotas).toContain("configuracao_pagamento: pacote.configuracao_pagamento");
    expect(rotas).toContain("data_limite_pagamento: dataIsoSegura(pacote.data_limite_pagamento)");
    expect(admin).toContain("pacote.configuracao_pagamento || {}");
    expect(admin).toContain("pacote.onibus_config?.length || 1");
    expect(admin).toContain("pacote.data_limite_pagamento ? paraDataInput");
  });
});
