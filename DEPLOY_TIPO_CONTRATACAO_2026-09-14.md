# Deploy — seleção do tipo de contratação

## 1. Base esperada

Antes de substituir os arquivos, a `main` deve conter ao menos o commit de produção:

`1601bc55d9183ed899d2208f87eebdcd14af475f`

Se houver commit posterior, compare antes de substituir para não sobrescrever trabalho novo.

## 2. Substituição

Descompacte o ZIP completo sobre o clone local, preservando a pasta `.git`.

## 3. Validação local obrigatória

```bash
git status
git diff --check
npm ci
npm run typecheck:server
npm test -- --run
npm run build
```

Se qualquer etapa crítica falhar, não faça o redeploy.

## 4. Commit

Sugestão:

```bash
git add .
git commit -m "fix: selecionar tipo de contratacao no pacote"
git push origin main
```

## 5. Coolify

- confirmar repositório `vml-arquivos/comitivas`;
- branch `main`;
- confirmar o novo SHA;
- manter volume persistente de uploads;
- fazer backup do PostgreSQL antes do deploy;
- redeploy do último commit.

A migration `0021_fluxo_automatico_contratacao.sql` é forward-only e será aplicada pelo startup já existente.

## 6. Configuração comercial no Admin

Em **Excursões / Pacotes**, cada preço deve ser publicado com o tipo correto:

- **Transporte + hospedagem** → `onibus_hospedagem`
- **Somente hospedagem** → `hospedagem`
- **Somente transporte** → `onibus`

Se um tipo não tiver preço/pacote publicado, ele ficará visível mas indisponível para o cliente. Isso é intencional e evita cobrar preço incorreto.

## 7. Smoke test

1. abrir a página de montagem de pacote;
2. confirmar os três tipos de contratação;
3. escolher **Transporte + hospedagem** e verificar que só aparecem pacotes desse tipo;
4. escolher **Somente hospedagem** e verificar o filtro;
5. escolher **Somente transporte** e verificar o filtro;
6. conferir que o resumo mostra o tipo escolhido;
7. continuar para checkout e conferir novamente o tipo;
8. gerar contrato e confirmar cláusulas compatíveis com o escopo;
9. validar por OTP;
10. confirmar o fluxo automático de cadastro/venda e preparação de boleto;
11. verificar ônibus/poltrona apenas quando transporte estiver contratado;
12. verificar hospedagem/quarto apenas quando hospedagem estiver contratada.

## 8. Rollback

Se necessário, reverta o commit novo e redeploye o SHA anterior. Não apague banco, contratos, pagamentos ou uploads.
