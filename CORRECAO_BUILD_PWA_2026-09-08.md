# Correção de build PWA — 08/09/2026

Corrigido erro TypeScript na página `Aplicativo.tsx` causado pelo ícone `SquarePlus`, inexistente na versão instalada de `lucide-react`.

Alteração aplicada:
- `SquarePlus` -> `Plus`

Atenção Coolify:
- `JWT_SECRET`, `OTP_PEPPER`, `SYSTEM_SECRETS_MASTER_KEY`, `DATABASE_URL`, `SMTP_PASS`, credenciais Cora e tokens WhatsApp devem ser somente Runtime, nunca Build Time.
- `VITE_WHATSAPP_NUMERO` é a única variável deste conjunto que precisa estar disponível no build do frontend.
- Como o log do deploy expôs `JWT_SECRET` como `ARG`, rotacione o valor e retire a opção Build Time antes do próximo deploy.
