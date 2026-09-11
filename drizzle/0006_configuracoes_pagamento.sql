-- Configurações de pagamento editáveis pelo admin pelo painel, sem precisar
-- de redeploy: desconto do PIX, teto de parcelas do cartão e teto de meses
-- de antecedência para o boleto parcelado. Tabela singleton (uma única linha
-- id='default'). Credenciais de gateway (Mercado Pago/Asaas) NÃO ficam aqui —
-- continuam como variável de ambiente por serem segredos.
CREATE TABLE IF NOT EXISTS configuracoes_pagamento (
  id TEXT PRIMARY KEY DEFAULT 'default',
  pix_desconto_percentual NUMERIC(5,2) NOT NULL DEFAULT 5,
  credito_parcelas_maximo INTEGER NOT NULL DEFAULT 10,
  boleto_meses_maximo_antecedencia INTEGER NOT NULL DEFAULT 20,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por TEXT
);
--> statement-breakpoint

INSERT INTO configuracoes_pagamento (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;
