# Proxy, IP e Cloudflare/Coolify

A topologia esperada é Cloudflare → Traefik/Coolify → Express. O processo não usa `trust proxy=true`; usa uma lista explícita em `TRUSTED_PROXY_IPS`, inicialmente limitada a loopback no exemplo. O operador deve preencher somente os hops reais sob controle, bloquear acesso direto à origem no firewall e validar IPv4, IPv6 e spoofing de `X-Forwarded-For`/`CF-Connecting-IP`.

O rate limit de login, OTP e webhook fica por cliente identificado pelo Express somente depois que a cadeia de proxy autorizada estiver configurada. O IP armazenado é normalizado, limitado a 45 caracteres e acompanhado de User-Agent mínimo. Se a topologia ainda não estiver confirmada, o sistema prefere identificar o proxy imediato a confiar em cabeçalho arbitrário.
