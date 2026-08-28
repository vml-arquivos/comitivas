export type StatusConteudo = 'rascunho' | 'aprovado' | 'revogado';

export interface ConteudoVersionado {
  id: string;
  versao: string;
  vigencia_inicio: string;
  status_aprovacao: StatusConteudo;
  aprovado_por: string | null;
  sha256: string;
  modulos_condicionais: string[];
}
