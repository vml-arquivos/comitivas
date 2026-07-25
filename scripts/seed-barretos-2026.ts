import "dotenv/config";
import { db, closeDatabase } from "../server/db/index.js";
import { eventos, lotes, pacotes } from "../server/db/schema.js";
import { eq } from "drizzle-orm";

// Datas oficiais da 71ª Festa do Peão de Barretos 2026: 20 a 30/08/2026
// (confirmadas pela Associação Os Independentes em maio/2026).
// A excursão roda em dois lotes de fim de semana, conforme os valores
// "individuais para 1º fim de semana ou pro 2º fim de semana" informados.
const EVENTO_NOME = "Excursão das Comitivas — Festa do Peão de Barretos 2026";
const EVENTO_LOCAL = "Barretos/SP — Parque do Peão";

// Ajuste os horários de ida/volta aqui se o operacional definir outros.
const LOTES = [
  {
    nome: "1º Fim de Semana — 20 a 23/08/2026",
    descricao: "Saída de Brasília/DF na noite de 19/08, retorno na noite de 23/08.",
    data_inicio: "2026-08-19T23:59:00-03:00",
    data_fim: "2026-08-23T23:59:00-03:00",
  },
  {
    nome: "2º Fim de Semana — 27 a 30/08/2026",
    descricao: "Saída de Brasília/DF na noite de 26/08, retorno na noite de 30/08.",
    data_inicio: "2026-08-26T23:59:00-03:00",
    data_fim: "2026-08-30T23:59:00-03:00",
  },
];

// Valores base por pessoa (individuais), conforme tabela vigente.
// Ajuste aqui se os valores forem revisados antes do lançamento.
const PACOTES = [
  {
    modalidade: "camping" as const,
    nome: "Camping",
    valor: "1900.00",
    descricao: "Área totalmente gramada, banheiros externos, pontos de energia e segurança. Cliente leva o próprio material.",
  },
  {
    modalidade: "quarto_ventilador" as const,
    nome: "Quarto compartilhado com ventilador",
    valor: "2200.00",
    descricao: "Quarto suíte para 5 a 6 pessoas, separado por gênero (feminino/masculino), com ventilador.",
  },
  {
    modalidade: "quarto_ar_condicionado" as const,
    nome: "Quarto compartilhado com ar-condicionado",
    valor: "2600.00",
    descricao: "Quarto suíte para 5 a 6 pessoas, separado por gênero (feminino/masculino), com ar-condicionado.",
  },
];

// Itens inclusos em todos os pacotes (refletidos no contrato e na página do pacote).
const ITENS_INCLUSOS = [
  "Transporte rodoviário terrestre de ida e volta (Brasília/DF ⇄ Barretos/SP, com embarque em Goiânia)",
  "Hospedagem na chácara (4 dias)",
  "Café da manhã e almoço",
  "10h de Open Bar na chácara (água, refrigerante, energético, vodka, gin, cerveja, paratudo)",
  "Barman fazendo drinks",
  "DJ durante o dia + som automotivo",
  "Piscina liberada",
  "Translado chácara ⇄ Parque do Peão",
];

async function seed() {
  console.log("[SEED] Verificando se o evento já existe...");
  const existente = await db.select().from(eventos).where(eq(eventos.nome, EVENTO_NOME)).limit(1);

  let eventoId: string;
  if (existente[0]) {
    eventoId = existente[0].id;
    console.log(`[SEED] Evento já existe (id: ${eventoId}), reaproveitando.`);
  } else {
    const [evento] = await db.insert(eventos).values({
      nome: EVENTO_NOME,
      descricao: "Excursão da Excursão das Comitivas para a 71ª Festa do Peão de Barretos, com transporte, hospedagem em chácara, open bar e translado incluídos.",
      data_inicio: new Date(LOTES[0].data_inicio),
      data_fim: new Date(LOTES[LOTES.length - 1].data_fim),
      local: EVENTO_LOCAL,
    }).returning();
    eventoId = evento.id;
    console.log(`[SEED] Evento criado (id: ${eventoId}).`);
  }

  for (const loteDef of LOTES) {
    const loteExistente = await db.select().from(lotes)
      .where(eq(lotes.nome, loteDef.nome)).limit(1);

    let loteId: string;
    if (loteExistente[0]) {
      loteId = loteExistente[0].id;
      console.log(`[SEED] Lote "${loteDef.nome}" já existe (id: ${loteId}), reaproveitando.`);
    } else {
      const [lote] = await db.insert(lotes).values({
        evento_id: eventoId,
        nome: loteDef.nome,
        descricao: loteDef.descricao,
        vagas_totais: 40,
        "vagas_disponíveis": 40,
        data_inicio: new Date(loteDef.data_inicio),
        data_fim: new Date(loteDef.data_fim),
        valor_base: "1900.00",
      }).returning();
      loteId = lote.id;
      console.log(`[SEED] Lote "${loteDef.nome}" criado (id: ${loteId}).`);
    }

    for (const pacoteDef of PACOTES) {
      const pacoteExistente = await db.select().from(pacotes)
        .where(eq(pacotes.lote_id, loteId)).limit(50);
      const jaTemModalidade = pacoteExistente.some((p) => p.modalidade_hospedagem === pacoteDef.modalidade);

      if (jaTemModalidade) {
        console.log(`[SEED]   Pacote "${pacoteDef.nome}" já existe para este lote, pulando.`);
        continue;
      }

      await db.insert(pacotes).values({
        lote_id: loteId,
        nome: `${pacoteDef.nome} — ${loteDef.nome}`,
        descricao: pacoteDef.descricao,
        valor_total: pacoteDef.valor,
        itens_selecionados: ITENS_INCLUSOS,
        modalidade_hospedagem: pacoteDef.modalidade,
        disponibilidade: "disponivel",
      });
      console.log(`[SEED]   Pacote "${pacoteDef.nome}" criado (R$ ${pacoteDef.valor}).`);
    }
  }

  console.log("[SEED] Concluído.");
}

seed()
  .then(() => closeDatabase())
  .catch(async (erro) => {
    console.error("[SEED] Erro:", erro);
    await closeDatabase();
    process.exit(1);
  });
