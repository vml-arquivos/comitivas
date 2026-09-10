import { Router, Request, Response } from "express";
import { HospedagemService } from "../services/hospedagemService.js";

const router = Router();
router.get("/lotes/:loteId", async (req: Request, res: Response) => {
  try { return res.json(await HospedagemService.obterMapa(req.params.loteId)); }
  catch (error: any) { return res.status(error.message === "Lote não encontrado" ? 404 : 400).json({ erro: error.message || "Erro ao carregar hospedagem" }); }
});
router.post("/lotes/:loteId/quartos", async (req: Request, res: Response) => {
  try { return res.status(201).json({ quarto: await HospedagemService.salvarQuarto(req.params.loteId, null, req.body, req.usuario!.id) }); }
  catch (error: any) { return res.status(400).json({ erro: error.message || "Erro ao criar quarto" }); }
});
router.patch("/lotes/:loteId/quartos/:quartoId", async (req: Request, res: Response) => {
  try { return res.json({ quarto: await HospedagemService.salvarQuarto(req.params.loteId, req.params.quartoId, req.body, req.usuario!.id) }); }
  catch (error: any) { return res.status(409).json({ erro: error.message || "Erro ao atualizar quarto" }); }
});
router.delete("/quartos/:quartoId", async (req: Request, res: Response) => {
  try { return res.json({ quarto: await HospedagemService.arquivarQuarto(req.params.quartoId, req.usuario!.id) }); }
  catch (error: any) { return res.status(409).json({ erro: error.message || "Erro ao excluir quarto" }); }
});
router.post("/quartos/:quartoId/alocacoes", async (req: Request, res: Response) => {
  try {
    const reservaId = String(req.body?.reserva_id || "").trim();
    if (!reservaId) return res.status(400).json({ erro: "Selecione um hóspede" });
    return res.status(201).json({ alocacao: await HospedagemService.alocar(req.params.quartoId, reservaId, req.usuario!.id) });
  } catch (error: any) { return res.status(409).json({ erro: error.message || "Erro ao alocar hóspede" }); }
});
router.post("/alocacoes/:alocacaoId/mover", async (req: Request, res: Response) => {
  try {
    const quartoId = String(req.body?.quarto_id || "").trim();
    if (!quartoId) return res.status(400).json({ erro: "Selecione o quarto de destino" });
    return res.json({ alocacao: await HospedagemService.mover(req.params.alocacaoId, quartoId, req.usuario!.id) });
  } catch (error: any) { return res.status(409).json({ erro: error.message || "Erro ao remanejar hóspede" }); }
});
router.delete("/alocacoes/:alocacaoId", async (req: Request, res: Response) => {
  try { return res.json({ alocacao: await HospedagemService.liberar(req.params.alocacaoId, req.body?.motivo, req.usuario!.id) }); }
  catch (error: any) { return res.status(409).json({ erro: error.message || "Erro ao liberar vaga" }); }
});
export default router;
