import { generateBrandedPdfBuffer } from "../../packages/contract-engine/brandedPdfLayout.js";
import { CONTRATADA_DADOS } from "../../packages/contract-engine/letterhead.js";
import { db } from "../db/index.js";
import { reservas, usuarios, lotes, eventos, pacotes } from "../db/schema.js";
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

      // Modalidade de hospedagem do pacote contratado, usada para marcar
      // a cláusula correta (camping / quarto com ventilador / quarto com ar)
      const pacoteResult = await db
        .select()
        .from(pacotes)
        .where(eq(pacotes.lote_id, lote.id))
        .limit(1);
      const modalidade = pacoteResult[0]?.modalidade_hospedagem || "quarto_ventilador";
      const marcarCamping = modalidade === "camping" ? "(x)" : "()";
      const marcarVentilador = modalidade === "quarto_ventilador" ? "(x)" : "()";
      const marcarArCondicionado = modalidade === "quarto_ar_condicionado" ? "(x)" : "()";

      const dataIdaFormatada = new Date(evento.data_inicio).toLocaleDateString("pt-BR");
      const dataVoltaFormatada = new Date(evento.data_fim).toLocaleDateString("pt-BR");

      // Gerar HTML do contrato — cláusulas do Contrato de Pacote de Viagem
      // Excursão das Comitivas (mesma base legal usada para os 3 modelos de
      // pacote: camping, quarto com ventilador e quarto com ar condicionado)
      const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contrato de Pacote de Viagem - ${evento.nome}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #222; margin: 0; padding: 0; font-size: 12px; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { text-align: center; font-size: 16px; color: #1D3557; }
    .clausula-titulo { font-weight: bold; color: #1D3557; margin-top: 16px; }
    .campo-assinatura { margin-top: 50px; display: flex; justify-content: space-between; }
    .assinatura { width: 45%; text-align: center; border-top: 1px solid #333; padding-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    table th, table td { border: 1px solid #999; padding: 6px; font-size: 11px; }
    .footer { text-align: center; font-size: 9px; color: #999; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CONTRATO DE PACOTE DE VIAGEM - EXCURSÃO DAS COMITIVAS</h1>
    <p>As partes qualificadas neste instrumento celebram, pelo presente, contrato para a prestação de
    serviços de pacote turístico de viagem terrestre nacional, no valor total de
    <strong>R$ ${Number(reserva.valor_total).toFixed(2)}</strong>.</p>

    <p><strong>Contratada:</strong> ${CONTRATADA_DADOS.razao_social}, empresa inscrita no CNPJ
    ${CONTRATADA_DADOS.cnpj}, com sede na ${CONTRATADA_DADOS.endereco_sede}, e-mail:
    ${CONTRATADA_DADOS.email}</p>

    <p><strong>Contratante:</strong> ${usuario.nome}, ${usuario.nacionalidade || "Brasileira"},
    ${usuario.estado_civil || "________"}, ${usuario.profissao || "________"},
    ${usuario.data_nascimento ? "nascido(a) em " + new Date(usuario.data_nascimento).toLocaleDateString("pt-BR") : ""},
    portador(a) do RG nº ${usuario.rg || "________"} e CPF ${usuario.cpf || "________"},
    residente em ${usuario.endereco || "________"}, telefone: ${usuario.telefone || "________"},
    e-mail: ${usuario.email}, têm entre si, justo e contratados, o que mutuamente outorgam,
    aceitam e assinam, convencionados pelas cláusulas, termos e condições a seguir devidamente enumeradas.</p>

    <p class="clausula-titulo">CLÁUSULA PRIMEIRA – DO OBJETO DO CONTRATO</p>
    <p>1.1 Contratação de excursão com destino a ${evento.local || evento.nome} de
    ${dataIdaFormatada} a ${dataVoltaFormatada}.<br>
    1.2 É de responsabilidade do contratante a leitura do contrato.</p>

    <p class="clausula-titulo">CLÁUSULA SEGUNDA – DADOS DA VIAGEM</p>
    <p>2.1 IDA: destino ${lote.nome} — data prevista ${dataIdaFormatada}.<br>
    2.2 VOLTA: retorno com data prevista ${dataVoltaFormatada}.<br>
    Observações: poderá haver ajustes nos horários se houver necessidade. A distribuição dos assentos
    será realizada pelos responsáveis da excursão na hora do embarque.</p>

    <p class="clausula-titulo">CLÁUSULA TERCEIRA – DA HOSPEDAGEM</p>
    <p>3.1 A hospedagem será em chácara ou camping previamente contratados.<br>
    3.2 Se houver necessidade de mudança de local, a Contratada poderá substituir por outro de padrão
    equivalente ou a sua escolha.<br>
    3.3 Modalidade de hospedagem contratada:
    ${marcarCamping} CAMPING &nbsp;&nbsp; ${marcarVentilador} QUARTO COM VENTILADOR &nbsp;&nbsp;
    ${marcarArCondicionado} QUARTO COM AR CONDICIONADO.</p>

    <p class="clausula-titulo">CLÁUSULA QUARTA - SERVIÇOS INCLUSOS NO PACOTE</p>
    <table>
      <thead><tr><th>Item</th><th>Qtd</th><th>Valor Unit.</th><th>Total</th></tr></thead>
      <tbody>
        ${itens.map((item: any) => `<tr><td>${item.nome}</td><td>${item.quantidade}</td>
          <td>R$ ${Number(item.valor).toFixed(2)}</td>
          <td>R$ ${(item.valor * item.quantidade).toFixed(2)}</td></tr>`).join("")}
        <tr><td colspan="3" style="text-align:right;"><strong>VALOR TOTAL</strong></td>
          <td><strong>R$ ${Number(reserva.valor_total).toFixed(2)}</strong></td></tr>
      </tbody>
    </table>

    <p class="clausula-titulo">CLÁUSULA QUINTA - FORMAS DE PAGAMENTO</p>
    <p>5.1 Via PIX com desconto de 5% para pagamento à vista — chave: ${CONTRATADA_DADOS.pix_chave}
    / Banco: ${CONTRATADA_DADOS.pix_banco}.<br>
    5.2 Parcelamento no boleto bancário sem juros: o número de parcelas disponíveis é decrescente
    conforme a proximidade do evento, respeitada a quitação total até a data do evento.<br>
    5.3 Parcelamento no cartão de crédito em até 10 vezes, com as taxas da operadora do cartão.</p>

    <p class="clausula-titulo">CLÁUSULA SEXTA – DO ATRASO NO PAGAMENTO DOS BOLETOS</p>
    <p>6.1 Em caso de atraso, incidirá multa de 2% sobre o valor da parcela, juros de 1% e correção
    monetária pelo IPCA.</p>

    <p class="clausula-titulo">CLÁUSULA SÉTIMA – DO VALOR E VENCIMENTO DAS PARCELAS</p>
    <p>Conforme condições de pagamento acordadas no momento da reserva, refletidas no valor total acima.</p>

    <p class="clausula-titulo">CLÁUSULA OITAVA - DO EMBARQUE E DESEMBARQUE</p>
    <p>8.1 Embarque e desembarque no mesmo local de início da viagem.<br>
    8.2 O passageiro só poderá embarcar se estiver na relação de autorização da ANTT, com documento
    de identificação original ou cópia autenticada.<br>
    8.3 O passageiro só poderá embarcar se estiver com o contrato quitado.</p>

    <p class="clausula-titulo">CLÁUSULA NONA - DA RESPONSABILIDADE</p>
    <p>O CONTRATANTE poderá desistir deste contrato em até 7 (sete) dias corridos da assinatura, com
    devolução integral, conforme art. 49 do CDC, se a contratação ocorreu fora do estabelecimento
    comercial. Após esse prazo, cancelamento por iniciativa do CONTRATANTE pode gerar multa de 30%
    sobre o valor total do pacote, a título de despesas administrativas e operacionais.</p>

    <p class="clausula-titulo">CLÁUSULA DÉCIMA – DOS DANOS</p>
    <p>10.1 Danos causados pelo Contratante nas instalações do ônibus ou da chácara serão cobrados
    conforme regras do fornecedor.</p>

    <p class="clausula-titulo">CLÁUSULA DÉCIMA PRIMEIRA – DAS EXCLUSÕES</p>
    <p>11.1 O pacote não inclui passeios opcionais e pessoais, lavanderia, telefonemas, refeições não
    especificadas, ingressos para eventos/shows e serviços não listados neste contrato.</p>

    <p class="clausula-titulo">CLÁUSULA DÉCIMA SEGUNDA – DA INSCRIÇÃO</p>
    <p>12.1 A inscrição é confirmada mediante pagamento do sinal estipulado. Não são aceitos cheques.</p>

    <p class="clausula-titulo">CLÁUSULA DÉCIMA TERCEIRA – DA INTERRUPÇÃO DA VIAGEM</p>
    <p>13.1 Em caso de desistência durante a viagem por iniciativa do Contratante, não há devolução de
    valores já pagos.</p>

    <p class="clausula-titulo">CLÁUSULA DÉCIMA QUARTA – DAS DESPESAS NÃO PREVISTAS</p>
    <p>14.1 Despesas pessoais ou hospedagens não incluídas no programa são de responsabilidade
    exclusiva do Contratante.</p>

    <p class="clausula-titulo">CLÁUSULA DÉCIMA QUINTA – DO NÚMERO MÍNIMO DE PASSAGEIROS</p>
    <p>15.1 A saída do ônibus está condicionada ao mínimo de 35 passageiros; podendo ser feita em vans
    (mín. 12) ou micro-ônibus (mín. 22) caso o número seja inferior.</p>

    <p class="clausula-titulo">CLÁUSULA DÉCIMA SEXTA – DO DESLIGAMENTO</p>
    <p>16.1 A Contratada poderá desligar da excursão qualquer passageiro que causar transtornos ou
    desrespeitar as regras de convivência.</p>

    <p class="clausula-titulo">CLÁUSULA DÉCIMA SÉTIMA – IMPORTANTE</p>
    <p>17.1 O guia da excursão é a autoridade máxima durante a viagem.<br>
    17.2 O itinerário poderá sofrer alterações devido a clima, trânsito ou questões técnicas.<br>
    17.3 É proibido fumar ou usar entorpecentes no interior do veículo, sob pena de retirada do
    passageiro.</p>

    <p class="clausula-titulo">CLÁUSULA DE AUTORIZAÇÃO DE USO DE IMAGEM</p>
    <p>O contratante autoriza, de forma gratuita, definitiva e irrevogável, o uso de sua imagem, voz e
    nome, captados durante a excursão, para fins de divulgação, promoção e registro do evento, em
    qualquer meio de comunicação. Caso não deseje autorizar, deverá manifestar-se expressamente por
    escrito até a data de início da excursão.</p>

    <p class="clausula-titulo">DO FORO</p>
    <p>As partes elegem o foro da ${CONTRATADA_DADOS.foro}, renunciando a qualquer outro, para
    eventuais controvérsias decorrentes deste contrato. Em sinal de concordância, assinam o presente
    instrumento em duas vias de igual teor, na presença de duas testemunhas.</p>

    <p>${(evento.local || "Brasília")}, ${dataFormatada}.</p>

    <div class="campo-assinatura">
      <div class="assinatura">CONTRATANTE<br>${usuario.nome}<br>CPF: ${usuario.cpf || "________"}</div>
      <div class="assinatura">CONTRATADO<br>${CONTRATADA_DADOS.razao_social}<br>CNPJ: ${CONTRATADA_DADOS.cnpj}</div>
    </div>

    <div class="footer">
      <p>Contrato gerado em ${dataFormatada} às ${dataAceite.toLocaleTimeString("pt-BR")} — Aceite digital
      registrado com IP ${dadosContrato.aceite_ip} — Reserva ID: ${dadosContrato.reserva_id}</p>
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
