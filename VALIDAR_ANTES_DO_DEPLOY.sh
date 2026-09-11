#!/usr/bin/env bash
set -euo pipefail

echo '[1/8] npm ci'
npm ci

echo '[2/8] typecheck server'
npm run typecheck:server

echo '[3/8] lint frontend'
npm run lint

echo '[4/8] unit tests'
npm test -- --run

echo '[5/8] integration tests'
npm run test:integration

echo '[6/8] build completo'
npm run build

echo '[7/8] verificar migrations/campos contratuais'
npm run db:verify-contract-fields

echo '[8/8] E2E completo (requer ambiente de homologação configurado)'
npm run test:e2e

echo 'VALIDAÇÃO CONCLUÍDA'
