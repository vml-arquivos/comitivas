-- Compras em grupo precisam de uma alocação física por participante.
-- A unicidade continua protegida na poltrona e na vaga do quarto; somente a
-- limitação antiga de uma alocação por reserva é removida.

DROP INDEX IF EXISTS assento_alocacoes_reserva_ativa_unico;
DROP INDEX IF EXISTS quarto_alocacoes_reserva_ativa_unica;

CREATE INDEX IF NOT EXISTS assento_alocacoes_reserva_ativa_idx
  ON assento_alocacoes (reserva_id, status)
  WHERE status = 'ativa';

CREATE INDEX IF NOT EXISTS quarto_alocacoes_reserva_ativa_idx
  ON quarto_alocacoes (reserva_id, status)
  WHERE status = 'ativa';
