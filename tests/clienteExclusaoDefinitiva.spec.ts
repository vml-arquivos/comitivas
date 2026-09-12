import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function fonte(caminho: string) {
  return readFile(new URL(caminho, import.meta.url), "utf8");
}

describe("exclusão definitiva individual de clientes", () => {
  it("é uma rota administrativa protegida e não expõe erro SQL", async () => {
    const rota = await fonte("../server/routes/admin.ts");

    expect(rota).toContain('router.delete("/usuarios/:id/definitivo", requireRole("admin")');
    expect(rota).toContain("ClienteExclusaoService.excluirDefinitivamente");
    expect(rota).toContain('erro: "Não foi possível excluir definitivamente. Nenhum dado foi removido."');
  });

  it("exige o e-mail exato e limita o alvo a cliente", async () => {
    const servico = await fonte("../server/services/clienteExclusaoService.ts");

    expect(servico).toContain('cliente.tipo !== "cliente"');
    expect(servico).toContain("confirmacaoExclusaoClienteValida(confirmacao, cliente.email)");
    expect(servico).toContain('clienteId === ator.id');
  });

  it("remove filhos antes do cliente e devolve as vagas retidas", async () => {
    const servico = await fonte("../server/services/clienteExclusaoService.ts");
    const deleteContrato = servico.indexOf("DELETE FROM contratos_documentos");
    const deleteReserva = servico.indexOf("DELETE FROM reservas WHERE usuario_id");
    const deleteUsuario = servico.indexOf("DELETE FROM usuarios WHERE id");

    expect(servico).toContain("pg_advisory_xact_lock");
    expect(servico).toContain('status IN (\'ativo\', \'convertido\')');
    expect(servico).toContain('"vagas_disponíveis" = LEAST');
    expect(servico).toContain("UPDATE reservas SET inventario_hold_id = NULL");
    expect(deleteContrato).toBeGreaterThan(-1);
    expect(deleteReserva).toBeGreaterThan(deleteContrato);
    expect(deleteUsuario).toBeGreaterThan(deleteReserva);
  });

  it("mantém o arquivamento normal para outros perfis e mostra a ação destrutiva a admin/dev", async () => {
    const [clientes, ficha] = await Promise.all([
      fonte("../apps/web/src/pages/admin/Clientes.tsx"),
      fonte("../apps/web/src/pages/admin/ClienteFicha.tsx"),
    ]);

    expect(clientes).toContain("['admin', 'dev'].includes(user?.tipo || '') && usuario.tipo === 'cliente'");
    expect(clientes).toContain("Se houver registros, o usuário será arquivado");
    expect(ficha).toContain("['admin', 'dev'].includes(usuarioLogado?.tipo || '')");
    expect(ficha).toContain("Excluir definitivamente");
  });
});
