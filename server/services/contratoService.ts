import { generateBrandedPdfBuffer } from "../../packages/contract-engine/brandedPdfLayout.js";
import { CONTRATADA_DADOS } from "../../packages/contract-engine/letterhead.js";
import { db } from "../db/index.js";
import { reservas, usuarios, lotes, eventos } from "../db/schema.js";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

export interface DadosContrato {
  reserva_id: string;
  usuario_id: string;
  lote_id: string;
  aceite_ip: string;
}

export class ContratoService {
  static async gerarContratoHTML(dadosContrato: DadosContrato): Promise<string> {
    try {
      // Buscar dados da reserva
      const reservaResult = await db
        .select()
        .from(reservas)
        .where(eq(reservas.id, dadosContrato.reserva_id))
        .limit(1);

      if (reservaResult.length === 0) {
        throw new Error("Reserva não encontrada");
      }

      const reserva = reservaResult[0];

      // Buscar dados do usuário
      const usuarioResult = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, dadosContrato.usuario_id))
        .limit(1);

      if (usuarioResult.length === 0) {
        throw new Error("Usuário não encontrado");
      }

      const usuario = usuarioResult[0];

      // Buscar dados do lote e evento
      const loteResult = await db
        .select()
        .from(lotes)
        .where(eq(lotes.id, dadosContrato.lote_id))
        .limit(1);

      if (loteResult.length === 0) {
        throw new Error("Lote não encontrado");
      }

      const lote = loteResult[0];

      const eventoResult = await db
        .select()
        .from(eventos)
        .where(eq(eventos.id, lote.evento_id))
        .limit(1);

      if (eventoResult.length === 0) {
        throw new Error("Evento não encontrado");
      }

      const evento = eventoResult[0];

      // Parsear itens selecionados
      const itens = typeof reserva.itens_selecionados === "string"
        ? JSON.parse(reserva.itens_selecionados)
        : reserva.itens_selecionados;

      const dataAceite = new Date();
      const dataFormatada = dataAceite.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      // Gerar HTML do contrato
      const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contrato de Reserva - ${evento.nome}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #1D3557;
      padding-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      color: #E63946;
      font-size: 24px;
    }
    .header p {
      margin: 5px 0;
      color: #666;
      font-size: 12px;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      background-color: #1D3557;
      color: white;
      padding: 10px 15px;
      margin-bottom: 15px;
      font-weight: bold;
      font-size: 14px;
    }
    .field {
      display: flex;
      margin-bottom: 12px;
      font-size: 13px;
    }
    .field-label {
      font-weight: bold;
      width: 180px;
      color: #1D3557;
    }
    .field-value {
      flex: 1;
      border-bottom: 1px dotted #ccc;
      padding-left: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 12px;
    }
    table th {
      background-color: #E63946;
      color: white;
      padding: 8px;
      text-align: left;
      font-weight: bold;
    }
    table td {
      padding: 8px;
      border-bottom: 1px solid #ddd;
    }
    table tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .total-row {
      font-weight: bold;
      background-color: #f0f0f0;
      font-size: 14px;
    }
    .signature-section {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
    }
    .signature {
      width: 45%;
      text-align: center;
      border-top: 1px solid #333;
      padding-top: 40px;
      font-size: 12px;
    }
    .footer {
      text-align: center;
      font-size: 10px;
      color: #999;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    .terms {
      font-size: 11px;
      line-height: 1.8;
      margin-top: 20px;
      padding: 15px;
      background-color: #f5f5f5;
      border-left: 3px solid #E63946;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CONTRATO DE RESERVA DE PACOTE</h1>
      <p>Comitiva - Excursões e Eventos</p>
      <p>Data: ${dataFormatada}</p>
    </div>

    <div class="section">
      <div class="section-title">DADOS DO CONTRATANTE (CLIENTE)</div>
      <div class="field">
        <span class="field-label">Nome:</span>
        <span class="field-value">${usuario.nome}</span>
      </div>
      <div class="field">
        <span class="field-label">CPF:</span>
        <span class="field-value">${usuario.cpf || "Não informado"}</span>
      </div>
      <div class="field">
        <span class="field-label">Email:</span>
        <span class="field-value">${usuario.email}</span>
      </div>
      <div class="field">
        <span class="field-label">Telefone:</span>
        <span class="field-value">${usuario.telefone || "Não informado"}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">DADOS DA CONTRATADA</div>
      <div class="field">
        <span class="field-label">Razão Social:</span>
        <span class="field-value">${CONTRATADA_DADOS.razao_social}</span>
      </div>
      <div class="field">
        <span class="field-label">CNPJ:</span>
        <span class="field-value">${CONTRATADA_DADOS.cnpj}</span>
      </div>
      <div class="field">
        <span class="field-label">Endereço:</span>
        <span class="field-value">${CONTRATADA_DADOS.endereco_sede}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">INFORMAÇÕES DO EVENTO</div>
      <div class="field">
        <span class="field-label">Evento:</span>
        <span class="field-value">${evento.nome}</span>
      </div>
      <div class="field">
        <span class="field-label">Lote:</span>
        <span class="field-value">${lote.nome}</span>
      </div>
      <div class="field">
        <span class="field-label">Local:</span>
        <span class="field-value">${evento.local}</span>
      </div>
      <div class="field">
        <span class="field-label">Data do Evento:</span>
        <span class="field-value">${new Date(evento.data_inicio).toLocaleDateString("pt-BR")} a ${new Date(evento.data_fim).toLocaleDateString("pt-BR")}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">ITENS SELECIONADOS</div>
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th style="text-align: right; width: 80px;">Quantidade</th>
            <th style="text-align: right; width: 100px;">Valor Unitário</th>
            <th style="text-align: right; width: 100px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itens.map((item: any) => {
            const total = (item.valor * item.quantidade).toFixed(2);
            return `
            <tr>
              <td>${item.nome}</td>
              <td style="text-align: right;">${item.quantidade}</td>
              <td style="text-align: right;">R$ ${item.valor.toFixed(2)}</td>
              <td style="text-align: right;">R$ ${total}</td>
            </tr>
            `;
          }).join("")}
          <tr class="total-row">
            <td colspan="3" style="text-align: right;">VALOR TOTAL:</td>
            <td style="text-align: right;">R$ ${reserva.valor_total}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="terms">
        <strong>TERMOS E CONDIÇÕES:</strong>
        <p>1. O cliente confirma a recepção deste contrato e concorda com os termos e condições de reserva.</p>
        <p>2. O pagamento deve ser realizado conforme as instruções fornecidas no e-mail de confirmação.</p>
        <p>3. Cancelamentos devem ser solicitados com no mínimo 30 dias de antecedência.</p>
        <p>4. Este contrato é válido apenas com a assinatura digital do cliente.</p>
        <p>5. Para dúvidas, entre em contato através do email ou telefone fornecido.</p>
      </div>
    </div>

    <div class="signature-section">
      <div class="signature">
        <strong>Cliente</strong><br>
        ${usuario.nome}<br>
        CPF: ${usuario.cpf || "_______________"}
      </div>
      <div class="signature">
        <strong>Comitiva</strong><br>
        ${CONTRATADA_DADOS.representante}<br>
        ${CONTRATADA_DADOS.cargo_representante}
      </div>
    </div>

    <div class="footer">
      <p>Contrato gerado em ${dataFormatada} às ${dataAceite.toLocaleTimeString("pt-BR")}</p>
      <p>IP de Aceite: ${dadosContrato.aceite_ip}</p>
      <p>Reserva ID: ${dadosContrato.reserva_id}</p>
    </div>
  </div>
</body>
</html>
      `;

      return html;
    } catch (error) {
      console.error("[ContratoService] Erro ao gerar HTML:", error);
      throw error;
    }
  }

  static async gerarContratoPDF(dadosContrato: DadosContrato): Promise<Buffer> {
    try {
      const html = await this.gerarContratoHTML(dadosContrato);
      const pdfBuffer = await generateBrandedPdfBuffer(html, { brand: "comitiva" });
      return pdfBuffer;
    } catch (error) {
      console.error("[ContratoService] Erro ao gerar PDF:", error);
      throw error;
    }
  }

  static async salvarContratoPDF(dadosContrato: DadosContrato): Promise<string> {
    try {
      const pdfBuffer = await this.gerarContratoPDF(dadosContrato);

      // Criar diretório se não existir
      const uploadDir = process.env.STORAGE_PATH || "./uploads";
      await fs.mkdir(uploadDir, { recursive: true });

      // Salvar arquivo
      const nomeArquivo = `contrato-${dadosContrato.reserva_id}-${Date.now()}.pdf`;
      const caminhoCompleto = path.join(uploadDir, nomeArquivo);

      await fs.writeFile(caminhoCompleto, pdfBuffer);

      return caminhoCompleto;
    } catch (error) {
      console.error("[ContratoService] Erro ao salvar PDF:", error);
      throw error;
    }
  }

  static async registrarAceiteContrato(
    reserva_id: string,
    aceite_ip: string
  ): Promise<void> {
    try {
      const dadosContrato: DadosContrato = {
        reserva_id,
        usuario_id: "", // Será preenchido depois
        lote_id: "",
        aceite_ip,
      };

      // Buscar reserva para preencher dados
      const reservaResult = await db
        .select()
        .from(reservas)
        .where(eq(reservas.id, reserva_id))
        .limit(1);

      if (reservaResult.length === 0) {
        throw new Error("Reserva não encontrada");
      }

      const reserva = reservaResult[0];
      dadosContrato.usuario_id = reserva.usuario_id;
      dadosContrato.lote_id = reserva.lote_id;

      // Gerar e salvar contrato
      const caminhoContrato = await this.salvarContratoPDF(dadosContrato);

      // Atualizar reserva com dados do contrato
      await db
        .update(reservas)
        .set({
          status: "contrato_gerado",
          contrato_pdf_url: caminhoContrato,
          aceite_timestamp: new Date(),
          aceite_ip,
          atualizado_em: new Date(),
        })
        .where(eq(reservas.id, reserva_id));

      console.log(`[ContratoService] Contrato gerado e salvo: ${caminhoContrato}`);
    } catch (error) {
      console.error("[ContratoService] Erro ao registrar aceite:", error);
      throw error;
    }
  }
}
