const conectivos = new Set(["da", "das", "de", "do", "dos", "e"]);

export function iniciaisPessoa(nome: unknown): string {
  const partes = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "?";
  const relevantes = partes.filter((parte) => !conectivos.has(parte.toLocaleLowerCase("pt-BR")));
  const nomes = relevantes.length > 0 ? relevantes : partes;
  if (nomes.length === 1) return nomes[0].slice(0, 2).toLocaleUpperCase("pt-BR");
  return `${nomes[0][0]}${nomes[nomes.length - 1][0]}`.toLocaleUpperCase("pt-BR");
}
