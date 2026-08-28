# SMTP e e-mail transacional

O e-mail é o canal obrigatório padrão para OTP. O envio não pode retornar sucesso falso: sem `SMTP_HOST`, credenciais ou remetente verificado, o desafio é marcado como falho e a confirmação fica bloqueada. A assinatura concluída entra na outbox transacional com chave idempotente, template/version, destinatário mascarado, tentativas, próxima tentativa, erro e anexos.

O domínio de envio deve possuir SPF, DKIM e DMARC alinhados ao remetente configurado. O worker integrado ao scheduler aplica backoff exponencial e não imprime senha, token, OTP ou payload integral. O contrato e o certificado somente são anexados quando o caminho estiver dentro de `STORAGE_PATH` e existir.

Checklist operacional: confirmar host e porta, TLS/STARTTLS, remetente verificado, SPF, DKIM, DMARC, caixa de teste, recebimento do OTP, recebimento de contrato e reprocessamento seguro de uma mensagem falha.
