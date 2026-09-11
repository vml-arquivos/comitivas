# Modelo de ameaças — release 2026.1

| Ativo | Ameaça | Controle |
| --- | --- | --- |
| Contrato e evidências | Alteração entre preview e aceite | Snapshot imutável, hash, versão e certificado |
| OTP | Brute force, replay ou corrida | HMAC, expiração, cooldown, limite, lock transacional e uso único |
| Pagamento | Duplicata, webhook falso ou invoice filha | UUID idempotente, HMAC, consulta mTLS, outbox de eventos e reconciliação pai/filha |
| Vagas | Oversell por concorrência | Hold transacional, expiração e conversão atômica |
| Sessão | Token antigo após reset | `session_version` no JWT e validação no middleware |
| Arquivos | Download horizontal ou path traversal | Autorização por reserva e confinamento em `STORAGE_PATH` |
| Mídia | XSS/SSRF ou iframe invasivo | ID do YouTube validado, `youtube-nocookie`, click-to-load e storage controlado |
| Logs | Exposição de segredo ou CPF/OTP | Redação, destino mascarado e nenhum segredo versionado |

A revisão não implementa fingerprint invasivo, IMEI, MAC, biometria ou geolocalização obrigatória.
