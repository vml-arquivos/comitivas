import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditoriaAdmin, clienteDocumentos, clienteHistorico, usuarios } from "../db/schema.js";
import { camposFaltantesCadastroMinimo } from "../security/governance.js";

export type ResultadoAprovacaoCadastro = { aprovado: boolean; atualizado: boolean };

/** Aprova somente com e-mail confirmado, cadastro completo e documento de identidade aprovado. */
export async function aprovarCadastroSeElegivel(usuarioId: string, documentoId?: string | null): Promise<ResultadoAprovacaoCadastro> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cadastro-aprovacao:${usuarioId}`}))`);
    const usuario = (await tx.select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      cpf: usuarios.cpf,
      telefone: usuarios.telefone,
      data_nascimento: usuarios.data_nascimento,
      endereco: usuarios.endereco,
      ativo: usuarios.ativo,
      email_confirmado: usuarios.email_confirmado,
      cadastro_status: usuarios.cadastro_status,
      aprovado_em: usuarios.aprovado_em,
      aprovado_por: usuarios.aprovado_por,
    }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1))[0];
    if (!usuario) return { aprovado: false, atualizado: false };
    if (usuario.cadastro_status === "aprovado") return { aprovado: true, atualizado: false };
    if (!usuario.ativo || !usuario.email_confirmado || camposFaltantesCadastroMinimo(usuario).length > 0) return { aprovado: false, atualizado: false };

    const condicoes = [
      eq(clienteDocumentos.usuario_id, usuarioId),
      eq(clienteDocumentos.categoria, "identidade"),
      eq(clienteDocumentos.validacao_status, "aprovado"),
      isNull(clienteDocumentos.removido_em),
    ];
    if (documentoId) condicoes.push(eq(clienteDocumentos.id, documentoId));
    const documento = (await tx.select({ id: clienteDocumentos.id, validado_em: clienteDocumentos.validado_em })
      .from(clienteDocumentos)
      .where(and(...condicoes))
      .orderBy(desc(clienteDocumentos.validado_em), desc(clienteDocumentos.criado_em))
      .limit(1))[0];
    if (!documento?.validado_em) return { aprovado: false, atualizado: false };

    const agora = new Date();
    const antes = { cadastro_status: usuario.cadastro_status, aprovado_em: usuario.aprovado_em, aprovado_por: usuario.aprovado_por };
    const atualizado = (await tx.update(usuarios).set({
      cadastro_status: "aprovado",
      aprovado_em: agora,
      aprovado_por: "automatico_documento_validado",
      atualizado_em: agora,
    }).where(and(eq(usuarios.id, usuarioId), inArray(usuarios.cadastro_status, ["pendente", "em_analise"]))).returning({ id: usuarios.id }))[0];
    if (!atualizado) return { aprovado: false, atualizado: false };

    await tx.insert(clienteHistorico).values({
      id: createId(), usuario_id: usuarioId, tipo: "cadastro_aprovado",
      titulo: "Cadastro aprovado automaticamente",
      descricao: "Cadastro completo e documento de identificação aprovado.",
      metadados: { documento_id: documento.id, motivo: "documento_validado_e_cadastro_completo" },
      criado_por: null, criado_em: agora,
    });
    await tx.insert(auditoriaAdmin).values({
      id: createId(), ator_id: null, ator_tipo: "system",
      acao: "cadastro_aprovado_automaticamente", entidade: "usuario", entidade_id: usuarioId,
      antes,
      depois: { cadastro_status: "aprovado", aprovado_em: agora, aprovado_por: "automatico_documento_validado", documento_id: documento.id },
      criado_em: agora,
    });
    return { aprovado: true, atualizado: true };
  });
}

export default aprovarCadastroSeElegivel;
