import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

type AtorExclusao = { id: string; tipo: string; ip?: string | null; userAgent?: string | null };

type ResumoExclusao = {
  reservas: number;
  contratos: number;
  pagamentos: number;
  documentos: number;
};

export type ResultadoExclusaoCliente = {
  modo: "excluido_definitivamente";
  mensagem: string;
  removidos: ResumoExclusao;
};

export class ErroExclusaoCliente extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function linhas(resultado: unknown): any[] {
  return Array.isArray((resultado as { rows?: unknown[] } | undefined)?.rows)
    ? (resultado as { rows: any[] }).rows
    : [];
}

export function confirmacaoExclusaoClienteValida(confirmacao: unknown, email: string): boolean {
  return String(confirmacao || "").trim().toLowerCase() === email.trim().toLowerCase();
}

function numero(valor: unknown): number {
  const convertido = Number(valor || 0);
  return Number.isFinite(convertido) ? convertido : 0;
}

async function removerArquivosGerenciados(clienteId: string, arquivos: string[]): Promise<number> {
  const base = path.resolve(process.env.STORAGE_PATH || "./uploads");
  const candidatos = new Set(arquivos.map((arquivo) => path.resolve(arquivo)).filter((arquivo) => arquivo.startsWith(`${base}${path.sep}`)));
  const pastaCliente = path.resolve(base, "clientes", clienteId);
  if (pastaCliente.startsWith(`${base}${path.sep}`)) candidatos.add(pastaCliente);

  const resultados = await Promise.allSettled([...candidatos].map((arquivo) => fs.rm(arquivo, { recursive: true, force: true })));
  const falhas = resultados.filter((resultado) => resultado.status === "rejected").length;
  if (falhas > 0) console.error(`[CLIENTE/EXCLUSAO] ${falhas} arquivo(s) não puderam ser removidos do storage`);
  return falhas;
}

/**
 * Limpeza individual de dados de teste. Esta operação é intencionalmente
 * separada do fluxo normal de exclusão/arquivamento e só é exposta ao DEV.
 * Toda a árvore relacional é removida na mesma transação; se uma FK nova não
 * estiver coberta, o PostgreSQL desfaz a operação inteira.
 */
export class ClienteExclusaoService {
  static async excluirDefinitivamente(
    clienteId: string,
    confirmacao: unknown,
    ator: AtorExclusao,
  ): Promise<ResultadoExclusaoCliente> {
    if (!clienteId || clienteId === ator.id) throw new ErroExclusaoCliente("Não é possível excluir o próprio acesso", 409);

    const resultado = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cliente-purgar:${clienteId}`}))`);
      const cliente = linhas(await tx.execute(sql`
        SELECT id, email, tipo FROM usuarios WHERE id = ${clienteId} FOR UPDATE
      `))[0] as { id: string; email: string; tipo: string } | undefined;

      if (!cliente || cliente.tipo !== "cliente") throw new ErroExclusaoCliente("Cliente não encontrado", 404);
      if (!confirmacaoExclusaoClienteValida(confirmacao, cliente.email)) {
        throw new ErroExclusaoCliente("Confirmação inválida. Digite o e-mail completo do cliente.", 400);
      }

      const resumoLinha = linhas(await tx.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM reservas WHERE usuario_id = ${clienteId}) AS reservas,
          (SELECT COUNT(*) FROM contratos_documentos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})) AS contratos,
          (SELECT COUNT(*) FROM pagamentos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})) AS pagamentos,
          (SELECT COUNT(*) FROM cliente_documentos WHERE usuario_id = ${clienteId}) AS documentos
      `))[0] || {};
      const removidos: ResumoExclusao = {
        reservas: numero(resumoLinha.reservas),
        contratos: numero(resumoLinha.contratos),
        pagamentos: numero(resumoLinha.pagamentos),
        documentos: numero(resumoLinha.documentos),
      };

      const arquivos = linhas(await tx.execute(sql`
        SELECT arquivo FROM contratos_documentos
        WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) AND arquivo IS NOT NULL
        UNION
        SELECT arquivo FROM cliente_documentos WHERE usuario_id = ${clienteId} AND arquivo IS NOT NULL
      `)).map((item) => String(item.arquivo || "")).filter(Boolean);

      await tx.execute(sql`SELECT id FROM reservas WHERE usuario_id = ${clienteId} FOR UPDATE`);

      // Devolve somente vagas que ainda estavam retidas por reservas removidas.
      await tx.execute(sql`
        WITH devolucao AS (
          SELECT lote_id, SUM(quantidade)::integer AS quantidade
          FROM inventario_holds
          WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})
            AND status IN ('ativo', 'convertido')
          GROUP BY lote_id
        )
        UPDATE lotes l
        SET "vagas_disponíveis" = LEAST(l.vagas_totais, l."vagas_disponíveis" + d.quantidade),
            atualizado_em = CURRENT_TIMESTAMP
        FROM devolucao d WHERE l.id = d.lote_id
      `);

      // Rompe o ciclo reservas <-> inventario_holds e remove filhos das reservas.
      await tx.execute(sql`UPDATE reservas SET inventario_hold_id = NULL WHERE usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM assento_holds WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) OR usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM assento_alocacoes WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) OR usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM checkins_operacao WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM contrato_eventos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM otp_desafios WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) OR usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM contrato_validacoes WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) OR usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM contratos_documentos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM pagamento_parcelas WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM pagamento_idempotencias WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM webhook_eventos WHERE recurso_id IN (
        SELECT id FROM pagamentos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})
        UNION SELECT gateway_id FROM pagamentos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) AND gateway_id IS NOT NULL
      )`);
      await tx.execute(sql`DELETE FROM pagamentos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM emails_enviados WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM consentimentos_imagem WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) OR usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM precos_ledger WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM inventario_holds WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM notificacoes_outbox WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM descontos_administrativos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM comissoes WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM cupons_utilizacoes WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) OR usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM cliente_documentos WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) OR usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM avaliacoes WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ${clienteId}) OR usuario_id = ${clienteId}`);

      // Remove o vínculo de CRM antes de apagar as reservas e o lead do cliente.
      await tx.execute(sql`UPDATE reservas SET lead_id = NULL WHERE lead_id IN (
        SELECT id FROM leads_origem WHERE usuario_id = ${clienteId} OR LOWER(email) = LOWER(${cliente.email})
      )`);
      await tx.execute(sql`DELETE FROM reservas WHERE usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM leads_origem WHERE usuario_id = ${clienteId} OR LOWER(email) = LOWER(${cliente.email})`);

      // Dados diretamente pertencentes ao cadastro.
      await tx.execute(sql`DELETE FROM cliente_documentos WHERE usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM cliente_historico WHERE usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM verificacoes_email WHERE usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM password_reset_tokens WHERE usuario_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM sessoes WHERE usuario_id = ${clienteId}`);

      // Vínculos em que a conta aparece apenas como responsável são preservados e anonimizados.
      await tx.execute(sql`UPDATE usuarios SET
        aprovado_por = CASE WHEN aprovado_por = ${clienteId} THEN NULL ELSE aprovado_por END,
        gestor_id = CASE WHEN gestor_id = ${clienteId} THEN NULL ELSE gestor_id END
        WHERE aprovado_por = ${clienteId} OR gestor_id = ${clienteId}`);
      await tx.execute(sql`UPDATE reservas SET
        vendedor_id = CASE WHEN vendedor_id = ${clienteId} THEN NULL ELSE vendedor_id END,
        boleto_liberado_por = CASE WHEN boleto_liberado_por = ${clienteId} THEN NULL ELSE boleto_liberado_por END
        WHERE vendedor_id = ${clienteId} OR boleto_liberado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE leads_origem SET vendedor_id = NULL WHERE vendedor_id = ${clienteId}`);
      await tx.execute(sql`UPDATE contratos_documentos SET aprovado_admin_por = NULL WHERE aprovado_admin_por = ${clienteId}`);
      await tx.execute(sql`UPDATE contrato_eventos SET ator_id = NULL WHERE ator_id = ${clienteId}`);
      await tx.execute(sql`UPDATE precos_ledger SET criado_por = NULL WHERE criado_por = ${clienteId}`);
      await tx.execute(sql`DELETE FROM descontos_administrativos WHERE administrador_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM comissoes WHERE vendedor_id = ${clienteId} OR regra_id IN (SELECT id FROM comissao_regras WHERE vendedor_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM comissao_regras WHERE vendedor_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM cupons_utilizacoes WHERE cupom_id IN (SELECT id FROM cupons WHERE vendedor_id = ${clienteId})`);
      await tx.execute(sql`UPDATE reservas SET cupom_id = NULL WHERE cupom_id IN (SELECT id FROM cupons WHERE vendedor_id = ${clienteId})`);
      await tx.execute(sql`DELETE FROM cupons WHERE vendedor_id = ${clienteId}`);
      await tx.execute(sql`UPDATE cliente_documentos SET
        criado_por = CASE WHEN criado_por = ${clienteId} THEN NULL ELSE criado_por END,
        removido_por = CASE WHEN removido_por = ${clienteId} THEN NULL ELSE removido_por END
        WHERE criado_por = ${clienteId} OR removido_por = ${clienteId}`);
      await tx.execute(sql`UPDATE cliente_historico SET criado_por = NULL WHERE criado_por = ${clienteId}`);
      await tx.execute(sql`DELETE FROM convites_acesso WHERE criado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE convites_acesso SET usado_por = NULL WHERE usado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE auditoria_admin SET ator_id = NULL WHERE ator_id = ${clienteId}`);
      await tx.execute(sql`DELETE FROM auditoria_admin WHERE entidade_id = ${clienteId} AND entidade IN ('usuario', 'cliente')`);
      await tx.execute(sql`UPDATE gateway_credenciais SET atualizado_por = NULL WHERE atualizado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE configuracoes_pagamento SET atualizado_por = NULL WHERE atualizado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE pagamento_parcelas SET pago_confirmado_por = NULL WHERE pago_confirmado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE saidas_operacionais SET criado_por = NULL WHERE criado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE assento_alocacoes SET alocado_por = NULL WHERE alocado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE checkins_operacao SET confirmado_por = NULL WHERE confirmado_por = ${clienteId}`);
      await tx.execute(sql`UPDATE operacao_historico SET ator_id = NULL WHERE ator_id = ${clienteId}`);

      const removido = linhas(await tx.execute(sql`DELETE FROM usuarios WHERE id = ${clienteId} RETURNING id`))[0];
      if (!removido) throw new ErroExclusaoCliente("Cliente não encontrado", 404);

      const referencia = createHash("sha256").update(clienteId).digest("hex");
      await tx.execute(sql`INSERT INTO auditoria_admin
        (id, ator_id, ator_tipo, acao, entidade, entidade_id, antes, depois, ip, user_agent, criado_em)
        VALUES (${`purga-${referencia.slice(0, 24)}`}, ${ator.id}, ${ator.tipo}, 'cliente_excluido_definitivamente',
          'cliente_removido', ${referencia}, ${JSON.stringify({ tipo: "cliente" })}::jsonb,
          ${JSON.stringify({ modo: "exclusao_definitiva", removidos })}::jsonb,
          ${ator.ip || null}, ${ator.userAgent || null}, CURRENT_TIMESTAMP)`);

      return { arquivos, removidos };
    });

    const falhasStorage = await removerArquivosGerenciados(clienteId, resultado.arquivos);
    return {
      modo: "excluido_definitivamente",
      mensagem: falhasStorage > 0
        ? "Cliente e registros excluídos. Alguns arquivos antigos do armazenamento exigem limpeza manual."
        : "Cliente e todos os registros vinculados foram excluídos definitivamente.",
      removidos: resultado.removidos,
    };
  }
}
