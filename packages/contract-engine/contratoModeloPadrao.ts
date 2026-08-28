import { CONTRATADA_DADOS } from "./letterhead.js";
import { COMITIVA_CONTRACT_WATERMARK_B64 } from "./logo_constants.js";

export type ContratoModeloSnapshot = {
  cliente: Record<string, unknown>;
  periodo: { check_in: string; check_out: string };
  hospedagem: { modalidade: string | null; local: string };
  financeiro: {
    total: string;
    desconto_pagamento: string;
    forma_pagamento: string | null;
    parcelas: number;
    cronograma: Array<{ numero: number; vencimento: string; valor: string; valor_centavos: number }>;
  };
  transporte: {
    rodoviario_incluido: boolean;
    local_embarque: string | null;
    ponto_referencia: string | null;
    data_saida: string | null;
    data_retorno: string | null;
    horario_saida: string | null;
    horario_retorno: string | null;
    veiculo: string | null;
  };
  bagagem?: { limite_kg: number | null };
  seguro?: { seguradora: string | null; apolice: string | null; cobertura: string | null; telefone: string | null };
  uso_imagem?: { autorizado: boolean; prazo_anos: number };
  data_contrato: string;
  versao_contratual: string;
};

export type ContratoModeloContext = {
  reservaId: string;
  snapshot: ContratoModeloSnapshot;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function valueOrBlank(value: unknown, fallback = "______________________________"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function dateParts(value: unknown): [string, string, string] | null {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return [iso[1], iso[2], iso[3]];
  const br = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (br) return [br[3], br[2], br[1]];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return [String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")];
}

function formatDate(value: unknown, fallback = "___/___/____"): string {
  const parts = dateParts(value);
  return parts ? `${parts[2]}/${parts[1]}/${parts[0]}` : fallback;
}

function formatLongDate(value: unknown): string {
  const parts = dateParts(value);
  if (!parts) return "____ de __________________ de ______";
  const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  return `${parts[2]} de ${months[Number(parts[1]) - 1] || "__________________"} de ${parts[0]}`;
}

function money(value: unknown): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "R$ __________________";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}

function cpf(value: unknown): string {
  const raw = String(value ?? "").replace(/\D/g, "");
  return raw.length === 11 ? raw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : valueOrBlank(value, "***.***.***-**");
}

function numberToWords(value: unknown): string {
  const units = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const group = (n: number): string => {
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ` e ${units[n % 10]}` : "");
    if (n === 100) return "cem";
    return hundreds[Math.floor(n / 100)] + (n % 100 ? ` e ${group(n % 100)}` : "");
  };
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "________________________";
  const centsTotal = Math.round(amount * 100);
  const inteiro = Math.floor(centsTotal / 100);
  const cents = centsTotal % 100;
  const pieces: string[] = [];
  if (inteiro >= 1_000_000) {
    const millions = Math.floor(inteiro / 1_000_000);
    pieces.push(`${group(millions)} ${millions === 1 ? "milhão" : "milhões"}`);
  }
  const thousands = Math.floor((inteiro % 1_000_000) / 1000);
  if (thousands) pieces.push(thousands === 1 ? "mil" : `${group(thousands)} mil`);
  const remainder = inteiro % 1000;
  if (remainder) pieces.push(group(remainder));
  const wholeText = pieces.join(" e ") || "zero";
  const currency = inteiro === 1 ? "real" : "reais";
  return cents ? `${wholeText} ${currency} e ${group(cents)} ${cents === 1 ? "centavo" : "centavos"}` : `${wholeText} ${currency}`;
}

function modality(selected: string | null, value: string, label: string): string {
  return `<span class="check-option">(${selected === value ? " X " : "  "}) ${label}</span>`;
}

function vehicle(selected: string | null, value: string, label: string): string {
  return `<li>${selected === value ? "☒" : "☐"} ${label}</li>`;
}

function scheduleRows(snapshot: ContratoModeloSnapshot): string {
  const rows = snapshot.financeiro.cronograma?.length
    ? snapshot.financeiro.cronograma
    : [{ numero: 1, vencimento: "", valor: "", valor_centavos: 0 }];
  return rows.map((item) => `<tr><td>${item.numero}º PARCELA ${item.valor ? escapeHtml(money(item.valor)) : "R$ ________"}</td><td class="due">VENCIMENTO: ${escapeHtml(formatDate(item.vencimento))}</td></tr>`).join("");
}

function transportValue(value: string | null, fallback: string): string {
  return escapeHtml(valueOrBlank(value, fallback));
}

export function renderizarContratoModeloPadrao({ snapshot, reservaId }: ContratoModeloContext): string {
  const c = snapshot.cliente || {};
  const h = snapshot.hospedagem || { modalidade: null, local: "" };
  const f = snapshot.financeiro || { total: "", desconto_pagamento: "", forma_pagamento: null, parcelas: 1, cronograma: [] };
  const t = snapshot.transporte || { rodoviario_incluido: false, local_embarque: null, ponto_referencia: null, data_saida: null, data_retorno: null, horario_saida: null, horario_retorno: null, veiculo: null };
  const bagagem = snapshot.bagagem || { limite_kg: null };
  const seguro = snapshot.seguro || { seguradora: null, apolice: null, cobertura: null, telefone: null };
  const usoImagem = snapshot.uso_imagem || { autorizado: true, prazo_anos: 3 };
  const nome = valueOrBlank(c.nome, "______________________________");
  const nacionalidade = valueOrBlank(c.nacionalidade, "brasileiro");
  const estadoCivil = valueOrBlank(c.estado_civil, "________________");
  const profissao = valueOrBlank(c.profissao, "________________");
  const nascimento = formatDate(c.nascimento, "__/__/____");
  const identidade = valueOrBlank(c.rg, "***********");
  const endereco = valueOrBlank(c.endereco, "******************, ***********, *******, Minas Gerais");
  const telefone = valueOrBlank(c.telefone, "(31) *********");
  const email = valueOrBlank(c.email, "*********@hotmail.com");
  const total = Number(f.total || 0);
  const totalMoney = total > 0 ? money(total) : "R$ ________";
  const totalWords = total > 0 ? numberToWords(total) : "________________________";
  const modalidade = h.modalidade || null;
  const checkin = formatDate(snapshot.periodo?.check_in);
  const checkout = formatDate(snapshot.periodo?.check_out);
  const localHospedagem = valueOrBlank(h.local, "Chácara Recanto Novo Encantado ou Santa Thereza");
  const limiteBagagem = bagagem.limite_kg ? `${bagagem.limite_kg} kg` : "________ kg";
  const imagemTexto = usoImagem.autorizado === false
    ? "O contratante não autoriza o uso de sua imagem para divulgação institucional da excursão."
    : `O contratante autoriza o uso de sua imagem pelo prazo de ${usoImagem.prazo_anos || 3} (três) anos para divulgação institucional da excursão, podendo manifestar oposição por escrito antes do início do evento.`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>CONTRATO DE PACOTE DE VIAGEM- EXCURSÃO DAS COMITIVAS 2026</title>
<style>
  @page { size: A4; margin: 11mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { position: relative; }
  .page-border { position: fixed; z-index: 0; pointer-events: none; inset: 7mm; border: 0.8pt solid #111; }
  .page-watermark { position: fixed; z-index: 0; pointer-events: none; left: 50%; top: 51%; width: 181mm; height: 173mm; transform: translate(-50%, -50%); background: center / contain no-repeat url('${COMITIVA_CONTRACT_WATERMARK_B64}'); opacity: .145; }
  .document { position: relative; z-index: 1; padding: 5mm 8mm 3mm; }
  h1, h2, h3, p, ul, table { position: relative; z-index: 1; }
  h1 { margin: 0 0 17px; font-size: 13pt; line-height: 1.25; text-align: center; font-weight: 700; }
  h2 { margin: 17px 0 7px; font-size: 10.2pt; line-height: 1.18; text-transform: uppercase; font-weight: 700; page-break-after: avoid; }
  p { margin: 0 0 9px; text-align: justify; }
  .qualification { margin-bottom: 4px; }
  .qualification strong, .clause strong { font-weight: 700; }
  .check-options { margin: 5px 0 10px 19px; display: flex; flex-direction: column; gap: 2px; }
  .check-option { display: block; }
  ul.model-list { list-style: none; margin: 3px 0 8px 19px; padding: 0; }
  ul.model-list li { margin: 0 0 2px; }
  table.installments { width: 70%; margin: 7px 0 11px 40px; border-collapse: collapse; font-size: 8.6pt; page-break-inside: avoid; }
  table.installments td { border: 1px solid #222; padding: 1px 5px; line-height: 1.1; }
  table.installments td:first-child { width: 50%; }
  table.installments .due { color: #e11d2e; }
  .signature-wrap { margin-top: 27px; display: grid; grid-template-columns: 1fr 1fr; column-gap: 19mm; row-gap: 15px; page-break-inside: avoid; }
  .signature { min-height: 63px; text-align: center; font-size: 9pt; line-height: 1.22; }
  .signature-line { border-top: 1px solid #111; margin: 0 auto 5px; width: 90%; }
  .signature strong { font-weight: 700; }
  .metadata { display: none; }
  .page-break { page-break-before: always; break-before: page; }
  .avoid-break { page-break-inside: avoid; }
</style></head><body>
<div class="page-border"></div><div class="page-watermark" aria-hidden="true"></div>
<main class="document">
<h1>CONTRATO DE PACOTE DE VIAGEM- EXCURSÃO DAS COMITIVAS 2026</h1>
<h2>QUALIFICAÇÃO DAS PARTES:</h2>
<p class="qualification">As partes qualificadas neste instrumento celebram, pelo presente, contrato para a prestação de serviços de <strong>HOSPEDAGEM/TRANSPORTE</strong></p>
<p class="qualification"><strong>Contratada:</strong> ${escapeHtml(CONTRATADA_DADOS.razao_social)}, empresa inscrita no CNPJ ${escapeHtml(CONTRATADA_DADOS.cnpj)}, com sede na Qr 502 conjunto 20 – Samambaia Sul/DF, CEP 72.210-420, e-mail: ${escapeHtml(CONTRATADA_DADOS.email)}</p>
<p class="qualification"><strong>Contratante:</strong> ${escapeHtml(nome)}, ${escapeHtml(nacionalidade)}, ${escapeHtml(estadoCivil)}, ${escapeHtml(profissao)}, nascida em ${escapeHtml(nascimento)} portador da identidade nº ${escapeHtml(identidade)} e CPF ${escapeHtml(cpf(c.cpf))}, Residente: ${escapeHtml(endereco)}, telefone: ${escapeHtml(telefone)} e-mail: ${escapeHtml(email)}, têm entre si, justo e contratados, o que mutuamente outorgam, aceitam e assinam, convencionados pelas cláusulas termos e condições a seguir devidamente enumeradas.</p>
<h2>CLÁUSULA PRIMEIRA<br/>DO OBJETO DO CONTRATO</h2>
<p class="clause"><strong>1.1</strong> O presente contrato tem por objeto a prestação de serviços de hospedagem/transporte durante a Festa do Peão de Barretos/SP, compreendendo hospedagem, café da manhã, almoço, open bar, translado interno entre a chácara e o Parque do Peão e demais serviços expressamente descritos neste instrumento.</p>
<p class="clause"><strong>1.2</strong> O evento possui caráter regional e ocorre apenas uma vez ao ano, motivo pelo qual não será possível a remarcação do pacote para data fora da temporada oficial.</p>
<p class="clause"><strong>1.3</strong> É de responsabilidade do contratante a leitura integral deste contrato antes de sua assinatura.</p>
<h2>CLÁUSULA SEGUNDA<br/>DOS DADOS DA HOSPEDAGEM</h2>
<p>Check-in: ${escapeHtml(checkin)}.<br/>Check-out: ${escapeHtml(checkout)}.<br/>Os horários poderão sofrer pequenos ajustes por necessidade operacional.</p>

<h2>CLÁUSULA TERCEIRA<br/>DA HOSPEDAGEM</h2>
<div class="page-break"></div><p>Modalidade de hospedagem:</p>
<div class="check-options">${modality(modalidade, "camping", "CAMPING")}${modality(modalidade, "quarto_ventilador", "QUARTO COM VENTILADOR COMPARTILHADO.")}${modality(modalidade, "quarto_ar_condicionado", "QUARTO COM CLIMATIZADOR COMPARTILHADO.")}</div>
<p class="clause"><strong>3.1</strong> A hospedagem será realizada na ${escapeHtml(localHospedagem)}.</p>
<p class="clause"><strong>3.2</strong> Havendo necessidade, a contratada poderá substituir a hospedagem por estabelecimento de padrão equivalente ou superior, preservando localização, segurança e estrutura semelhantes.</p>
<p class="clause"><strong>3.3</strong> Os quartos são compartilhados, separados por masculino e feminino, com ocupação variável entre 5 e 10 pessoas.</p>
<p class="clause"><strong>3.4</strong> Todos os quartos possuem banheiro privativo. A área de camping possui banheiros coletivo.</p>
<p class="clause"><strong>3.5</strong> A hospedagem dispõe de piscina, ventilador ou climatizador.</p>
<p class="clause"><strong>3.6</strong> A roupa de cama é de responsabilidade exclusiva do hóspede bem como itens de higiene pessoal.</p>
<h2>CLÁUSULA QUARTA<br/>DOS SERVIÇOS INCLUSOS</h2>
<p>Hospedagem; café da manhã que será servido das 8:30hrs às 10hrs; almoço servido das 13hrs às 15hrs; Open Bar das 09h às 19h; translado entre a chácara e o Parque do Peão.</p>
<p>O Open Bar é destinado exclusivamente a <strong>maiores de 18 anos.</strong> A empresa não se responsabiliza por embriaguez, mal súbito ou acidentes decorrentes do consumo excessivo de bebidas alcoólicas.</p>
<h2>CLÁUSULA QUINTA<br/>DAS FORMAS DE PAGAMENTO</h2>
<p><strong>5.1.</strong> O valor total do pacote turístico é de ${escapeHtml(totalMoney)} (${escapeHtml(totalWords)}), podendo ser pago por uma das seguintes modalidades:</p>
<p><strong>I – Pagamento à vista via PIX:</strong> com desconto de 5% (cinco por cento), mediante utilização da chave PIX vinculada ao CNPJ da CONTRATADA, qual seja:<br/><strong>CHAVE: ${escapeHtml(CONTRATADA_DADOS.pix_chave)}</strong><br/><strong>BANCO: ${escapeHtml(CONTRATADA_DADOS.pix_banco)}</strong></p>
<div class="page-break"></div><p><strong>II – Parcelamento por boleto bancário:</strong> sem incidência de juros, observado que a quantidade de parcelas disponíveis será definida de acordo com a data da contratação, devendo o valor integral do pacote estar obrigatoriamente quitado antes da data de início da hospedagem.<br/>Atentando-se as seguintes datas:</p>
<table class="installments"><tbody>${scheduleRows(snapshot)}</tbody></table>
<p><strong>III – Parcelamento por cartão de crédito:</strong> em até 10 (dez) parcelas, incidindo os encargos e taxas eventualmente praticados pela administradora do cartão de crédito, os quais serão integralmente suportados pelo <strong>CONTRATANTE.</strong></p>
<p><strong>5.2.</strong> A confirmação da reserva somente ocorrerá após a comprovação do pagamento da primeira parcela ou do valor integral contratado, conforme a modalidade de pagamento escolhida.</p>
<p><strong>5.3.</strong> O inadimplemento das parcelas não garante ao <strong>CONTRATANTE</strong> o direito de usufruir dos serviços contratados, ficando a participação na excursão condicionada à quitação integral do contrato antes da data do evento.</p>
<h2>CLÁUSULA SEXTA<br/>DO ATRASO NO PAGAMENTO</h2>
<p><strong>6.1.</strong> O atraso no pagamento de qualquer parcela implicará a incidência de multa moratória de 2% (dois por cento) sobre o valor da parcela vencida, acrescida de juros de mora de 1% (um por cento) ao mês, calculados proporcionalmente aos dias de atraso, bem como atualização monetária pelo Índice Nacional de Preços ao Consumidor Amplo – IPCA, ou outro índice oficial que venha a substituí-lo.</p>
<p><strong>6.2.</strong> Permanecendo o débito em aberto, a <strong>CONTRATADA</strong> poderá promover a cobrança pelos meios legalmente admitidos, sem prejuízo da aplicação das penalidades previstas neste contrato.</p>
<p><strong>6.3.</strong> O atraso ou inadimplemento de 2 ou mais parcelas poderá acarretar a suspensão da reserva e impedir a participação do <strong>CONTRATANTE</strong> na excursão, caso o pagamento integral não seja efetuado até a data de início do evento, sem prejuízo da aplicação da política de cancelamento prevista neste contrato.</p>

<h2>CLÁUSULA SÉTIMA<br/>DO CANCELAMENTO E DA POLÍTICA DE REEMBOLSO</h2>
<div class="page-break"></div><p><strong>7.1.</strong> O <strong>CONTRATANTE</strong> poderá solicitar o cancelamento do presente contrato a qualquer tempo, mediante comunicação formal à <strong>CONTRATADA</strong>, por escrito ou por outro meio de comunicação disponibilizado pela empresa.</p>
<p><strong>7.2.</strong> Considerando que o presente contrato tem por objeto a prestação de serviços de hospedagem temporária durante a Festa do Peão de Barretos/SP, evento de caráter regional realizado apenas uma vez ao ano, cuja organização demanda reservas antecipadas de hospedagem, contratação de fornecedores, aquisição de alimentos e bebidas, contratação de mão de obra, estrutura operacional e demais custos logísticos, o cancelamento da contratação sujeitará o <strong>CONTRATANTE</strong> às retenções abaixo especificadas, destinadas exclusivamente à compensação das despesas administrativas, operacionais e financeiras já assumidas pela <strong>CONTRATADA.</strong></p>
<p><strong>7.3.</strong> Em caso de cancelamento por iniciativa do <strong>CONTRATANTE</strong>, serão observados os seguintes percentuais de retenção sobre o valor total do contrato:</p>
<p>I – Cancelamento realizado com antecedência superior a 90 (noventa) dias do início da hospedagem: retenção de 10% (dez por cento) do valor total contratado;<br/>II – Cancelamento realizado entre 80 (oitenta) e 60 (sessenta) dias antes do início da hospedagem: retenção de 20% (vinte por cento);<br/>III – Cancelamento realizado entre 50 (cinquenta) e 30 (trinta) dias antes do início da hospedagem: retenção de 30% (trinta por cento);<br/>IV – Cancelamento realizado entre 20 (vinte) e 15 (quinze) dias antes do início da hospedagem: retenção de 50% (cinquenta por cento);<br/>V – Cancelamento realizado com menos de 15 (quinze) dias de antecedência ao início da hospedagem: retenção de 80% (oitenta por cento) do valor total contratado, considerando a elevada dificuldade de reposição da vaga e as despesas operacionais já assumidas pela <strong>CONTRATADA.</strong><br/>VI – Na hipótese de não comparecimento do <strong>CONTRATANTE</strong> na data prevista para o início da hospedagem (no-show), sem comunicação prévia de cancelamento, ou de abandono voluntário da hospedagem após o início da prestação dos serviços, haverá retenção de 100% (cem por cento) do valor contratado, não sendo devido qualquer reembolso, em razão da efetiva disponibilização da vaga e da impossibilidade de sua comercialização a terceiros.</p>
<p><strong>7.4.</strong> Os valores eventualmente devidos ao <strong>CONTRATANTE</strong> serão restituídos no prazo de até 30 (trinta) dias contados da formalização do pedido de cancelamento, mediante o mesmo meio de pagamento utilizado na contratação ou outro acordado entre as partes.</p>
<p><strong>7.5.</strong> As retenções previstas nesta cláusula possuem natureza exclusivamente compensatória, destinando-se ao ressarcimento das despesas administrativas, operacionais e logísticas assumidas pela <strong>CONTRATADA</strong>, não constituindo penalidade ou enriquecimento sem causa.</p>
<p><strong>7.6.</strong> A presente cláusula foi estabelecida em observância aos princípios da boa-fé objetiva, da razoabilidade e da proporcionalidade, bem como em conformidade com a legislação aplicável, especialmente o Código de Defesa do Consumidor (Lei nº 8.078/1990), o Código Civil (Lei nº 10.406/2002) e a Lei Geral do Turismo (Lei nº 11.771/2008).</p>
<p><strong>7.7.</strong> Na hipótese de cancelamento do evento por determinação de autoridade pública, caso fortuito ou força maior que impeça sua realização, as partes buscarão, de comum acordo, a melhor solução para a execução ou encerramento do contrato, observada a legislação vigente.</p>
<h2>CLÁUSULA OITAVA<br/>DAS EXCLUSÕES</h2>
<p><strong>8.1.</strong> O valor do pacote contratado não inclui quaisquer serviços ou despesas que não estejam expressamente previstos neste instrumento, permanecendo de responsabilidade exclusiva do <strong>CONTRATANTE</strong>, dentre eles:</p>
<p>I – Ingressos para a Festa do Peão de Barretos, shows, rodeios, camarotes, festas particulares ou quaisquer outros eventos;<br/>II – Despesas pessoais, tais como lavanderia, medicamentos, alimentação e bebidas não previstas no pacote, compras, transporte por aplicativos ou quaisquer outros gastos de natureza particular;<br/>III – Contratação de passeios opcionais ou serviços oferecidos por terceiros durante a estadia;<br/>IV – Despesas decorrentes de atendimento médico, hospitalar, odontológico ou farmacêutico, bem como seguros de qualquer natureza;<br/>V – Perdas, extravios ou danos causados a objetos de uso pessoal, ressalvadas as hipóteses previstas em lei;<br/>VI – Quaisquer outros serviços ou despesas não expressamente descritos como inclusos neste contrato.</p>
<p><strong>8.2.</strong> O presente contrato compreende exclusivamente os serviços de hospedagem, alimentação, open bar, translado interno entre a chácara e o Parque do Peão e demais serviços expressamente previstos neste instrumento, não abrangendo transporte rodoviário interestadual ou qualquer outro serviço de transporte diverso do translado interno mencionado.</p>
<p><strong>8.3.</strong> Eventuais serviços contratados diretamente pelo <strong>CONTRATANTE</strong> junto a terceiros durante a execução da excursão serão de sua exclusiva responsabilidade, não respondendo a <strong>CONTRATADA</strong> por sua prestação, qualidade, pontualidade ou eventuais prejuízos deles decorrentes.</p>

<div class="page-break"></div><h2>CLÁUSULA NONA<br/>DOS DANOS</h2>
<p><strong>9.1.</strong> O <strong>CONTRATANTE</strong> compromete-se a zelar pela conservação das instalações da hospedagem, áreas comuns, equipamentos, mobiliários, veículos utilizados no translado interno e demais bens disponibilizados durante a execução do presente contrato.</p>
<p><strong>9.2.</strong> Todo dano material causado pelo <strong>CONTRATANTE</strong>, às instalações da hospedagem ou aos bens disponibilizados para utilização durante a excursão será de sua exclusiva responsabilidade, obrigando-se ao ressarcimento integral dos prejuízos efetivamente apurados.</p>
<p><strong>9.3.</strong> A apuração dos danos será realizada mediante vistoria, registro fotográfico, orçamento ou documento equivalente emitido pelo proprietário do estabelecimento ou fornecedor responsável, sendo assegurado ao <strong>CONTRATANTE</strong> o direito de ciência quanto aos prejuízos apurados.</p>
<p><strong>9.4.</strong> O ressarcimento dos danos deverá ser efetuado pelo <strong>CONTRATANTE</strong> no prazo de até 10 (dez) dias úteis contados da apresentação da comprovação do prejuízo, sem prejuízo das medidas judiciais cabíveis em caso de inadimplemento.</p>
<h2>CLÁUSULA DÉCIMA<br/>DO TRANSPORTE RODOVIÁRIO</h2>
<p><strong>10.1.</strong> O presente contrato poderá compreender, além dos serviços de hospedagem, alimentação e translado interno, o transporte rodoviário interestadual de passageiros, com saída da cidade de Brasília/DF e destino à cidade de Barretos/SP, bem como o respectivo retorno ao local de origem, conforme programação previamente divulgada pela <strong>CONTRATADA.</strong></p>
<p><strong>10.2.</strong> O transporte será realizado por empresa regularmente habilitada junto aos órgãos competentes, especialmente à Agência Nacional de Transportes Terrestres – ANTT, observadas as normas de segurança e a legislação vigente.</p>
<p><strong>10.3.</strong> As informações referentes ao transporte</p>
<ul class="model-list"><li>• Local de embarque: ${transportValue(t.local_embarque, "SAMAMBAIA AO LADO DO MERCADO DIA A DIA, ESTACIONAMENTO DO POSTO IPIRANGA.")}</li><li>• PONTO DE REFERÊNCIA: ${transportValue(t.ponto_referencia, "DISTRIBUIDORA ROIAL-SAIDA DA BR 060")}</li><li>• Data da saída: ${escapeHtml(formatDate(t.data_saida))}</li></ul><div class="page-break"></div><ul class="model-list"><li>• Horário previsto da saída: ${escapeHtml(valueOrBlank(t.horario_saida, "___/___/____"))}</li><li>• Data prevista para retorno: ${escapeHtml(formatDate(t.data_retorno))}</li><li>• Horário previsto do retorno: ${escapeHtml(valueOrBlank(t.horario_retorno, "___/___/____"))}</li><li>• Tipo do veículo:</li>${vehicle(t.veiculo, "Ônibus", "Ônibus")}${vehicle(t.veiculo, "Micro-ônibus", "Micro-ônibus")}${vehicle(t.veiculo, "Van", "Van")}</ul>
<h2>CLÁUSULA DÉCIMA PRIMEIRA<br/>DO EMBARQUE</h2>
<p><strong>11.1.</strong> O <strong>CONTRATANTE</strong> deverá comparecer ao local de embarque com antecedência mínima de 30 (trinta) minutos do horário previsto para saída do veículo, portando documento oficial de identificação com foto.</p>
<p><strong>11.2.</strong> O atraso do <strong>CONTRATANTE</strong> que impossibilite seu embarque será considerado de sua exclusiva responsabilidade, não gerando direito a reembolso, remarcação da viagem ou qualquer indenização.</p>
<p><strong>11.3.</strong> A <strong>CONTRATADA</strong> poderá alterar o horário de embarque ou o local previamente informado por necessidade operacional, devendo comunicar os passageiros pelos meios de comunicação informados no cadastro, com pelo menos 24 horas de antecedência.</p>
<p><strong>11.4.</strong> O embarque estará condicionado à apresentação de documento pessoal, bem como a confirmação do nome em lista previamente gerada pela contratada.</p>
<h2>CLÁUSULA DÉCIMA SEGUNDA<br/>DA BAGAGEM</h2>
<p><strong>12.1.</strong> Cada passageiro poderá transportar gratuitamente:</p>
<ul class="model-list"><li>• 01 (uma) bagagem principal de até ${escapeHtml(limiteBagagem)};</li><li>• 01 (uma) bagagem de mão.</li></ul>
<p><strong>12.2.</strong> Objetos de valor, dinheiro, documentos pessoais, equipamentos eletrônicos, joias, medicamentos e bens de uso pessoal deverão permanecer sob a guarda exclusiva do <strong>CONTRATANTE</strong> durante toda a viagem.</p>
<p><strong>12.3.</strong> A <strong>CONTRATADA</strong> não se responsabiliza por objetos esquecidos no interior do veículo ou por perdas decorrentes de culpa exclusiva do passageiro ou de terceiros.</p>
<p><strong>12.4.</strong> Não será permitido o transporte de:</p>
<ul class="model-list"><li>• armas de fogo sem autorização legal;</li></ul><div class="page-break"></div><ul class="model-list"><li>• explosivos;</li><li>• materiais inflamáveis;</li><li>• substâncias ilícitas;</li><li>• animais, salvo nas hipóteses previstas em lei.</li></ul>
<h2>CLÁUSULA DÉCIMA TERCEIRA<br/>DA POLTRONA</h2>
<p><strong>13.1.</strong> A poltrona destinada ao <strong>CONTRATANTE</strong> será indicada pela organização da excursão, na hora do embarque.</p>
<p><strong>13.2.</strong> Havendo necessidade operacional, manutenção do veículo, substituição da frota ou qualquer situação superveniente, a <strong>CONTRATADA</strong> poderá alterar a poltrona inicialmente designada, preservando, sempre que possível, categoria equivalente.</p>
<p><strong>13.3.</strong> Não será permitida a ocupação de poltrona diversa daquela indicada sem autorização da organização.</p>
<h2>CLÁUSULA DÉCIMA QUARTA<br/>DO SEGURO DE VIAGEM</h2>
<p><strong>14.1.</strong> Caso o transporte seja acompanhado de seguro de viagem, seus dados serão informados no momento da contratação:</p>
<p>Seguradora: ${escapeHtml(valueOrBlank(seguro.seguradora, "_______________________________________"))}<br/>Número da Apólice: ${escapeHtml(valueOrBlank(seguro.apolice, "______________________________"))}<br/>Cobertura: ${escapeHtml(valueOrBlank(seguro.cobertura, "______________________________________"))}<br/>Telefone para atendimento: ${escapeHtml(valueOrBlank(seguro.telefone, "_________________________"))}</p>
<p><strong>14.2.</strong> Na hipótese de inexistência de seguro adicional contratado para a viagem, o <strong>CONTRATANTE</strong> declara estar ciente de que serão aplicáveis apenas as coberturas obrigatórias previstas na legislação pertinente.</p>
<h2>CLÁUSULA DÉCIMA QUINTA<br/>DOS ATRASOS, IMPREVISTOS E SUBSTITUIÇÃO DO VEÍCULO</h2>
<p><strong>15.1.</strong> A <strong>CONTRATADA</strong> envidará todos os esforços para que os horários previstos sejam cumpridos, não se responsabilizando por atrasos decorrentes de fatores alheios à sua vontade, tais como:</p>
<p>I – Congestionamentos; II – acidentes de trânsito; III – condições climáticas adversas; IV – interdições de rodovias; V – fiscalizações realizadas por órgãos competentes; VI – manutenção corretiva ou preventiva do veículo; VII – caso fortuito ou força maior.</p>
<div class="page-break"></div><p><strong>15.2.</strong> Sempre que necessário para garantir a segurança dos passageiros ou a continuidade da viagem, a <strong>CONTRATADA</strong> poderá substituir o veículo inicialmente previsto por outro de categoria equivalente ou superior.</p>
<p><strong>15.3.</strong> Eventuais atrasos ou alterações decorrentes das hipóteses previstas nesta cláusula não caracterizarão descumprimento contratual, desde que a <strong>CONTRATADA</strong> adote as providências razoáveis para minimizar os impactos aos passageiros.</p>
<p><strong>15.4.</strong> O <strong>CONTRATANTE</strong> compromete-se a observar as normas de segurança durante todo o percurso, utilizando corretamente os equipamentos de segurança disponibilizados e atendendo às orientações do motorista e do responsável operacional da excursão.</p>

<h2>CLAUSULA DECIMA SEXTA<br/>DAS REGRAS DE CONVIVÊNCIA E DESLIGAMENTO</h2>
<p>Constituem motivos para desligamento da excursão: agressão física ou verbal, ameaças, dano ao patrimônio, uso de drogas ilícitas, violência, desrespeito reiterado às normas de convivência ou aos colaboradores da organização.</p>
<h2>CLÁUSULA DÉCIMA SÉTIMA<br/>DO RESPONSÁVEL OPERACIONAL</h2>
<p>O guia da excursão é o responsável operacional pela organização dos serviços durante o evento.</p>
<h2>CLÁUSULA DÉCIMA OITAVA<br/>DO TRANSLADO</h2>
<p>O translado compreende exclusivamente o percurso entre a chácara e o Parque do Peão, em horários previamente divulgados pela organização.</p>
<h2>CLÁUSULA DÉCIMA NONA<br/>DAS COMUNICAÇÕES</h2>
<p>As comunicações poderão ocorrer por WhatsApp, e-mail ou telefone informado pelo contratante. Consideram-se válidas as comunicações enviadas aos contatos cadastrados.</p>
<h2>CLÁUSULA VIGÉSIMA<br/>DO USO DE IMAGEM</h2>
<div class="page-break"></div><p>${escapeHtml(imagemTexto)}</p>
<p>Brasília, ${escapeHtml(formatLongDate(snapshot.data_contrato))}.</p>
  <div class="signature-wrap">
  <div class="signature"><div class="signature-line"></div><strong>CONTRATANTE</strong><br/>${escapeHtml(nome)}<br/>CPF: ${escapeHtml(cpf(c.cpf))}</div>
  <div class="signature"><div class="signature-line"></div><strong>CONTRATADO</strong><br/>${escapeHtml(CONTRATADA_DADOS.razao_social)}<br/>CNPJ: ${escapeHtml(CONTRATADA_DADOS.cnpj)}</div>
</div>
</main></body></html>`;
}
