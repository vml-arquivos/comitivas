# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package.json (raiz + workspace do frontend)
COPY package*.json ./
COPY apps/web/package.json ./apps/web/package.json

# Instalar dependências com timeout aumentado
RUN npm ci --audit=false --fund=false --prefer-offline --no-audit

# Copiar código
COPY . .

# Build
RUN npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Instalar apenas dependências de produção
COPY package*.json ./
RUN npm ci --only=production --audit=false --fund=false --prefer-offline --no-audit

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist

# Copiar assets
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/src/assets ./apps/web/src/assets

# Criar diretório de uploads
RUN mkdir -p uploads

# wget necessário para o healthcheck (mais leve/rápido que subir um novo processo Node a cada checagem)
RUN apk add --no-cache wget

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Iniciar aplicação
CMD ["node", "dist/index.js"]
