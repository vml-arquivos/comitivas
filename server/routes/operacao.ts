import { Router, Request, Response } from "express";
import { OperacaoOnibusService } from "../services/operacaoOnibusService.js";

const router = Router();

function csv(valor: unknown): string {
  return `"${String(valor ?? "").replace(/"/g, '""')}"`;
}

router.get("/saidas", async (_req: Request, res: Response) => {
  try {
    return res.json({ saidas: await OperacaoOnibusService.listar() });
  } catch (error: any) {
    console.error("[OPERACAO] Erro ao listar saídas:", error);
    return res.status(500).json({ erro: "Não foi possível carregar a operação dos ônibus" });
  }
});

router.post("/saidas", async (req: Request, res: Response) => {
  try {
    const saida = await OperacaoOnibusService.criarSaida(req.body, req.usuario!.id);
    return res.status(201).json({ saida });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível criar a saída" });
  }
});

router.patch("/saidas/:saidaId", async (req: Request, res: Response) => {
  try {
    return res.json({ saida: await OperacaoOnibusService.atualizarSaida(req.params.saidaId, req.body, req.usuario!.id) });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível atualizar a saída" });
  }
});

router.get("/saidas/:saidaId/mapa", async (req: Request, res: Response) => {
  try {
    return res.json(await OperacaoOnibusService.obterMapa(req.params.saidaId));
  } catch (error: any) {
    return res.status(error.message === "Saída não encontrada" ? 404 : 400).json({ erro: error.message || "Não foi possível carregar o mapa" });
  }
});

router.post("/saidas/:saidaId/onibus", async (req: Request, res: Response) => {
  try {
    return res.status(201).json({ onibus: await OperacaoOnibusService.criarOnibus(req.params.saidaId, req.body, req.usuario!.id) });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível cadastrar o ônibus" });
  }
});

router.patch("/onibus/:onibusId", async (req: Request, res: Response) => {
  try {
    return res.json({ onibus: await OperacaoOnibusService.atualizarOnibus(req.params.onibusId, req.body, req.usuario!.id) });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível atualizar o ônibus" });
  }
});

router.post("/saidas/:saidaId/pontos-embarque", async (req: Request, res: Response) => {
  try {
    return res.status(201).json({ ponto: await OperacaoOnibusService.adicionarPonto(req.params.saidaId, req.body, req.usuario!.id) });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível cadastrar o ponto de embarque" });
  }
});

router.patch("/assentos/:assentoId/bloqueio", async (req: Request, res: Response) => {
  try {
    if (typeof req.body?.bloqueado !== "boolean") return res.status(400).json({ erro: "Informe se a poltrona deve ser bloqueada" });
    return res.json({ assento: await OperacaoOnibusService.bloquearAssento(req.params.assentoId, req.body.bloqueado, req.body.motivo, req.usuario!.id) });
  } catch (error: any) {
    return res.status(409).json({ erro: error.message || "Não foi possível alterar a poltrona" });
  }
});

router.post("/assentos/:assentoId/alocar", async (req: Request, res: Response) => {
  try {
    const reservaId = String(req.body?.reserva_id || "").trim();
    if (!reservaId) return res.status(400).json({ erro: "Selecione uma reserva" });
    const pontoId = String(req.body?.ponto_embarque_id || "").trim() || null;
    return res.status(201).json({ alocacao: await OperacaoOnibusService.alocarAssento(req.params.assentoId, reservaId, pontoId, req.usuario!.id) });
  } catch (error: any) {
    return res.status(409).json({ erro: error.message || "Não foi possível alocar a poltrona" });
  }
});

router.post("/alocacoes/:alocacaoId/mover", async (req: Request, res: Response) => {
  try {
    const assentoId = String(req.body?.assento_id || "").trim();
    if (!assentoId) return res.status(400).json({ erro: "Selecione a nova poltrona" });
    const pontoInformado = req.body?.ponto_embarque_id;
    const pontoId = pontoInformado === undefined ? undefined : String(pontoInformado || "").trim() || null;
    return res.json({ alocacao: await OperacaoOnibusService.moverAlocacao(req.params.alocacaoId, assentoId, pontoId, req.usuario!.id) });
  } catch (error: any) {
    return res.status(409).json({ erro: error.message || "Não foi possível mover a poltrona" });
  }
});

router.delete("/alocacoes/:alocacaoId", async (req: Request, res: Response) => {
  try {
    return res.json({ alocacao: await OperacaoOnibusService.liberarAlocacao(req.params.alocacaoId, req.body?.motivo, req.usuario!.id) });
  } catch (error: any) {
    return res.status(409).json({ erro: error.message || "Não foi possível liberar a poltrona" });
  }
});

router.patch("/saidas/:saidaId/checkins/:reservaId", async (req: Request, res: Response) => {
  try {
    return res.json({ checkin: await OperacaoOnibusService.registrarCheckin(req.params.saidaId, req.params.reservaId, String(req.body?.status || ""), req.body?.observacoes, req.usuario!.id) });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível registrar o embarque" });
  }
});

router.get("/saidas/:saidaId/manifesto", async (req: Request, res: Response) => {
  try {
    const manifesto = await OperacaoOnibusService.obterManifesto(req.params.saidaId);
    if (String(req.query.formato || "") !== "csv") return res.json(manifesto);
    const cabecalho = ["Ônibus", "Identificação", "Poltrona", "Passageiro", "CPF", "Telefone", "E-mail", "Ponto de embarque", "Situação do embarque"];
    const linhas = manifesto.passageiros.map((p: any) => [p.onibus, p.identificacao, p.poltrona, p.nome, p.cpf, p.telefone, p.email, p.ponto_embarque, p.checkin_status || "pendente"]);
    const conteudo = `\uFEFF${[cabecalho, ...linhas].map((linha) => linha.map(csv).join(";")).join("\n")}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="manifesto-${req.params.saidaId}.csv"`);
    return res.send(conteudo);
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível gerar o manifesto" });
  }
});

export default router;
