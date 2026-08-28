# Fluxo de assinatura eletrônica — 2026.1

O cliente monta o pacote e o backend calcula o preço. A reserva recebe um hold de inventário e o contrato é preparado em uma versão imutável com snapshot canônico e hash SHA-256. A visualização pública autenticada recebe a versão persistida; não regenera o contrato a partir de dados atuais.

Após leitura, o cliente marca separadamente o aceite do contrato e das Regras de Convivência. O código de seis dígitos é enviado por e-mail como padrão ou por WhatsApp somente quando o provedor oficial, o número e o template configurado estiverem disponíveis. O desafio possui validade aproximada de dez minutos, limite de cinco tentativas, cooldown de sessenta segundos e uso único.

A confirmação trava o desafio e o documento em transação, registra protocolo, hash do snapshot, texto exato dos aceites, canal e destino mascarado, UTC do servidor, IP confiável, User-Agent, navegador, sistema operacional, idioma, timezone e geolocalização somente quando consentida. O PDF final é renderizado do mesmo snapshot e recebe uma página de certificado; o hash do PDF final é registrado separadamente.

A confirmação eletrônica não é anunciada como ICP-Brasil ou certificado digital. Se a Cora falhar depois da assinatura, o contrato continua validado e o checkout permite retomar apenas a cobrança pela mesma chave idempotente.
