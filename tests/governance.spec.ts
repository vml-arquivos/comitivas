import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { cadastroAprovadoComEvidencia, camposFaltantesCadastroMinimo, motivoBloqueioBoleto, podeExporUsuario } from "../server/security/governance.js";

const estadoBanco = vi.hoisted(() => ({ consultas: [] as unknown[][] }));

vi.mock("../server/db/index.js", () => {
  const consulta = (linhas: unknown[]) => {
    const builder: any = {};
    for (const metodo of ["from", "where", "orderBy", "limit", "offset", "innerJoin", "leftJoin", "$dynamic", "for"]) {
      builder[metodo] = () => builder;
    }
    builder.then = (resolver: (valor: unknown[]) => unknown, rejeitar?: (erro: unknown) => unknown) => Promise.resolve(linhas).then(resolver, rejeitar);
    return builder;
  };
  return {
    db: {
      select: vi.fn(() => consulta(estadoBanco.consultas.shift() || [])),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import adminRouter from "../server/routes/admin.js";
import pacotesRouter from "../server/routes/pacotes.js";
import { AuthService } from "../server/services/authService.js";

let servidor: Server;
let baseUrl: string;
let tokenAdmin: string;
let tokenCliente: string;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "segredo-de-teste-governanca-com-tamanho-suficiente";
  tokenAdmin = AuthService.generateToken({ id: "admin-1", email: "admin@example.com", tipo: "admin", session_version: 1 });
  tokenCliente = AuthService.generateToken({ id: "cliente-a", email: "cliente-a@example.com", tipo: "cliente", session_version: 1 });
  const app = express();
  app.use(express.json());
  app.use("/admin", adminRouter);
  app.use("/pacotes", pacotesRouter);
  servidor = app.listen(0);
  await new Promise<void>((resolve) => servidor.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
});

beforeEach(() => {
  estadoBanco.consultas.length = 0;
});

async function chamar(caminho: string, init: RequestInit = {}, token = tokenAdmin) {
  estadoBanco.consultas.unshift([{ ativo: true, session_version: 1 }]);
  return fetch(`${baseUrl}${caminho}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
}

describe("governança de perfis e aprovação", () => {
  it("exige status, atividade, data e responsável para considerar o cadastro aprovado", () => {
    expect(cadastroAprovadoComEvidencia({ ativo: true, cadastro_status: "aprovado", aprovado_em: new Date(), aprovado_por: "admin-1" })).toBe(true);
    expect(cadastroAprovadoComEvidencia({ ativo: true, cadastro_status: "aprovado", aprovado_em: null, aprovado_por: null })).toBe(false);
  });

  it("mantém DEV invisível para qualquer perfil inferior", () => {
    expect(podeExporUsuario("admin", "dev")).toBe(false);
    expect(podeExporUsuario("vendedor", "dev")).toBe(false);
    expect(podeExporUsuario("cliente", "dev")).toBe(false);
    expect(podeExporUsuario("dev", "dev")).toBe(true);
  });

  it("informa o primeiro bloqueio operacional do boleto", () => {
    expect(motivoBloqueioBoleto({ clienteAtivo: true, cadastroStatus: "aprovado", cadastroAprovadoComEvidencia: true, contratoExiste: true, contratoValidado: false, contratoAprovadoAdmin: false, formaPagamento: "boleto" }))
      .toBe("Boleto bloqueado: contrato ainda não foi validado pelo cliente.");
  });

  it("considera completo o cadastro mínimo sem exigir RG ou profissão", () => {
    expect(camposFaltantesCadastroMinimo({ nome: "Cliente Teste", email: "cliente@example.com", cpf: "52998224725", telefone: "61999990000", data_nascimento: "1990-01-01", endereco: "Rua Exemplo, 10, Brasília/DF" })).toEqual([]);
  });

  it("lista somente os dados essenciais ausentes", () => {
    expect(camposFaltantesCadastroMinimo({ nome: "Cliente", email: "", cpf: "", telefone: "", data_nascimento: null, endereco: "" }))
      .toEqual(["e-mail", "CPF", "telefone", "data de nascimento", "endereço"]);
  });
});

describe("API direta: isolamento entre clientes", () => {
  it("impede Cliente A de consultar a reserva do Cliente B por ID", async () => {
    estadoBanco.consultas.push([{ id: "reserva-b", usuario_id: "cliente-b", vendedor_id: null }]);
    const resposta = await chamar("/pacotes/reservas/reserva-b", {}, tokenCliente);
    expect(resposta.status).toBe(403);
  });
});

describe("API direta: DEV invisível para ADMIN", () => {
  const dev = { id: "dev-1", nome: "Dev Oculto", email: "dev@example.com", tipo: "dev", ativo: true };

  it("remove DEV da resposta de GET /usuarios mesmo com retorno inesperado do banco", async () => {
    estadoBanco.consultas.push([dev, { id: "cliente-1", nome: "Cliente", email: "cliente@example.com", tipo: "cliente", ativo: true }]);
    const resposta = await chamar("/admin/usuarios");
    const corpo = await resposta.json() as any;
    expect(resposta.status).toBe(200);
    expect(corpo.usuarios).toHaveLength(1);
    expect(corpo.usuarios[0].tipo).toBe("cliente");
  });

  for (const [metodo, caminho, corpo] of [
    ["GET", "/admin/usuarios/dev-1", undefined],
    ["PUT", "/admin/usuarios/dev-1", { nome: "Alterado" }],
    ["PATCH", "/admin/usuarios/dev-1/status", { ativo: false }],
    ["DELETE", "/admin/usuarios/dev-1", undefined],
  ] as const) {
    it(`bloqueia ${metodo} direto ao DEV`, async () => {
      estadoBanco.consultas.push([dev]);
      const resposta = await chamar(caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined });
      expect(resposta.status).toBe(404);
    });
  }

  it("bloqueia criação direta de DEV por ADMIN", async () => {
    const resposta = await chamar("/admin/usuarios", { method: "POST", body: JSON.stringify({ nome: "Novo DEV", email: "novo-dev@example.com", tipo: "dev" }) });
    expect(resposta.status).toBe(403);
  });

  it("bloqueia convite DEV por ADMIN", async () => {
    const resposta = await chamar("/admin/dev/convites", { method: "POST", body: JSON.stringify({ papel: "dev", horas_validade: 24 }) });
    expect(resposta.status).toBe(403);
  });

  it("bloqueia o bootstrap remoto de DEV para ADMIN", async () => {
    const resposta = await chamar("/admin/dev/bootstrap", { method: "POST", body: "{}" });
    expect(resposta.status).toBe(403);
  });
});
