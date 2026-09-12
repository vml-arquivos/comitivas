import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function ler(caminho: string) {
  return readFile(`${root}/${caminho}`, 'utf8');
}

describe('cadastro e direcionamento automático de hospedagem', () => {
  it('exige sexo e endereço estruturado no cadastro público', async () => {
    const auth = await ler('server/routes/auth.ts');
    const cadastro = await ler('apps/web/src/pages/Cadastro.tsx');
    const dados = await ler('apps/web/src/pages/cliente/DadosCadastrais.tsx');

    expect(auth).toContain('sexo: usuarios.sexo');
    expect(auth).toContain('cep: usuarios.cep');
    expect(auth).toContain('logradouro: usuarios.logradouro');
    expect(auth).toContain('normalizarSexo');
    expect(cadastro).toContain('buscarEnderecoPorCep');
    expect(cadastro).toContain('name="sexo"');
    expect(cadastro).toContain('name="cep"');
    expect(dados).toContain('buscarEnderecoPorCep');
    expect(dados).toContain('name="sexo"');
  });

  it('não oferece ao comprador a escolha manual do grupo do quarto', async () => {
    const configurador = await ler('apps/web/src/pages/cliente/ConfiguradorPacote.tsx');
    const pacoteService = await ler('server/services/pacoteService.ts');

    expect(configurador).not.toContain('Escolha o grupo do quarto');
    expect(configurador).not.toContain('grupoHospedagem');
    expect(configurador).toContain('Sexo da pessoa');
    expect(pacoteService).toContain('cadastroResponsavel');
    expect(pacoteService).toContain('Complete seu cadastro informando o sexo');
  });

  it('registra a migration forward-only com o mapeamento necessário', async () => {
    const migration = await ler('drizzle/0019_sexo_endereco_estruturado.sql');
    const journal = await ler('drizzle/meta/_journal.json');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "sexo"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "cep"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "logradouro"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "cidade"');
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN/);
    expect(journal).toContain('0019_sexo_endereco_estruturado');
  });

  it('aceita PDF e imagens no upload e oferece revisão antes do contrato', async () => {
    const cliente = await ler('server/routes/cliente.ts');
    const contratos = await ler('server/routes/contratos.ts');
    const checkout = await ler('apps/web/src/pages/cliente/Checkout.tsx');

    expect(cliente).toContain('"application/pdf", "image/*"');
    expect(contratos).toContain('cep: usuarios.cep');
    expect(checkout).toContain('Revisar e editar meus dados');
    expect(checkout).toContain('Pencil');
  });
});
