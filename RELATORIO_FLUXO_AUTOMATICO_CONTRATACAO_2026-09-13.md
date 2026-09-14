# Fluxo automático de contratação — 13/09/2026

Base: comitivas-main (17), HEAD de origem 94b76df.

Implementado:
- pacote de quarto legado com `contrato_modelo=auto` e `forma_contratacao=hospedagem` é normalizado para `onibus_hospedagem`;
- novos pacotes de quarto usam transporte + hospedagem por padrão;
- upload de documento é obrigatório, mas OCR/análise não bloqueia o contrato;
- cadastro é aprovado automaticamente após e-mail confirmado, dados essenciais, documento enviado e OTP contratual;
- contrato validado por OTP não aguarda aprovação administrativa;
- boleto manual segue diretamente para preparação operacional;
- telas administrativas deixam de pedir clique de aprovação de cadastro/contrato;
- contratos históricos assinados permanecem imutáveis; se o conteúdo histórico estiver errado, deve ser emitida nova versão e novo OTP.

A migration 0021 é forward-only e roda pelo `initializeDatabase()` no startup.
