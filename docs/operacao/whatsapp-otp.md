# WhatsApp OTP

WhatsApp só pode ser oferecido quando `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, a versão da API e o template oficial aprovado estiverem configurados. A ausência de qualquer requisito mantém o e-mail como canal obrigatório e não exibe promessa de WhatsApp automático.

O template deve ser aprovado no idioma correto e o provedor pode gerar custos ou rejeitar mensagens. Toda tentativa registra somente provedor, status, `message_id`, horário e destino mascarado. O código puro nunca é salvo ou impresso. Falhas tornam o desafio não utilizável e permitem solicitar novo código após o cooldown.
