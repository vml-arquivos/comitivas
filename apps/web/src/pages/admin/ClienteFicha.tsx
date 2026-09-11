import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button, Card, CardContent, Input } from '@ui/index';
import { ArrowLeft, CalendarDays, ClipboardList, CreditCard, Download, Eye, FileDown, FileText, History, Mail, MapPin, Pencil, Phone, Plus, Printer, RefreshCw, ShieldCheck, Trash2, Upload, UserRound, Wallet } from 'lucide-react';

type Usuario = {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
  tipo: string;
  data_nascimento: string | null;
  endereco: string | null;
  ativo: boolean;
  cadastro_status: 'aprovado' | 'pendente' | 'rejeitado' | string;
  aprovado_em: string | null;
  aprovado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

type Reserva = {
  id: string;
  status: string | null;
  checkout_estado: string;
  valor_total: string;
  forma_pagamento: string | null;
  quantidade_parcelas: number | null;
  valor_parcela: string | null;
  contrato_pdf_url: string | null;
  contrato_disponivel: boolean;
  aceite_timestamp: string | null;
  criado_em: string;
  evento_nome: string;
  evento_local: string;
  lote_nome: string;
  data_inicio: string;
  data_fim: string;
  data_embarque: string | null;
  data_retorno: string | null;
  local_embarque: string | null;
  pacote_nome: string | null;
  modalidade_hospedagem: string | null;
  boleto_liberado_em: string | null;
  boleto_liberado_por: string | null;
  operacao: {
    saida_nome: string;
    data_partida: string | null;
    data_retorno: string | null;
    onibus_nome: string;
    onibus_identificacao: string | null;
    poltrona: number;
    ponto_embarque_nome: string | null;
    ponto_embarque_endereco: string | null;
    ponto_embarque_horario: string | null;
    checkin_status: string | null;
  } | null;
};

type Pagamento = {
  id: string;
  reserva_id: string;
  status: string | null;
  status_reconciliado: string;
  metodo: string;
  valor: string;
  valor_pago_centavos: number;
  gateway_id: string | null;
  criado_em: string;
  atualizado_em: string;
};

type Parcela = {
  id: string;
  pagamento_id: string;
  reserva_id: string;
  sequencia: number;
  valor: string;
  vencimento: string;
  status: string;
  valor_pago_centavos: number;
  boleto_documento_id: string | null;
  enviado_email_em: string | null;
  enviado_whatsapp_em: string | null;
  pago_confirmado_em: string | null;
  pago_confirmado_por: string | null;
  comprovante_documento_id: string | null;
  criado_em?: string;
  atualizado_em?: string;
};

type Contrato = {
  id: string;
  reserva_id: string;
  versao: number;
  versao_template: string;
  status: string;
  snapshot_sha256: string;
  pdf_sha256: string | null;
  regras_versao: string | null;
  visualizado_em: string | null;
  criado_em: string;
  validado_em: string | null;
  aprovado_admin_em: string | null;
  aprovado_admin_por: string | null;
  invalidado_em: string | null;
};

type Validacao = {
  id: string;
  protocolo: string;
  contrato_id: string;
  reserva_id: string;
  versao: number;
  canal: string;
  destinatario_mascarado: string;
  confirmado_em: string;
  navegador: string | null;
  sistema_operacional: string | null;
};

type Documento = {
  id: string;
  usuario_id: string;
  reserva_id: string | null;
  categoria: string;
  nome: string;
  nome_original: string;
  mime_type: string;
  tamanho_bytes: number;
  sha256: string;
  observacoes: string | null;
  criado_em: string;
};

type Historico = {
  id: string;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  criado_em: string;
  origem?: string;
  reserva_id?: string;
};

type Ficha = {
  usuario: Usuario;
  resumo: {
    reservas: number;
    reservas_confirmadas: number;
    contratos: number;
    documentos: number;
    valor_contratado: number;
    valor_pago: number;
    ultima_interacao_em: string;
  };
  reservas: Reserva[];
  pagamentos: Pagamento[];
  parcelas: Parcela[];
  contratos: Contrato[];
  validacoes: Validacao[];
  documentos: Documento[];
  historico: Historico[];
};

type Aba = 'geral' | 'reservas' | 'contratos' | 'pagamentos' | 'documentos' | 'historico';

const CATEGORIAS = [
  ['identidade', 'Documento de identidade'],
  ['cpf', 'CPF'],
  ['comprovante_residencia', 'Comprovante de residência'],
  ['autorizacao', 'Autorização / responsável'],
  ['boleto', 'Boleto bancário'],
  ['comprovante_pagamento', 'Comprovante de pagamento'],
  ['saude', 'Informação operacional / saúde'],
  ['outros', 'Outros'],
] as const;

const statusReserva: Record<string, string> = {
  visitante: 'Visitante',
  cadastrado: 'Cadastrado',
  pacote_montado: 'Pacote montado',
  checkout_iniciado: 'Checkout iniciado',
  aguardando_pagamento: 'Aguardando pagamento',
  contrato_gerado: 'Contrato gerado',
  cliente_confirmado: 'Cliente confirmado',
  abandonado: 'Abandonado',
};

const statusPagamento: Record<string, string> = {
  pendente: 'Pendente',
  processando: 'Processando',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
  quitado: 'Quitado',
  parcial: 'Parcial',
  falhou: 'Falhou',
};

const statusContrato: Record<string, string> = {
  rascunho: 'Rascunho',
  preparado: 'Preparado',
  aguardando_validacao: 'Aguardando cliente',
  validado: 'Validado pelo cliente',
  aguardando_aprovacao_admin: 'Aguardando conferência',
  aprovado_admin: 'Aprovado pela administração',
  invalidado: 'Invalidado',
};

const tipoHistorico: Record<string, string> = {
  cadastro: 'Cadastro',
  aprovacao_cadastro: 'Cadastro',
  reserva: 'Reserva',
  contrato: 'Contrato',
  pagamento: 'Pagamento',
  crm: 'Atendimento',
  comunicacao: 'Comunicação',
  documento: 'Documento',
  anotacao: 'Anotação',
  documento_visualizado: 'Documento',
  documento_baixado: 'Documento',
};

const formatarMoeda = (valor: number | string | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0));
const formatarData = (valor: string | null | undefined) => (valor ? new Date(valor).toLocaleDateString('pt-BR') : '—');
const formatarDataHora = (valor: string | null | undefined) => (valor ? new Date(valor).toLocaleString('pt-BR') : '—');
const formatarTamanho = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function Dado({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-gray-900">{value || '—'}</div>
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">{children}</div>;
}

export default function ClienteFicha() {
  const { clienteId } = useParams();
  const navigate = useNavigate();
  const { user: usuarioLogado } = useAuth();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [aba, setAba] = useState<Aba>('geral');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [categoria, setCategoria] = useState('identidade');
  const [nomeDocumento, setNomeDocumento] = useState('');
  const [observacoesDocumento, setObservacoesDocumento] = useState('');
  const [reservaDocumento, setReservaDocumento] = useState('');
  const [enviandoDocumento, setEnviandoDocumento] = useState(false);
  const [tituloNota, setTituloNota] = useState('Anotação administrativa');
  const [descricaoNota, setDescricaoNota] = useState('');
  const [salvandoNota, setSalvandoNota] = useState(false);

  const carregar = async () => {
    if (!clienteId) return;
    setCarregando(true);
    setErro(null);
    try {
      const response = await api.get(`/admin/clientes/${clienteId}/ficha`);
      setFicha(response.data);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar a ficha do cliente.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, [clienteId]);

  const pagamentosPorReserva = useMemo(() => {
    const mapa = new Map<string, Pagamento[]>();
    (ficha?.pagamentos || []).forEach((pagamento) => mapa.set(pagamento.reserva_id, [...(mapa.get(pagamento.reserva_id) || []), pagamento]));
    return mapa;
  }, [ficha?.pagamentos]);

  const abrirRelatorio = (imprimir = false) => {
    if (!clienteId) return;
    const janela = window.open(`/api/admin/clientes/${clienteId}/relatorio`, '_blank');
    if (imprimir && janela) janela.addEventListener('load', () => janela.print(), { once: true });
  };

  const exportarRelatorio = () => {
    if (!clienteId) return;
    window.open(`/api/admin/clientes/${clienteId}/relatorio?formato=csv`, '_blank', 'noopener,noreferrer');
  };

  const visualizarContrato = (reservaId: string, contratoId?: string) => window.open(`/api/contratos/download/${reservaId}?inline=1${contratoId ? `&contrato_id=${encodeURIComponent(contratoId)}` : ''}`, '_blank', 'noopener,noreferrer');
  const baixarContrato = (reservaId: string, contratoId?: string) => window.open(`/api/contratos/download/${reservaId}${contratoId ? `?contrato_id=${encodeURIComponent(contratoId)}` : ''}`, '_blank', 'noopener,noreferrer');
  const visualizarDocumento = (documentoId: string) => clienteId && window.open(`/api/admin/clientes/${clienteId}/documentos/${documentoId}?inline=1`, '_blank', 'noopener,noreferrer');
  const baixarDocumento = (documentoId: string) => clienteId && window.open(`/api/admin/clientes/${clienteId}/documentos/${documentoId}`, '_blank', 'noopener,noreferrer');

  const atualizarAprovacao = async (status: 'aprovado' | 'pendente' | 'rejeitado') => {
    if (!clienteId) return;
    const acao = status === 'aprovado' ? 'aprovar' : status === 'rejeitado' ? 'rejeitar' : 'retornar para análise';
    if (!confirm(`Confirma ${acao} o cadastro deste cliente?`)) return;
    setErro(null);
    try {
      await api.patch(`/admin/clientes/${clienteId}/aprovacao`, { status });
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível atualizar a aprovação do cadastro.');
    }
  };

  const alternarStatus = async () => {
    if (!clienteId || !ficha) return;
    const acao = ficha.usuario.ativo ? 'desativar' : 'reativar';
    if (!confirm(`Confirma ${acao} o acesso deste cliente?`)) return;
    try {
      await api.patch(`/admin/usuarios/${clienteId}/status`, {
        ativo: !ficha.usuario.ativo,
      });
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || `Não foi possível ${acao} o cliente.`);
    }
  };

  const excluirOuArquivar = async () => {
    if (!clienteId || !ficha) return;
    if (usuarioLogado?.tipo === 'dev') {
      const confirmacao = prompt(
        `EXCLUSÃO DEFINITIVA\n\nEsta ação apagará o cliente e todos os testes vinculados: reservas, contratos, pagamentos, documentos e lugares. Não pode ser desfeita.\n\nDigite o e-mail completo para confirmar:\n${ficha.usuario.email}`,
      );
      if (confirmacao === null) return;
      try {
        const response = await api.delete(`/admin/usuarios/${clienteId}/definitivo`, {
          data: { confirmacao },
        });
        alert(response.data.mensagem || 'Cliente excluído definitivamente.');
        navigate('/admin/clientes');
      } catch (err: any) {
        setErro(err.response?.data?.erro || 'Não foi possível excluir definitivamente. Nenhum dado foi removido.');
      }
      return;
    }

    if (!confirm('Excluir este cliente? Se houver registros, ele será arquivado para preservar o histórico.')) return;
    try {
      const response = await api.delete(`/admin/usuarios/${clienteId}`);
      alert(response.data.mensagem || 'Operação concluída.');
      navigate('/admin/clientes');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível excluir ou arquivar o cliente.');
    }
  };

  const enviarDocumento = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clienteId || !arquivo) return;
    setEnviandoDocumento(true);
    setErro(null);
    try {
      await api.post(`/admin/clientes/${clienteId}/documentos`, arquivo, {
        params: {
          categoria,
          nome: nomeDocumento.trim() || undefined,
          observacoes: observacoesDocumento.trim() || undefined,
          reserva_id: reservaDocumento || undefined,
        },
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(arquivo.name),
          'X-File-Mime': arquivo.type || '',
        },
      });
      setArquivo(null);
      setNomeDocumento('');
      setObservacoesDocumento('');
      setReservaDocumento('');
      const campo = document.getElementById('arquivo-cliente') as HTMLInputElement | null;
      if (campo) campo.value = '';
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível anexar o documento.');
    } finally {
      setEnviandoDocumento(false);
    }
  };

  const removerDocumento = async (documento: Documento) => {
    if (!clienteId || !confirm(`Remover o documento “${documento.nome}”? O arquivo deixará de ficar disponível na ficha.`)) return;
    try {
      await api.delete(`/admin/clientes/${clienteId}/documentos/${documento.id}`);
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível remover o documento.');
    }
  };

  const salvarNota = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clienteId || !descricaoNota.trim()) return;
    setSalvandoNota(true);
    try {
      await api.post(`/admin/clientes/${clienteId}/historico`, {
        titulo: tituloNota.trim(),
        descricao: descricaoNota.trim(),
      });
      setDescricaoNota('');
      await carregar();
      setAba('historico');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível registrar a anotação.');
    } finally {
      setSalvandoNota(false);
    }
  };

  if (carregando) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">Carregando ficha completa do cliente...</div>;
  if (!ficha)
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate('/admin/clientes')}>
          <ArrowLeft size={16} className="mr-2" />
          Voltar
        </Button>
        <div className="rounded-lg bg-red-50 p-4 text-red-700">{erro || 'Cliente não encontrado.'}</div>
      </div>
    );

  const { usuario, resumo } = ficha;
  const aprovacaoCompleta = usuario.cadastro_status === 'aprovado' && Boolean(usuario.aprovado_em && usuario.aprovado_por);
  const iniciais = usuario.nome
    .split(/\s+/)
    .slice(0, 2)
    .map((nome) => nome[0])
    .join('')
    .toUpperCase();
  const validacaoPorContrato = new Map(ficha.validacoes.map((item) => [item.contrato_id, item]));

  const abas: Array<{ id: Aba; label: string; Icone: typeof UserRound }> = [
    { id: 'geral', label: 'Visão geral', Icone: UserRound },
    { id: 'reservas', label: 'Reservas e viagens', Icone: CalendarDays },
    { id: 'contratos', label: 'Contratos', Icone: FileText },
    { id: 'pagamentos', label: 'Pagamentos', Icone: CreditCard },
    {
      id: 'documentos',
      label: `Documentos (${ficha.documentos.length})`,
      Icone: ClipboardList,
    },
    { id: 'historico', label: 'Histórico completo', Icone: History },
  ];

  return (
    <div className="admin-page pb-12">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <button onClick={() => navigate('/admin/clientes')} className="mt-2 rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50" aria-label="Voltar para clientes">
            <ArrowLeft size={18} />
          </button>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#073F50] text-xl font-bold text-white">{iniciais}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black tracking-tight text-[#073F50] sm:text-4xl">{usuario.nome}</h1>
              <span className={`admin-status ${usuario.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>{usuario.ativo ? 'Cliente ativo' : 'Cliente inativo'}</span>
              <span className={`admin-status ${aprovacaoCompleta ? 'bg-emerald-100 text-emerald-800' : usuario.cadastro_status === 'rejeitado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{aprovacaoCompleta ? 'Cadastro aprovado' : usuario.cadastro_status === 'aprovado' ? 'Aprovação sem registro' : usuario.cadastro_status === 'rejeitado' ? 'Cadastro rejeitado' : 'Aguardando aprovação'}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Ficha 360º · cliente desde {formatarData(usuario.criado_em)} · última atualização {formatarDataHora(usuario.atualizado_em)}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
              <a href={`mailto:${usuario.email}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                <Mail size={15} />
                {usuario.email}
              </a>
              {usuario.telefone && (
                <a href={`https://wa.me/55${usuario.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-primary">
                  <Phone size={15} />
                  {usuario.telefone}
                </a>
              )}
              {usuario.endereco && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={15} />
                  {usuario.endereco}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Link to={`/admin/clientes?editar=${usuario.id}`}>
            <Button variant="outline" className="gap-2">
              <Pencil size={16} />
              Editar cadastro
            </Button>
          </Link>
          <Button variant="outline" className="gap-2" onClick={() => abrirRelatorio(true)}>
            <Printer size={16} />
            Imprimir ficha
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportarRelatorio}>
            <FileDown size={16} />
            Relatório CSV
          </Button>
          {!aprovacaoCompleta && (
            <Button className="gap-2" onClick={() => void atualizarAprovacao('aprovado')}>
              <ShieldCheck size={16} />
              Aprovar cadastro
            </Button>
          )}
          {aprovacaoCompleta && (
            <Button variant="outline" className="gap-2" onClick={() => void atualizarAprovacao('pendente')}>
              Retornar para análise
            </Button>
          )}
          {usuario.cadastro_status !== 'rejeitado' && (
            <Button variant="outline" className="gap-2 !text-red-700" onClick={() => void atualizarAprovacao('rejeitado')}>
              Rejeitar cadastro
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => void alternarStatus()}>
            {usuario.ativo ? 'Desativar' : 'Ativar'}
          </Button>
          <Button variant="outline" className="gap-2 !text-red-700" onClick={() => void excluirOuArquivar()}>
            <Trash2 size={16} />
            {usuarioLogado?.tipo === 'dev' ? 'Excluir definitivamente' : 'Excluir'}
          </Button>
          <Link to="/admin/boletos">
            <Button variant="outline" className="gap-2">
              <Wallet size={16} />
              Central de boletos
            </Button>
          </Link>
          <Button variant="outline" className="gap-2" onClick={() => void carregar()}>
            <RefreshCw size={16} />
            Atualizar
          </Button>
        </div>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}

      <div className="admin-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reservas</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{resumo.reservas}</p>
            <p className="mt-1 text-xs text-gray-500">{resumo.reservas_confirmadas} confirmada(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contratos</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{resumo.contratos}</p>
            <p className="mt-1 text-xs text-gray-500">Versões registradas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Documentos</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{resumo.documentos}</p>
            <p className="mt-1 text-xs text-gray-500">Arquivos ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contratado</p>
            <p className="mt-2 text-xl font-bold text-gray-900">{formatarMoeda(resumo.valor_contratado)}</p>
            <p className="mt-1 text-xs text-gray-500">Histórico de reservas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pago</p>
            <p className="mt-2 text-xl font-bold text-emerald-700">{formatarMoeda(resumo.valor_pago)}</p>
            <p className="mt-1 text-xs text-gray-500">Total confirmado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Última movimentação</p>
            <p className="mt-2 text-sm font-bold text-gray-900">{formatarDataHora(resumo.ultima_interacao_em)}</p>
            <p className="mt-1 text-xs text-gray-500">Última atividade</p>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
        <div className="flex min-w-max gap-1">
          {abas.map(({ id, label, Icone }) => (
            <button key={id} onClick={() => setAba(id)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${aba === id ? 'bg-[#DF6248] text-white shadow-sm' : 'text-gray-600 hover:bg-[#fff0eb] hover:text-[#C94F38]'}`}>
              <Icone size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'geral' && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Cadastro</p>
                  <h2 className="text-xl font-bold text-gray-900">Dados pessoais e operacionais</h2>
                </div>
                <UserRound className="text-gray-300" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Dado label="Nome completo" value={usuario.nome} />
                <Dado label="Status do cadastro" value={aprovacaoCompleta ? `Aprovado em ${formatarDataHora(usuario.aprovado_em)}` : usuario.cadastro_status === 'aprovado' ? 'Aprovação sem registro — nova aprovação necessária' : usuario.cadastro_status === 'rejeitado' ? 'Rejeitado' : 'Aguardando análise administrativa'} />
                <Dado label="CPF" value={usuario.cpf} />
                <Dado label="Data de nascimento" value={formatarData(usuario.data_nascimento)} />
                <Dado label="Telefone / WhatsApp" value={usuario.telefone} />
                <Dado label="E-mail" value={usuario.email} />
                <Dado label="Endereço" value={usuario.endereco} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Movimentação</p>
                  <h2 className="text-xl font-bold text-gray-900">Últimos registros</h2>
                </div>
                <History className="text-gray-300" />
              </div>
              <div className="space-y-4">
                {ficha.historico.slice(0, 8).map((item) => (
                  <div key={item.id} className="relative border-l-2 border-gray-200 pl-4">
                    <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <p className="text-sm font-semibold text-gray-900">{item.titulo}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatarDataHora(item.criado_em)} · {tipoHistorico[item.tipo] || item.tipo}
                    </p>
                    {item.descricao && <p className="mt-1 text-sm text-gray-600">{item.descricao}</p>}
                  </div>
                ))}
                {ficha.historico.length === 0 && <Vazio>Sem movimentações registradas.</Vazio>}
              </div>
              <button onClick={() => setAba('historico')} className="mt-5 text-sm font-semibold text-primary hover:underline">
                Abrir histórico completo →
              </button>
            </CardContent>
          </Card>
        </div>
      )}

      {aba === 'reservas' && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-gray-200 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Viagens</p>
              <h2 className="text-xl font-bold text-gray-900">Reservas, pacotes e embarques</h2>
            </div>
            {ficha.reservas.length === 0 ? (
              <div className="p-6">
                <Vazio>Este cliente ainda não possui reservas.</Vazio>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {ficha.reservas.map((reserva) => (
                  <div key={reserva.id} className="p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900">{reserva.evento_nome}</h3>
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{statusReserva[reserva.status || ''] || reserva.status}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {reserva.lote_nome}
                          {reserva.pacote_nome ? ` · ${reserva.pacote_nome}` : ''}
                        </p>
                        <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                          <span>
                            <CalendarDays size={14} className="mr-1 inline" />
                            {formatarData(reserva.data_inicio)} a {formatarData(reserva.data_fim)}
                          </span>
                          <span>
                            <MapPin size={14} className="mr-1 inline" />
                            {reserva.evento_local}
                          </span>
                          {reserva.data_embarque && <span>Embarque: {formatarDataHora(reserva.data_embarque)}</span>}
                          {reserva.local_embarque && <span>{reserva.local_embarque}</span>}
                          {reserva.operacao && (
                            <>
                              <span>
                                Transporte: {reserva.operacao.onibus_nome}
                                {reserva.operacao.onibus_identificacao ? ` · ${reserva.operacao.onibus_identificacao}` : ''}
                              </span>
                              <span>Lugar: {reserva.operacao.poltrona}</span>
                              <span>Embarque: {reserva.operacao.ponto_embarque_nome || 'a definir'}</span>
                              <span>Situação do embarque: {reserva.operacao.checkin_status === 'presente' ? 'Confirmado' : reserva.operacao.checkin_status === 'ausente' ? 'Ausente' : 'Pendente'}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="min-w-48 rounded-xl bg-gray-50 p-4 text-right">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Valor da reserva</p>
                        <p className="mt-1 text-xl font-bold text-gray-900">{formatarMoeda(reserva.valor_total)}</p>
                        <p className="mt-1 text-xs text-gray-500">{reserva.forma_pagamento ? `${reserva.forma_pagamento.toUpperCase()}${reserva.quantidade_parcelas && reserva.quantidade_parcelas > 1 ? ` · ${reserva.quantidade_parcelas}x` : ''}` : 'Pagamento não definido'}</p>
                        {reserva.forma_pagamento === 'boleto' && <p className={`mt-2 text-xs font-semibold ${reserva.boleto_liberado_em ? 'text-emerald-700' : 'text-amber-700'}`}>{reserva.boleto_liberado_em ? `Boleto liberado em ${formatarDataHora(reserva.boleto_liberado_em)}` : 'Boleto aguardando liberação administrativa'}</p>}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link to={`/admin/contratos`}>
                        <Button size="sm" variant="outline">
                          Abrir contratos
                        </Button>
                      </Link>
                      {(reserva.contrato_disponivel || reserva.contrato_pdf_url) && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => visualizarContrato(reserva.id)}>
                            <Eye size={14} className="mr-1" />
                            Visualizar contrato
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => baixarContrato(reserva.id)}>
                            <Download size={14} className="mr-1" />
                            Baixar contrato
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {aba === 'contratos' && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-gray-200 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Jurídico</p>
              <h2 className="text-xl font-bold text-gray-900">Contratos e evidências eletrônicas</h2>
            </div>
            {ficha.contratos.length === 0 ? (
              <div className="p-6">
                <Vazio>Nenhum contrato registrado para este cliente.</Vazio>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-6 py-4">Reserva</th>
                      <th className="px-6 py-4">Versão</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Validação</th>
                      <th className="px-6 py-4">Protocolo</th>
                      <th className="px-6 py-4">Hash</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {ficha.contratos.map((contrato) => {
                      const validacao = validacaoPorContrato.get(contrato.id);
                      return (
                        <tr key={contrato.id}>
                          <td className="px-6 py-4 font-mono text-xs">{contrato.reserva_id.slice(0, 12)}…</td>
                          <td className="px-6 py-4">
                            v{contrato.versao}
                            <div className="text-xs text-gray-500">{contrato.versao_template}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium">{statusContrato[contrato.status] || contrato.status}</span>
                          </td>
                          <td className="px-6 py-4">
                            {validacao ? (
                              <>
                                <div className="font-medium text-emerald-700">Validado pelo cliente</div>
                                <div className="text-xs text-gray-500">
                                  {formatarDataHora(validacao.confirmado_em)} · {validacao.canal}
                                </div>
                                <div className={`mt-1 text-xs font-semibold ${contrato.aprovado_admin_em ? 'text-emerald-700' : 'text-amber-700'}`}>{contrato.aprovado_admin_em ? `Conferido pela administração em ${formatarDataHora(contrato.aprovado_admin_em)}` : 'Aguardando conferência administrativa'}</div>
                              </>
                            ) : (
                              <span className="text-gray-400">Sem validação</span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs">{validacao?.protocolo || '—'}</td>
                          <td className="max-w-44 truncate px-6 py-4 font-mono text-[11px] text-gray-500" title={contrato.pdf_sha256 || contrato.snapshot_sha256}>
                            {contrato.pdf_sha256 || contrato.snapshot_sha256}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right">
                            {contrato.pdf_sha256 ? (
                              <>
                                <button onClick={() => visualizarContrato(contrato.reserva_id, contrato.id)} className="mr-2 rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-primary" title="Visualizar">
                                  <Eye size={17} />
                                </button>
                                <button onClick={() => baixarContrato(contrato.reserva_id, contrato.id)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-primary" title="Baixar">
                                  <Download size={17} />
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">PDF após validação</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {aba === 'pagamentos' && (
        <div className="space-y-5">
          <Card>
            <CardContent className="p-0">
              <div className="border-b border-gray-200 p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Financeiro</p>
                <h2 className="text-xl font-bold text-gray-900">Pagamentos</h2>
              </div>
              {ficha.pagamentos.length === 0 ? (
                <div className="p-6">
                  <Vazio>Nenhum pagamento registrado.</Vazio>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-6 py-4">Reserva</th>
                        <th className="px-6 py-4">Método</th>
                        <th className="px-6 py-4">Valor</th>
                        <th className="px-6 py-4">Pago</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Atualização</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ficha.pagamentos.map((pagamento) => (
                        <tr key={pagamento.id}>
                          <td className="px-6 py-4 font-mono text-xs">{pagamento.reserva_id.slice(0, 12)}…</td>
                          <td className="px-6 py-4 uppercase">{pagamento.metodo}</td>
                          <td className="px-6 py-4 font-medium">{formatarMoeda(pagamento.valor)}</td>
                          <td className="px-6 py-4 font-medium text-emerald-700">{formatarMoeda(pagamento.valor_pago_centavos / 100)}</td>
                          <td className="px-6 py-4">
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{statusPagamento[pagamento.status_reconciliado] || statusPagamento[pagamento.status || ''] || pagamento.status_reconciliado}</span>
                          </td>
                          <td className="px-6 py-4 text-gray-500">{formatarDataHora(pagamento.atualizado_em)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          {ficha.parcelas.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900">
                  <Wallet size={18} className="text-primary" />
                  Parcelas registradas
                </h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ficha.parcelas.map((parcela) => (
                    <div key={parcela.id} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-gray-500">Parcela {parcela.sequencia}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{statusPagamento[parcela.status] || parcela.status}</span>
                      </div>
                      <p className="mt-2 text-lg font-bold text-gray-900">{formatarMoeda(parcela.valor)}</p>
                      <p className="mt-1 text-sm text-gray-500">Vencimento: {formatarData(parcela.vencimento)}</p>
                      <p className="mt-1 text-sm text-emerald-700">Pago: {formatarMoeda(parcela.valor_pago_centavos / 100)}</p>
                      {parcela.enviado_email_em && <p className="mt-2 text-xs text-gray-500">E-mail enviado: {formatarDataHora(parcela.enviado_email_em)}</p>}
                      {parcela.enviado_whatsapp_em && <p className="mt-1 text-xs text-gray-500">WhatsApp registrado: {formatarDataHora(parcela.enviado_whatsapp_em)}</p>}
                      {parcela.pago_confirmado_em && <p className="mt-1 text-xs font-semibold text-emerald-700">Pagamento confirmado: {formatarDataHora(parcela.pago_confirmado_em)}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {parcela.boleto_documento_id && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => visualizarDocumento(parcela.boleto_documento_id!)}>
                              <Eye size={14} className="mr-1" />
                              Boleto
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => baixarDocumento(parcela.boleto_documento_id!)}>
                              <Download size={14} className="mr-1" />
                              Baixar
                            </Button>
                          </>
                        )}
                        {parcela.comprovante_documento_id && (
                          <Button size="sm" variant="outline" onClick={() => visualizarDocumento(parcela.comprovante_documento_id!)}>
                            <FileText size={14} className="mr-1" />
                            Comprovante
                          </Button>
                        )}
                        <Link to="/admin/boletos">
                          <Button size="sm" variant="outline">
                            Gerenciar
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {aba === 'documentos' && (
        <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Acervo documental</p>
                <h2 className="text-xl font-bold text-gray-900">Adicionar documento</h2>
                <p className="mt-1 text-sm text-gray-500">PDF, JPG, PNG ou WEBP, até 12 MB. O arquivo é armazenado no volume persistente e registrado com SHA-256.</p>
              </div>
              <form onSubmit={enviarDocumento} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Categoria</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
                    {CATEGORIAS.map(([valor, label]) => (
                      <option key={valor} value={valor}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input label="Nome para exibição" value={nomeDocumento} onChange={(e) => setNomeDocumento(e.target.value)} placeholder="Ex.: documento de identificação com foto" />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Vincular a uma reserva (opcional)</label>
                  <select value={reservaDocumento} onChange={(e) => setReservaDocumento(e.target.value)} className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
                    <option value="">Documento geral do cliente</option>
                    {ficha.reservas.map((reserva) => (
                      <option key={reserva.id} value={reserva.id}>
                        {reserva.evento_nome} · {reserva.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="arquivo-cliente" className="mb-1 block text-sm font-medium text-gray-700">
                    Arquivo
                  </label>
                  <input id="arquivo-cliente" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setArquivo(e.target.files?.[0] || null)} className="block w-full rounded-md border border-gray-300 bg-white p-2 text-sm" required />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
                  <textarea value={observacoesDocumento} onChange={(e) => setObservacoesDocumento(e.target.value)} rows={3} className="w-full rounded-md border border-gray-300 p-3 text-sm" placeholder="Opcional: validade, origem ou observação operacional" />
                </div>
                <Button type="submit" disabled={!arquivo || enviandoDocumento} className="w-full gap-2">
                  {enviandoDocumento ? (
                    'Enviando...'
                  ) : (
                    <>
                      <Upload size={16} />
                      Anexar à ficha
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <div className="border-b border-gray-200 p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Documentação</p>
                <h2 className="text-xl font-bold text-gray-900">Arquivos do cliente</h2>
              </div>
              {ficha.documentos.length === 0 ? (
                <div className="p-6">
                  <Vazio>Nenhum documento adicional anexado.</Vazio>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {ficha.documentos.map((documento) => (
                    <div key={documento.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <FileText size={19} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{documento.nome}</p>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{CATEGORIAS.find(([valor]) => valor === documento.categoria)?.[1] || documento.categoria}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-gray-500">
                            {documento.nome_original} · {formatarTamanho(documento.tamanho_bytes)} · {formatarDataHora(documento.criado_em)}
                          </p>
                          <p className="mt-1 max-w-xl truncate font-mono text-[10px] text-gray-400" title={documento.sha256}>
                            SHA-256 {documento.sha256}
                          </p>
                          {documento.observacoes && <p className="mt-1 text-sm text-gray-600">{documento.observacoes}</p>}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => visualizarDocumento(documento.id)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-primary" title="Visualizar">
                          <Eye size={17} />
                        </button>
                        <button onClick={() => baixarDocumento(documento.id)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-primary" title="Baixar">
                          <Download size={17} />
                        </button>
                        <button onClick={() => void removerDocumento(documento)} className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" title="Remover">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {aba === 'historico' && (
        <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Registro administrativo</p>
                <h2 className="text-xl font-bold text-gray-900">Adicionar anotação</h2>
                <p className="mt-1 text-sm text-gray-500">Use para registrar contatos, ocorrências, preferências ou decisões operacionais. A anotação entra na linha do tempo da ficha.</p>
              </div>
              <form onSubmit={salvarNota} className="space-y-4">
                <Input label="Título" value={tituloNota} onChange={(e) => setTituloNota(e.target.value)} maxLength={255} />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
                  <textarea value={descricaoNota} onChange={(e) => setDescricaoNota(e.target.value)} rows={5} maxLength={5000} className="w-full rounded-md border border-gray-300 p-3 text-sm" placeholder="Descreva o contato ou ocorrência com objetividade." required />
                </div>
                <Button type="submit" disabled={salvandoNota || !descricaoNota.trim()} className="w-full gap-2">
                  {salvandoNota ? (
                    'Salvando...'
                  ) : (
                    <>
                      <Plus size={16} />
                      Registrar no histórico
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Linha do tempo</p>
                  <h2 className="text-xl font-bold text-gray-900">Histórico completo do cliente</h2>
                </div>
                <ShieldCheck className="text-gray-300" />
              </div>
              <div className="space-y-5">
                {ficha.historico.map((item) => (
                  <div key={item.id} className="relative border-l-2 border-gray-200 pl-5">
                    <span className="absolute -left-[6px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary shadow" />
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">{item.titulo}</p>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500">{tipoHistorico[item.tipo] || item.tipo}</span>
                        </div>
                        {item.descricao && <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.descricao}</p>}
                        {item.reserva_id && <p className="mt-1 font-mono text-[10px] text-gray-400">Reserva {item.reserva_id}</p>}
                      </div>
                      <time className="shrink-0 text-xs text-gray-400">{formatarDataHora(item.criado_em)}</time>
                    </div>
                  </div>
                ))}
                {ficha.historico.length === 0 && <Vazio>Sem histórico registrado.</Vazio>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
