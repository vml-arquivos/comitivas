#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

EXPECTED_HEAD = "07943e568df20e6197d09308ee1ebd18db0871c0"
EXPECTED_BLOBS = {
    "apps/web/src/pages/cliente/ConfiguradorPacote.tsx": "a5dcab50bcc98999cd54155bb2f075a0aecf8e87",
    "apps/web/src/pages/publico/Home.tsx": "27cd0bf27d926778c8072012f013c56fa58ebf30",
    "server/routes/publico.ts": "c686b40319851b22cc03355d51fb845635284918",
}

def run(*args: str, cwd: Path, check: bool = True) -> str:
    p = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip())
    return p.stdout.strip()

def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()

def main() -> int:
    script_dir = Path(__file__).resolve().parent
    repo = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
    payload = script_dir / "payload"
    if not (repo / ".git").exists():
        print("ERRO: execute dentro do clone Git ou informe o caminho do repositório.")
        return 2

    head = run("git", "rev-parse", "HEAD", cwd=repo)
    if head != EXPECTED_HEAD:
        print(f"ERRO: a atualização foi preparada para HEAD {EXPECTED_HEAD}, mas o repositório está em {head}.")
        print("Não foi feita nenhuma alteração. Atualize/reconcilie a base antes de aplicar.")
        return 3

    status = run("git", "status", "--porcelain", cwd=repo)
    if status:
        print("ERRO: o repositório possui alterações locais. Faça commit/stash antes de aplicar:")
        print(status)
        return 4

    for rel, esperado in EXPECTED_BLOBS.items():
        alvo = repo / rel
        if not alvo.exists():
            print(f"ERRO: arquivo esperado não encontrado: {rel}")
            return 5
        atual = git_blob_sha(alvo)
        if atual != esperado:
            print(f"ERRO: {rel} divergiu da versão auditada. Esperado {esperado}, encontrado {atual}.")
            return 6

    backup = repo / ".backup-fluxo-simplificado-2026-10-08"
    if backup.exists():
        shutil.rmtree(backup)
    for rel in EXPECTED_BLOBS:
        origem = repo / rel
        destino = backup / rel
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origem, destino)

    # Frontend completo: estes dois arquivos foram reconstruídos exatamente sobre a main auditada.
    for rel in [
        "apps/web/src/pages/cliente/ConfiguradorPacote.tsx",
        "apps/web/src/pages/publico/Home.tsx",
        "tests/uxFluxoPacoteSimplificado.spec.ts",
    ]:
        origem = payload / rel
        destino = repo / rel
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origem, destino)

    # Backend: alteração mínima e idempotente, sem substituir o arquivo inteiro.
    publico = repo / "server/routes/publico.ts"
    texto = publico.read_text(encoding="utf-8")
    if "function boletoParcelasPublicas" not in texto:
        needle = "const router = Router();\n"
        if needle not in texto:
            raise RuntimeError("Não foi encontrado o ponto seguro para inserir boletoParcelasPublicas.")
        texto = texto.replace(needle, needle + '''\nfunction boletoParcelasPublicas(configuracao: unknown): number | null {\n  if (!configuracao || typeof configuracao !== "object") return null;\n  const valor = Number((configuracao as Record<string, unknown>).boleto_parcelas_maximo);\n  return Number.isInteger(valor) && valor > 1 ? valor : null;\n}\n''', 1)

    if "configuracao_pagamento: pacotes.configuracao_pagamento" not in texto:
        needle = "            destaque_texto: pacotes.destaque_texto,\n"
        if needle not in texto:
            raise RuntimeError("Não foi encontrado o select público de pacotes esperado.")
        texto = texto.replace(needle, needle + "            configuracao_pagamento: pacotes.configuracao_pagamento,\n", 1)

    if "boleto_parcelas_maximo: boletoParcelasPublicas(configuracaoPagamento)" not in texto:
        marker = "          const comercialPublicoBase = statusComercialPublico("
        pos = texto.find(marker)
        if pos < 0:
            raise RuntimeError("Não foi encontrado comercialPublicoBase na rota pública.")
        ret = texto.find("          return {\n            ...modalidade,", pos)
        if ret < 0:
            raise RuntimeError("Não foi encontrado o retorno público da modalidade no formato esperado.")
        texto = texto[:ret] + "          const { configuracao_pagamento: configuracaoPagamento, ...modalidadePublica } = modalidade;\n" + texto[ret:]
        texto = texto.replace(
            "          return {\n            ...modalidade,\n",
            "          return {\n            ...modalidadePublica,\n            boleto_parcelas_maximo: boletoParcelasPublicas(configuracaoPagamento),\n",
            1,
        )

    publico.write_text(texto, encoding="utf-8")

    # Evita que o backup local entre no commit.
    exclude = repo / ".git" / "info" / "exclude"
    exclude.parent.mkdir(parents=True, exist_ok=True)
    atual_exclude = exclude.read_text(encoding="utf-8") if exclude.exists() else ""
    regra = ".backup-fluxo-simplificado-2026-10-08/"
    if regra not in atual_exclude:
        exclude.write_text(atual_exclude + ("\n" if atual_exclude and not atual_exclude.endswith("\n") else "") + regra + "\n", encoding="utf-8")

    run("git", "diff", "--check", cwd=repo)
    print("ATUALIZAÇÃO APLICADA COM SUCESSO.")
    print("Arquivos de runtime alterados:")
    print(" - apps/web/src/pages/cliente/ConfiguradorPacote.tsx")
    print(" - apps/web/src/pages/publico/Home.tsx")
    print(" - server/routes/publico.ts")
    print(" - tests/uxFluxoPacoteSimplificado.spec.ts")
    print("\nAgora execute: npm ci && npm run typecheck:server && npm test -- --run && npm run build")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERRO: {exc}")
        raise SystemExit(10)
