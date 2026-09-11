# Entrega final - Excursão das Comitivas

Data da validação: 24/07/2026

## Resultado

O projeto foi finalizado com jornada pública sem login obrigatório, persistência da escolha até o cadastro, captação real de leads, CRM sem dados fictícios, gestão das três modalidades, cadastro contratual, área do cliente, contrato e voucher, WhatsApp oficial, identidade otimizada, SEO e galeria pública.

Os valores comerciais ficam fora das páginas públicas de marketing. Eles aparecem somente no configurador aberto pelo visitante, depois do clique em uma oferta, e no fluxo autenticado de contratação.

## Banco de dados

As migrations `0000` a `0004` foram aplicadas em uma instância PostgreSQL isolada para validação. O teste preservou registros legados e confirmou:

- `usuarios.rg`
- `usuarios.data_nascimento`
- `usuarios.estado_civil`
- `usuarios.profissao`
- `usuarios.endereco`
- `usuarios.nacionalidade`
- `pacotes.modalidade_hospedagem`
- `pacotes.disponibilidade`
- vínculo de pacote na reserva
- campos do CRM e condições de pagamento
- constraints das modalidades e da disponibilidade

O banco indicado na documentação de produção não foi alterado porque a rede do ambiente de execução não conseguiu resolver o host externo (`EAI_AGAIN`). No container do Coolify, a aplicação executa as migrations idempotentes durante a inicialização. Para aplicar e conferir manualmente:

```bash
npm run db:migrate
npm run db:verify-contract-fields
```

O segundo comando agora falha explicitamente se alguma coluna esperada estiver ausente.

## Validação dos três contratos

O teste ponta a ponta criou evento, lote, cliente, reservas, aceite, condição de pagamento e PDF reais para as três modalidades:

```text
Camping
☒ CAMPING   ☐ QUARTO COM VENTILADOR
☐ QUARTO COM AR-CONDICIONADO
R$ 1.900,00 - PIX com 5%: R$ 1.805,00

Quarto com ventilador
☐ CAMPING   ☒ QUARTO COM VENTILADOR
☐ QUARTO COM AR-CONDICIONADO
R$ 2.200,00 - boleto em 2x de R$ 1.100,00

Quarto com ar-condicionado
☐ CAMPING   ☐ QUARTO COM VENTILADOR
☒ QUARTO COM AR-CONDICIONADO
R$ 2.600,00 - cartão em 12 parcelas
```

Os três PDFs têm quatro páginas A4. As 12 páginas foram renderizadas e inspecionadas visualmente. A revisão confirmou:

- logo oficial comprimida no cabeçalho;
- ausência da marca antiga no contrato;
- dados oficiais da contratada;
- marcação correta e exclusiva em cada modalidade;
- valores e condições coerentes;
- rodapé oficial apenas na última página;
- texto legível, sem cortes ou sobreposições.

Os PDFs de exemplo e a imagem comparativa estão na pasta `validacao/contratos` do pacote final.

## Validações técnicas

```text
npm run build
  servidor: sucesso
  frontend React/Vite/TypeScript: sucesso

npm test -- --run
  2 arquivos de teste aprovados
  8 testes aprovados

node --import tsx scripts/e2e-fluxo-completo.mts
  status: ok
  3 modalidades aprovadas
  3 PDFs válidos gerados
```

## Variáveis de ambiente

Configurar no Coolify antes do redeploy:

```env
VITE_WHATSAPP_NUMERO=5561994459086
ENABLE_TEST_ADMIN=false
PAYMENT_GATEWAY=mercadopago
MERCADOPAGO_ACCESS_TOKEN=PREENCHA_COM_O_TOKEN_REAL
JWT_SECRET=GERE_UMA_CHAVE_FORTE
DATABASE_URL=preencher_com_o_postgresql_real
WEB_URL=https://comitivas.permupay.com.br
API_URL=https://comitivas.permupay.com.br
```

`VITE_WHATSAPP_NUMERO` é incorporada no build do frontend; qualquer alteração exige novo deploy. O número oficial já é usado como fallback normalizado: `5561994459086`.

O usuário administrativo de teste conhecido não é mais criado automaticamente. Ele só existe quando `ENABLE_TEST_ADMIN=true`, valor reservado ao teste isolado.

## Commits locais

```text
ec5a9ef feat: aprimorar gestão, documentos e segurança
8aed296 feat: concluir identidade, SEO e galeria pública
aadb6d4 feat: criar jornada pública de alta conversão e CRM real
32cfbc6 chore: importar base validada do projeto
```

Um commit adicional registra este relatório e os ajustes finais de produção.

## Publicação

O arquivo recebido não continha metadados Git e a conexão GitHub disponível não localizou `vml-arquivos/comitivas`; por isso não foi possível fazer `push` nem acionar o redeploy do Coolify neste ambiente.

Após disponibilizar o repositório remoto:

```bash
git remote add origin <URL_DO_REPOSITORIO>
git push -u origin main
```

No Coolify:

1. confirme as variáveis acima;
2. execute o redeploy da branch `main`;
3. confira no log `Migrations Drizzle aplicadas com sucesso`;
4. abra o terminal do container e rode `npm run db:verify-contract-fields`;
5. valide `/api/health`, a Home, `/eventos`, `/galeria`, o cadastro e uma reserva de homologação.
