export interface EnderecoPorCep {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoPorCep> {
  const cepNormalizado = String(cep || '').replace(/\D/g, '');
  if (cepNormalizado.length !== 8) throw new Error('Informe um CEP válido com 8 dígitos.');

  const response = await fetch(`https://viacep.com.br/ws/${cepNormalizado}/json/`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Não foi possível consultar o CEP agora.');
  const dados = await response.json() as EnderecoPorCep;
  if (dados.erro) throw new Error('CEP não encontrado. Confira os números informados.');

  return {
    cep: dados.cep || cepNormalizado,
    logradouro: dados.logradouro || '',
    bairro: dados.bairro || '',
    cidade: dados.localidade || dados.cidade || '',
    estado: dados.uf || dados.estado || '',
  };
}

export function formatarCep(valor: string): string {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}
