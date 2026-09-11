import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type MetodoPagamento = "pix" | "boleto";
type CasoE2E = {
  modalidade: "camping" | "quarto_ventilador" | "quarto_ar_condicionado";
  nome: string;
  valor: number;
  metodo: MetodoPagamento;
  parcelas: number;
  valorTotalEsperado: string;
  descontoEsperado: string;
};

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
const outputDir = process.env.E2E_OUTPUT_DIR || path.join(process.env.TMPDIR || "/tmp", "comitiva-e2e-artifacts");
const timestamp = Date.now();

const casos: CasoE2E[] = [
  {
    modalidade: "camping",
    nome: "Camping E2E",
    valor: 1900,
    metodo: "pix",
    parcelas: 1,
    valorTotalEsperado: "1805.00",
    descontoEsperado: "95.00",
  },
  {
    modalidade: "quarto_ventilador",
    nome: "Quarto Ventilador E2E",
    valor: 2200,
    metodo: "boleto",
    parcelas: 2,
    valorTotalEsperado: "2200.00",
    descontoEsperado: "0.00",
  },
  {
    modalidade: "quarto_ar_condicionado",
    nome: "Quarto Ar-condicionado E2E",
    valor: 2600,
    metodo: "boleto",
    parcelas: 12,
    valorTotalEsperado: "2600.00",
    descontoEsperado: "0.00",
  },
];

function garantir(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

function gerarCpfValido(semente: number): string {
  const base = String(semente).replace(/\D/g, "").slice(-9).padStart(9, "1");
  const digito = (parcial: string) => {
    const soma = parcial.split("").reduce(
      (total, numero, indice) => total + Number(numero) * (parcial.length + 1 - indice),
      0,
    );
    const resto = (soma * 10) % 11;
    return resto === 10 ? "0" : String(resto);
  };
  const primeiro = digito(base);
  return `${base}${primeiro}${digito(`${base}${primeiro}`)}`;
}

async function requisitar<T>(
  caminho: string,
  opcoes: { method?: string; body?: unknown; token?: string; raw?: boolean } = {},
): Promise<T> {
  const response = await fetch(`${baseUrl}${caminho}`, {
    method: opcoes.method || "GET",
    headers: {
      ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
      ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });

  if (!response.ok) {
    const erro = await response.text();
    throw new Error(`${opcoes.method || "GET"} ${caminho} retornou HTTP ${response.status}: ${erro}`);
  }

  if (opcoes.raw) return Buffer.from(await response.arrayBuffer()) as T;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return await response.json() as T;
  return await response.text() as T;
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const loginAdmin = await requisitar<any>("/api/auth/login", {
    method: "POST",
    body: { email: "admin@comitivas.test", senha: "Comitiva@2026!Teste" },
  });
  const tokenAdmin = loginAdmin.token;
  garantir(tokenAdmin, "O login do administrador de teste não retornou token");

  const eventoResposta = await requisitar<any>("/api/eventos", {
    method: "POST",
    token: tokenAdmin,
    body: {
      nome: `Barretos E2E ${timestamp}`,
      descricao: "Evento isolado para validação automatizada do fluxo de reserva.",
      data_inicio: "2027-08-20T12:00:00.000Z",
      data_fim: "2027-08-24T16:00:00.000Z",
      local: "Parque do Peão, Barretos/SP",
    },
  });
  const eventoId = eventoResposta.evento?.id;
  garantir(eventoId, "A criação do evento E2E não retornou id");

  const loteResposta = await requisitar<any>("/api/lotes", {
    method: "POST",
    token: tokenAdmin,
    body: {
      evento_id: eventoId,
      nome: "Lote de validação E2E",
      descricao: "Lote isolado para as três modalidades de hospedagem.",
      vagas_totais: 50,
      vagas_disponiveis: 50,
      data_inicio: "2027-08-20T12:00:00.000Z",
      data_fim: "2027-08-24T16:00:00.000Z",
      data_embarque: "2027-08-19T23:59:00.000Z",
      data_retorno: "2027-08-24T23:59:00.000Z",
      local_embarque: "Brasília/DF, com embarque adicional em Goiânia/GO",
      local_hospedagem: "Chácara de validação — Barretos/SP",
      valor_base: 1000,
    },
  });
  const loteId = loteResposta.lote?.id;
  garantir(loteId, "A criação do lote E2E não retornou id");

  const pacotesPorModalidade = new Map<string, any>();
  for (const caso of casos) {
    const pacoteResposta = await requisitar<any>("/api/pacotes", {
      method: "POST",
      token: tokenAdmin,
      body: {
        lote_id: loteId,
        nome: caso.nome,
        descricao: `Pacote de teste para ${caso.modalidade}.`,
        valor_total: caso.valor,
        itens_selecionados: [],
        modalidade_hospedagem: caso.modalidade,
        ativo: true,
      },
    });
    garantir(pacoteResposta.pacote?.id, `O pacote ${caso.modalidade} não retornou id`);
    pacotesPorModalidade.set(caso.modalidade, pacoteResposta.pacote);
  }

  const pacotesPublicos = await requisitar<any>(`/api/pacotes/lotes/${loteId}/pacotes`);
  garantir(pacotesPublicos.pacotes?.length === 3, "A listagem pública não retornou exatamente os três pacotes publicados");
  for (const caso of casos) {
    garantir(
      pacotesPublicos.pacotes.some((pacote: any) => pacote.modalidade_hospedagem === caso.modalidade),
      `A modalidade ${caso.modalidade} não ficou pública`,
    );
  }

  const cpfBase = gerarCpfValido(timestamp);
  const cadastro = await requisitar<any>("/api/auth/cadastro", {
    method: "POST",
    body: {
      nome: "Cliente Validação E2E",
      email: `cliente.e2e.${timestamp}@comitivas.test`,
      cpf: cpfBase,
      rg: "E2E-2026-001",
      telefone: "61999990000",
      data_nascimento: "1994-06-15",
      estado_civil: "Solteiro(a)",
      profissao: "Analista de testes",
      endereco: "Quadra de Validação, Brasília/DF, CEP 70000-000",
      nacionalidade: "Brasileira",
      senha: "E2EComitiva@2026",
    },
  });
  const tokenCliente = cadastro.token;
  garantir(tokenCliente, "O cadastro do cliente E2E não retornou token");

  const crm = await requisitar<any>("/api/jornada/leads", { token: tokenAdmin });
  const leadDoCadastro = crm.leads?.find((lead: any) => lead.email === `cliente.e2e.${timestamp}@comitivas.test`);
  garantir(leadDoCadastro, "O cadastro direto não apareceu no CRM");
  garantir(leadDoCadastro.status === "cadastrado", "O cadastro direto apareceu no CRM com status incorreto");

  const dashboard = await requisitar<any>("/api/admin/dashboard", { token: tokenAdmin });
  garantir(Number(dashboard.resumo?.total_clientes) > 0, "O dashboard não contabilizou o cliente cadastrado");
  garantir(Number(dashboard.resumo?.total_leads_crm) > 0, "O dashboard não contabilizou o contato do CRM");

  const resultados: Array<Record<string, unknown>> = [];
  for (const caso of casos) {
    const pacote = pacotesPorModalidade.get(caso.modalidade);
    const reservaResposta = await requisitar<any>("/api/pacotes/reservar", {
      method: "POST",
      token: tokenCliente,
      body: { lote_id: loteId, pacote_id: pacote.id, itens: [] },
    });
    const reservaId = reservaResposta.reserva_id;
    garantir(reservaId, `A reserva para ${caso.modalidade} não retornou id`);

    const detalhes = await requisitar<any>(`/api/pacotes/reservas/${reservaId}`, { token: tokenCliente });
    garantir(detalhes.modalidade_hospedagem === caso.modalidade, `A reserva ${caso.modalidade} retornou modalidade incorreta`);
    garantir(detalhes.contratante?.rg === "E2E-2026-001", `Os dados contratuais não foram retornados para ${caso.modalidade}`);

    const aceite = await requisitar<any>(`/api/contratos/aceitar/${reservaId}`, {
      method: "POST",
      token: tokenCliente,
      body: { metodo_pagamento: caso.metodo, quantidade_parcelas: caso.parcelas },
    });
    garantir(aceite.condicao_pagamento?.valor_total === caso.valorTotalEsperado, `Valor contratual incorreto para ${caso.modalidade}`);
    garantir(aceite.condicao_pagamento?.desconto_pagamento === caso.descontoEsperado, `Desconto contratual incorreto para ${caso.modalidade}`);

    const pagamento = await requisitar<any>("/api/pagamentos/criar", {
      method: "POST",
      token: tokenCliente,
      body: { reserva_id: reservaId, metodo: caso.metodo },
    });
    garantir(pagamento.status === "pendente", `O pagamento de teste de ${caso.modalidade} deveria permanecer pendente`);
    garantir(!pagamento.qr_code && !pagamento.url_pagamento, "O modo de teste não deve retornar instruções de cobrança artificiais");

    const html = await requisitar<string>(`/api/contratos/visualizar/${reservaId}`, { token: tokenCliente });
    garantir(html.includes("Cliente Validação E2E"), `Nome do cliente ausente do contrato ${caso.modalidade}`);
    garantir(html.includes("E2E-2026-001"), `RG ausente do contrato ${caso.modalidade}`);
    garantir(html.includes("HENRIQUE SANTOS CUNHA"), `Contratada ausente do contrato ${caso.modalidade}`);
    garantir(html.includes("19/08/2027"), `Data de embarque ausente do contrato ${caso.modalidade}`);
    garantir(html.includes("Goiânia/GO"), `Ponto adicional de embarque ausente do contrato ${caso.modalidade}`);

    const rotulosModalidade: Record<CasoE2E["modalidade"], string> = {
      camping: "CAMPING",
      quarto_ventilador: "QUARTO COM VENTILADOR",
      quarto_ar_condicionado: "QUARTO COM AR-CONDICIONADO",
    };
    for (const [modalidade, rotulo] of Object.entries(rotulosModalidade) as Array<[CasoE2E["modalidade"], string]>) {
      const marcadorEsperado = modalidade === caso.modalidade ? "☒" : "☐";
      const marcadorNoContrato = new RegExp(`<span class="marcador">${marcadorEsperado}</span>\\s+${rotulo}`);
      garantir(marcadorNoContrato.test(html), `A marcação de ${modalidade} está incorreta no contrato ${caso.modalidade}`);
    }

    const pdf = await requisitar<Buffer>(`/api/contratos/download/${reservaId}`, { token: tokenCliente, raw: true });
    garantir(pdf.subarray(0, 4).toString() === "%PDF", `O download de ${caso.modalidade} não retornou PDF válido`);
    const pdfPath = path.join(outputDir, `contrato-${caso.modalidade}.pdf`);
    await writeFile(pdfPath, pdf);

    resultados.push({
      reserva_id: reservaId,
      modalidade: caso.modalidade,
      pagamento: caso.metodo,
      parcelas: caso.parcelas,
      valor_total: aceite.condicao_pagamento.valor_total,
      pdf: pdfPath,
    });
  }

  console.log(JSON.stringify({
    status: "ok",
    evento_id: eventoId,
    lote_id: loteId,
    reservas: resultados,
  }, null, 2));
}

main().catch((error) => {
  console.error("[E2E] Falha:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
