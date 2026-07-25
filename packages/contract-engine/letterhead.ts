import { COMITIVA_LOGO_PDF_B64 } from "./logo_constants.js";

// ============================================================
// PAPEL TIMBRADO — EXCURSÃO DAS COMITIVAS
// Cabeçalho: logo oficial otimizada + identidade bordô
// Rodapé: dados oficiais da contratada
// ============================================================

/** Dados fixos da CONTRATADA */
export const CONTRATADA_DADOS = {
  razao_social: 'HENRIQUE SANTOS CUNHA',
  cnpj: '39.763.571/0001-13',
  endereco_sede: 'QR 502 Conjunto 20 – Samambaia Sul/DF, CEP 72.210-420',
  email: 'excursaodascomitivas@gmail.com',
  pix_chave: '43.580.053/0001-31',
  pix_banco: 'CORA',
  foro: 'Comarca de Brasília/DF',
};

/**
 * Template de CABEÇALHO para Puppeteer (displayHeaderFooter: true).
 * Logo oficial comprimida e embutida, sem dependência de rede durante a geração.
 */
export function getPuppeteerHeaderTemplate(): string {
  const logo = COMITIVA_LOGO_PDF_B64;
  return `<div style="-webkit-print-color-adjust:exact;width:100%;height:28mm;display:flex;align-items:center;justify-content:flex-start;background:#ffffff;border-bottom:2px solid #7f1d1d;padding:0 20mm;box-sizing:border-box;margin:0;">${logo ? `<img src="${logo}" alt="Excursão das Comitivas" style="max-height:48px;max-width:170px;display:block;object-fit:contain;"/>` : '<span style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#7f1d1d;">EXCURSÃO DAS COMITIVAS</span>'}</div>`;
}

/** Template de RODAPÉ para Puppeteer. */
export function getPuppeteerFooterTemplate(): string {
  return `<div style="-webkit-print-color-adjust:exact;width:100%;height:16mm;background:#ffffff;border-top:1px solid #cccccc;padding:6px 20mm 0 20mm;box-sizing:border-box;font-family:Arial,sans-serif;font-size:7.5pt;line-height:1.4;color:#555555;"><strong style="color:#000000;">EXCURSÃO DAS COMITIVAS</strong> · HENRIQUE SANTOS CUNHA · CNPJ 39.763.571/0001-13<br/>QR 502 Conjunto 20 - Samambaia Sul/DF, CEP 72.210-420 · excursaodascomitivas@gmail.com</div>`;
}

/** CSS compartilhado para o corpo dos documentos */
export function getDocumentStyles(): string {
  return `
    @page {
      size: A4;
      margin: 22mm 18mm 26mm 18mm;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html,
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.45;
      color: #111827;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      width: 100%;
    }

    .contract-page,
    .contract-content,
    main {
      width: 100%;
    }

    h1.doc-title,
    .contract-title {
      font-size: 13pt;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      line-height: 1.25;
      margin: 0 0 14px 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    h2.section-title,
    .contract-section-title {
      font-size: 10.2pt;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.25;
      margin: 12px 0 5px 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    p.clause,
    p {
      text-align: justify;
      line-height: 1.45;
      margin: 0 0 6px 0;
      font-size: 10pt;
      orphans: 3;
      widows: 3;
    }

    .contract-clause {
      margin-bottom: 7px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 9.2pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    table.data-table th {
      background: #1B3A8C;
      color: #fff;
      padding: 5px 8px;
      text-align: left;
      font-weight: bold;
    }

    table.data-table td {
      border: 1px solid #ccc;
      padding: 4px 8px;
      vertical-align: top;
    }

    table.data-table tr:nth-child(even) td {
      background: #f4f7ff;
    }

    .highlight-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 12px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .highlight-box {
      border: 1.5px solid #1B3A8C;
      border-radius: 3px;
      padding: 8px 12px;
      background: #f0f4ff;
    }

    .highlight-box .label {
      font-size: 8pt;
      color: #1B3A8C;
      text-transform: uppercase;
      font-weight: bold;
      margin-bottom: 3px;
    }

    .highlight-box .value {
      font-size: 15pt;
      font-weight: bold;
      color: #1B3A8C;
    }

    .highlight-box .unit {
      font-size: 9pt;
      color: #555;
    }

    /* ─── Cidade e Data ─────────────────────────────────────────────────── */
    .city-date,
    .signature-date {
      text-align: right;
      margin: 28px 0 36px 0;
      font-size: 10pt;
      font-style: italic;
      color: #374151;
      line-height: 1.4;
    }

    /* ─── Contenção de quebra de página ─────────────────────────────────── */
    .signature-section,
    .sig-block,
    .sig-wrapper,
    .keep-together {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ─── Seção de assinatura ────────────────────────────────────────────── */
    .signature-section {
      margin-top: 44px;
      padding-top: 0;
      text-align: center;
    }

    /* ─── Grade de assinaturas (2 colunas) ──────────────────────────────── */
    .signature-grid {
      width: 100%;
      max-width: 160mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24mm;
      margin: 0 auto;
      align-items: end;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ─── Caixa individual de cada assinante ────────────────────────────── */
    .signature-party,
    .signature-box {
      text-align: center;
      /* Espaço generoso para assinatura digital ou manuscrita */
      min-height: 120px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding-bottom: 2px;
    }

    /* ─── Linha de assinatura ───────────────────────────────────────────── */
    .sig-line,
    .signature-line {
      border: none;
      border-top: 1.5px solid #1e293b;
      width: 100%;
      max-width: 76mm;
      margin: 0 auto 8px;
      height: 0;
    }

    /* ─── Rótulo "Assine acima" (opcional, para uso futuro) ─────────────── */
    .sig-hint {
      font-size: 7pt;
      color: #94a3b8;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin: 0 0 10px;
    }

    /* ─── Nome do assinante ─────────────────────────────────────────────── */
    .sig-name,
    .signature-name {
      font-size: 9pt;
      line-height: 1.3;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      overflow-wrap: anywhere;
      margin: 0 0 3px;
    }

    /* ─── Informações secundárias (CPF, CNPJ, papel) ───────────────────── */
    .sig-sub,
    .signature-role {
      font-size: 8pt;
      line-height: 1.3;
      color: #475569;
      margin: 0 0 2px;
    }

    /* ─── Papel / função do assinante (ex: CONTRATANTE) ────────────────── */
    .sig-role-label {
      font-size: 7.8pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #1e3a5f;
      margin: 4px 0 0;
      border-top: 1px dashed #cbd5e1;
      padding-top: 4px;
    }

    /* ─── Grade de testemunhas ──────────────────────────────────────────── */
    .witness-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24mm;
      max-width: 160mm;
      margin: 36px auto 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .witness-box {
      min-height: 100px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      text-align: center;
    }

    /* ─── Rodapé final do contrato ──────────────────────────────────────── */
    .contract-footer-final {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 7.8pt;
      color: #64748b;
      line-height: 1.4;
    }

    .nota {
      font-style: italic;
      font-size: 9pt;
      text-align: justify;
      margin: 12px 0;
    }

    .page-break {
      page-break-after: always;
    }

    @media print {
      .no-break,
      .keep-together,
      .signature-section,
      .signature-grid,
      .witness-grid,
      .data-table {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .page-break-before {
        page-break-before: always;
        break-before: page;
      }
    }
  `;
}

/**
 * Gera HTML completo para visualização inline / fallback sem Puppeteer.
 * Layout idêntico ao template oficial: logo e identidade bordô no topo,
 * conteúdo no meio e dados oficiais da contratada no rodapé.
 */
export function gerarHtmlTimbrado(body: string, titulo?: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Excursão das Comitivas${titulo ? ' — ' + titulo : ''}</title>
  <style>
    ${getDocumentStyles()}
    body { display: flex; flex-direction: column; min-height: 100vh; padding: 0; }
    .page-header {
      width: 100%; display: flex; align-items: center; justify-content: flex-start;
      padding: 16px 2cm; border-bottom: 2px solid #7f1d1d; background: #ffffff;
    }
    .page-content { flex-grow: 1; padding: 1.2cm 2cm; }
    .contract-footer-final {
      width: 100%; padding: 10px 2cm 14px; border-top: 1px solid #ccc;
      font: 9px/1.5 Arial, sans-serif; color: #555; background: #fff; margin-top: auto;
    }
    .contract-footer-final strong { color: #111; }
  </style>
</head>
<body>
  ${getHtmlHeaderEmbutido()}
  <main class="page-content">${body}</main>
  ${getHtmlFooterEmbutido()}
</body>
</html>`;
}

/**
 * Cabeçalho embutido no fluxo normal do HTML.
 * Usado para aparecer apenas na primeira página do PDF.
 */
export function getHtmlHeaderEmbutido(): string {
  const logo = COMITIVA_LOGO_PDF_B64;
  return `<header class="page-header">${logo ? `<img src="${logo}" alt="Excursão das Comitivas" style="max-height:50px;max-width:180px;object-fit:contain;"/>` : '<strong style="color:#7f1d1d;font-family:Arial,sans-serif;">EXCURSÃO DAS COMITIVAS</strong>'}</header>`;
}

/**
 * Rodapé embutido no fluxo normal do HTML.
 * Usado para aparecer apenas na última página do PDF.
 */
export function getHtmlFooterEmbutido(): string {
  return `<footer class="contract-footer-final"><strong>EXCURSÃO DAS COMITIVAS</strong> · HENRIQUE SANTOS CUNHA · CNPJ 39.763.571/0001-13<br/>QR 502 Conjunto 20 - Samambaia Sul/DF, CEP 72.210-420 · excursaodascomitivas@gmail.com</footer>`;
}
