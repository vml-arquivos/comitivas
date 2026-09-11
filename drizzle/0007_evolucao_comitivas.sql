-- Evolução 2026: somente estruturas novas. As migrations 0000–0006 permanecem imutáveis.

ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_idempotency_key_idx
  ON pagamentos (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE fotos_evento ADD COLUMN IF NOT EXISTS alt_text VARCHAR(500);
ALTER TABLE fotos_evento ADD COLUMN IF NOT EXISTS categoria VARCHAR(80) DEFAULT 'evento';
ALTER TABLE fotos_evento ADD COLUMN IF NOT EXISTS destaque BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fotos_evento ADD COLUMN IF NOT EXISTS capa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fotos_evento ADD COLUMN IF NOT EXISTS formato VARCHAR(30);

CREATE TABLE IF NOT EXISTS contratos_documentos (
  id TEXT PRIMARY KEY,
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  versao INTEGER NOT NULL,
  versao_template VARCHAR(80) NOT NULL,
  snapshot JSONB NOT NULL,
  snapshot_sha256 VARCHAR(64) NOT NULL,
  pdf_sha256 VARCHAR(64),
  arquivo VARCHAR(500),
  status VARCHAR(30) NOT NULL DEFAULT 'rascunho',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validado_em TIMESTAMP,
  invalidado_em TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS contratos_documentos_reserva_versao_idx
  ON contratos_documentos (reserva_id, versao);
CREATE INDEX IF NOT EXISTS contratos_documentos_status_idx
  ON contratos_documentos (status);

CREATE TABLE IF NOT EXISTS regras_convivencia_versoes (
  id TEXT PRIMARY KEY,
  versao VARCHAR(30) NOT NULL UNIQUE,
  titulo VARCHAR(255) NOT NULL,
  conteudo TEXT NOT NULL,
  conteudo_sha256 VARCHAR(64) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO regras_convivencia_versoes (id, versao, titulo, conteudo, conteudo_sha256, ativo)
VALUES (
  'regras-convivencia-2026-v1',
  '2026.1',
  'Regras de Convivência — Excursão das Comitivas',
  E'Mais que uma viagem, uma experiência inesquecível!\n\nPara que todos aproveitem cada momento da nossa excursão com segurança, respeito e alegria, contamos com a colaboração de cada integrante.\n\nJUNTOS, FAZEMOS DA NOSSA COMITIVA UMA FAMÍLIA!\n\n1. RESPEITO ACIMA DE TUDO\nRespeite todos os integrantes da comitiva, motoristas, equipe de apoio e a comunidade local. Gentileza gera bons momentos!\n\n2. LIMPEZA É RESPONSABILIDADE DE TODOS\nMantenha o ônibus e os locais que visitarmos sempre limpos. Use as lixeiras e não deixe sujeira ou objetos para trás.\n\n3. PONTUALIDADE\nRespeite os horários combinados. Atrasos podem prejudicar todo o grupo e nosso roteiro.\n\n4. CUIDE DOS SEUS PERTENCES\nA excursão não se responsabiliza por objetos pessoais. Fique atento e cuide dos seus pertences durante toda a viagem.\n\n5. BRIGAS E AGRESSÕES\nBrigas, agressões verbais e agressões físicas não serão toleradas em nenhuma hipótese. O respeito entre todos é indispensável durante toda a excursão.\n\n6. USO DE DROGAS É PROIBIDO\nÉ expressamente proibido o uso, porte ou circulação de drogas ilícitas durante toda a excursão. O descumprimento desta regra poderá acarretar desligamento imediato da comitiva.\n\n7. SOM E BARULHO\nNão é permitido som e barulho antes das 10hrs da manhã. O som só será permitido a partir das 10hrs da manhã, juntamente com a abertura do Open Bar. Após esse horário, mantenha o volume em nível adequado e respeite o descanso dos demais.\n\n8. BEBIDA COM RESPONSABILIDADE\nSe for consumir bebida alcoólica, faça isso com moderação. Nunca dirija após beber. Segurança sempre!\n\n9. CUIDE DO PRÓXIMO\nEsteja atento aos colegas da comitiva. Ajude quem precisar e informe a equipe sobre qualquer situação que demande atenção.\n\n10. NÃO É NÃO\nRespeite os limites e o espaço do outro. Qualquer atitude desrespeitosa não será tolerada.\n\n11. SIGA AS ORIENTAÇÕES DA EQUIPE\nNossa equipe está aqui para cuidar de tudo e de todos. Siga as orientações para que tudo ocorra da melhor forma.\n\nRespeito, união e alegria são o que tornam nossa comitiva única!',
  '5a5e5f931933be0c162a0d448feac7bcf732784dbefe844c077be3c1e4d72acf',
  true
)
ON CONFLICT (versao) DO NOTHING;

CREATE TABLE IF NOT EXISTS contrato_validacoes (
  id TEXT PRIMARY KEY,
  protocolo VARCHAR(80) NOT NULL UNIQUE,
  contrato_id TEXT NOT NULL REFERENCES contratos_documentos(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  versao INTEGER NOT NULL,
  snapshot_sha256 VARCHAR(64) NOT NULL,
  pdf_sha256 VARCHAR(64) NOT NULL,
  aceite_contrato BOOLEAN NOT NULL,
  aceite_regras BOOLEAN NOT NULL,
  regras_versao VARCHAR(30) NOT NULL,
  aviso_privacidade_versao VARCHAR(30) NOT NULL,
  canal VARCHAR(20) NOT NULL,
  destinatario_mascarado VARCHAR(255) NOT NULL,
  message_id VARCHAR(255),
  enviado_em TIMESTAMP,
  confirmado_em TIMESTAMP NOT NULL,
  servidor_utc TIMESTAMP NOT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  navegador VARCHAR(120),
  sistema_operacional VARCHAR(120),
  idioma VARCHAR(30),
  timezone VARCHAR(80),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  precisao_metros NUMERIC(10,2),
  geolocalizacao_consentida BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS contrato_validacoes_reserva_idx
  ON contrato_validacoes (reserva_id);

CREATE TABLE IF NOT EXISTS otp_desafios (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  contrato_id TEXT NOT NULL REFERENCES contratos_documentos(id),
  canal VARCHAR(20) NOT NULL,
  destinatario_mascarado VARCHAR(255) NOT NULL,
  segredo_hash VARCHAR(128) NOT NULL,
  expira_em TIMESTAMP NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  max_tentativas INTEGER NOT NULL DEFAULT 5,
  cooldown_ate TIMESTAMP NOT NULL,
  usado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS otp_desafios_lookup_idx
  ON otp_desafios (usuario_id, reserva_id, contrato_id, criado_em);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expira_em TIMESTAMP NOT NULL,
  usado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (usuario_id, criado_em);

CREATE TABLE IF NOT EXISTS pagamento_idempotencias (
  id TEXT PRIMARY KEY,
  chave VARCHAR(255) NOT NULL UNIQUE,
  operacao VARCHAR(80) NOT NULL,
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  pagamento_id TEXT REFERENCES pagamentos(id),
  resposta JSONB,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pagamento_parcelas (
  id TEXT PRIMARY KEY,
  pagamento_id TEXT NOT NULL REFERENCES pagamentos(id),
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  sequencia INTEGER NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  vencimento DATE NOT NULL,
  cora_id VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'pendente',
  boleto_url VARCHAR(500),
  pix_copia_e_cola TEXT,
  codigo_barras VARCHAR(255),
  linha_digitavel VARCHAR(255),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS pagamento_parcelas_reserva_sequencia_idx
  ON pagamento_parcelas (reserva_id, sequencia);

CREATE TABLE IF NOT EXISTS webhook_eventos (
  id TEXT PRIMARY KEY,
  provedor VARCHAR(30) NOT NULL DEFAULT 'cora',
  evento_id VARCHAR(255) NOT NULL UNIQUE,
  tipo VARCHAR(120) NOT NULL,
  recurso_id VARCHAR(255),
  payload JSONB NOT NULL,
  processado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS descontos_administrativos (
  id TEXT PRIMARY KEY,
  reserva_id TEXT NOT NULL REFERENCES reservas(id),
  administrador_id TEXT NOT NULL REFERENCES usuarios(id),
  motivo TEXT NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  valor_informado DECIMAL(12,2) NOT NULL,
  subtotal_original DECIMAL(12,2) NOT NULL,
  valor_desconto DECIMAL(12,2) NOT NULL,
  total_final DECIMAL(12,2) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS descontos_administrativos_reserva_idx
  ON descontos_administrativos (reserva_id);

CREATE TABLE IF NOT EXISTS videos_evento (
  id TEXT PRIMARY KEY,
  evento_id TEXT NOT NULL REFERENCES eventos(id),
  url VARCHAR(500) NOT NULL,
  youtube_id VARCHAR(80) NOT NULL,
  titulo VARCHAR(255),
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  destaque BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS videos_evento_evento_idx
  ON videos_evento (evento_id, ativo, ordem);
