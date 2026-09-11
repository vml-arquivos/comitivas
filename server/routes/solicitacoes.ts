import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/authMiddleware.js";
import { ReservaSolicitacaoService } from "../services/reservaSolicitacaoService.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    if (!['admin', 'dev', 'vendedor'].includes(req.usuario.tipo)) return res.status(403).json({ erro: "Acesso negado" });
    const solicitacoes = await ReservaSolicitacaoService.listar(req.usuario, req.query);
    return res.json({ total: solicitacoes.length, solicitacoes });
  } catch (error: any) {
    return res.status(400).json({ erro: error.message || "Não foi possível listar as solicitações" });
  }
});

router.post("/reservas/:reservaId", async (req: Request, res: Response) => {
  try {
    if (!req.usuario) return res.status(401).json({ erro: "Não autenticado" });
    if (!['admin', 'dev', 'vendedor'].includes(req.usuario.tipo)) return res.status(403).json({ erro: "Acesso negado" });
    const solicitacao = await ReservaSolicitacaoService.criar(req.params.reservaId, req.usuario, req.body);
    return res.status(201).json({ solicitacao, mensagem: "Solicitação registrada para análise." });
  } catch (error: any) {
    return res.status(error.message?.includes("não pode") ? 403 : 409).json({ erro: error.message || "Não foi possível registrar a solicitação" });
  }
});

router.patch("/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const solicitacao = await ReservaSolicitacaoService.processar(req.params.id, req.usuario!, req.body);
    return res.json({ solicitacao, mensagem: "Análise atualizada com histórico preservado." });
  } catch (error: any) {
    return res.status(409).json({ erro: error.message || "Não foi possível atualizar a solicitação" });
  }
});

export default router;
