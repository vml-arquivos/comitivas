const obrigatorias = [
  'CORA_CLIENT_ID',
  'CORA_CERT_PATH',
  'CORA_PRIVATE_KEY_PATH',
  'CORA_TOKEN_URL',
  'CORA_API_BASE_URL',
  'CORA_INSTALLMENTS_API_BASE_URL',
];
const faltantes = obrigatorias.filter((nome) => !process.env[nome]);
if (process.env.CORA_ENV !== 'stage') faltantes.push('CORA_ENV=stage');
if (faltantes.length) {
  console.error(`CORA_STAGE_BLOCKED: configuração ausente ou ambiente incorreto: ${faltantes.join(', ')}`);
  process.exit(2);
}
console.error('CORA_STAGE_BLOCKED: o ensaio real exige credenciais Stage mTLS e uma reserva de homologação autorizada; o script não cria cobrança automaticamente.');
process.exit(2);
