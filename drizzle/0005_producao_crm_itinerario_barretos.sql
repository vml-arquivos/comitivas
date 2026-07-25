-- Evolução segura da base que já recebeu o seed Barretos 2026.
-- Esta migration reaproveita os CUIDs existentes e não cria um segundo evento.

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'visitante';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservas_status_idx ON reservas (status);
--> statement-breakpoint
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pendente';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pagamentos_status_idx ON pagamentos (status);
--> statement-breakpoint

ALTER TABLE lotes ADD COLUMN IF NOT EXISTS data_embarque TIMESTAMP;
--> statement-breakpoint
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS data_retorno TIMESTAMP;
--> statement-breakpoint
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS local_embarque VARCHAR(255);
--> statement-breakpoint
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS local_hospedagem VARCHAR(255);
--> statement-breakpoint

ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS observacoes TEXT;
--> statement-breakpoint
ALTER TABLE leads_origem ADD COLUMN IF NOT EXISTS proximo_contato_em TIMESTAMP;
--> statement-breakpoint

-- Corrige clientes históricos que foram cadastrados antes da integração
-- transacional entre conta e CRM.
INSERT INTO leads_origem (
  id,
  codigo_origem,
  usuario_id,
  nome,
  whatsapp,
  email,
  origem,
  status,
  consentimento_whatsapp,
  dados_contexto,
  atualizado_em,
  criado_em
)
SELECT
  'lead-cadastro-' || u.id,
  LEFT('cadastro-direto-' || u.id, 100),
  u.id,
  u.nome,
  NULLIF(regexp_replace(COALESCE(u.telefone, ''), '\D', '', 'g'), ''),
  u.email,
  'cadastro_direto',
  'cadastrado',
  false,
  '{"origem":"backfill_clientes"}'::jsonb,
  COALESCE(u.atualizado_em, CURRENT_TIMESTAMP),
  COALESCE(u.criado_em, CURRENT_TIMESTAMP)
FROM usuarios u
WHERE u.tipo = 'cliente'
  AND NOT EXISTS (
    SELECT 1
    FROM leads_origem l
    WHERE l.usuario_id = u.id
  );
--> statement-breakpoint

-- Enriquece exatamente o evento criado pelo comando
-- seed:barretos-2026:prod, sem substituir seu id.
UPDATE eventos
SET
  descricao = 'Viva a 71ª Festa do Peão de Barretos com transporte, hospedagem, alimentação, open bar e suporte da Excursão das Comitivas. Escolha o primeiro ou o segundo fim de semana e a modalidade de hospedagem ideal.',
  -- A aplicação persiste TIMESTAMP sem fuso usando UTC; 03:00 UTC equivale
  -- a 00:00 em Brasília e 02:59 UTC ao fim do dia anterior em -03:00.
  data_inicio = '2026-08-20 03:00:00',
  data_fim = '2026-08-31 02:59:00',
  local = 'Parque do Peão — Barretos/SP',
  ativo = true,
  atualizado_em = CURRENT_TIMESTAMP
WHERE nome = 'Excursão das Comitivas — Festa do Peão de Barretos 2026';
--> statement-breakpoint

UPDATE lotes
SET
  descricao = 'Primeiro fim de semana da Festa do Peão, com saída de Brasília e embarque adicional em Goiânia.',
  data_inicio = '2026-08-20 03:00:00',
  data_fim = '2026-08-24 02:59:00',
  data_embarque = '2026-08-20 02:59:00',
  data_retorno = '2026-08-24 02:59:00',
  local_embarque = 'Brasília/DF, com embarque adicional em Goiânia/GO',
  local_hospedagem = 'Chácara Recanto Novo Encantado ou Santa Thereza — Barretos/SP',
  atualizado_em = CURRENT_TIMESTAMP
WHERE nome = '1º Fim de Semana — 20 a 23/08/2026'
  AND evento_id IN (
    SELECT id FROM eventos
    WHERE nome = 'Excursão das Comitivas — Festa do Peão de Barretos 2026'
  );
--> statement-breakpoint

UPDATE lotes
SET
  descricao = 'Segundo fim de semana da Festa do Peão, com saída de Brasília e embarque adicional em Goiânia.',
  data_inicio = '2026-08-27 03:00:00',
  data_fim = '2026-08-31 02:59:00',
  data_embarque = '2026-08-27 02:59:00',
  data_retorno = '2026-08-31 02:59:00',
  local_embarque = 'Brasília/DF, com embarque adicional em Goiânia/GO',
  local_hospedagem = 'Chácara Recanto Novo Encantado ou Santa Thereza — Barretos/SP',
  atualizado_em = CURRENT_TIMESTAMP
WHERE nome = '2º Fim de Semana — 27 a 30/08/2026'
  AND evento_id IN (
    SELECT id FROM eventos
    WHERE nome = 'Excursão das Comitivas — Festa do Peão de Barretos 2026'
  );
--> statement-breakpoint

-- A disponibilidade informada para o lançamento é aplicada uma única vez
-- pela migration. Reexecutar o seed depois disso não altera decisões comerciais
-- feitas no painel.
UPDATE pacotes
SET disponibilidade = 'esgotado', atualizado_em = CURRENT_TIMESTAMP
WHERE modalidade_hospedagem = 'quarto_ventilador'
  AND lote_id IN (
    SELECT l.id
    FROM lotes l
    JOIN eventos e ON e.id = l.evento_id
    WHERE e.nome = 'Excursão das Comitivas — Festa do Peão de Barretos 2026'
      AND l.nome = '2º Fim de Semana — 27 a 30/08/2026'
  );
--> statement-breakpoint

UPDATE pacotes
SET disponibilidade = 'ultimas_vagas', atualizado_em = CURRENT_TIMESTAMP
WHERE modalidade_hospedagem = 'quarto_ar_condicionado'
  AND lote_id IN (
    SELECT l.id
    FROM lotes l
    JOIN eventos e ON e.id = l.evento_id
    WHERE e.nome = 'Excursão das Comitivas — Festa do Peão de Barretos 2026'
      AND l.nome = '2º Fim de Semana — 27 a 30/08/2026'
  );
