import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@ui/index';
import {
  BadgeDollarSign,
  Calculator,
  CheckCircle2,
  FileSignature,
  Globe2,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  UserPlus,
  WalletCards,
} from 'lucide-react';

type Cliente = {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
};

type Evento = { id: string; nome: string; local: string; ativo: boolean };
type Lote = {
  id: string;
  evento_id: string;
  nome: string;
  vagas_disponíveis: number;
  valor_base: string;
  ativo: boolean;
};
type Pacote = {
  id: string;
  lote_id: string;
  nome: string;
  descricao: string | null;
  valor_total: string;
  modalidade_hospedagem: string | null;
  disponibilidade: string | null;
  ativo: boolean;
};
type Item = {
  id: string;
  nome: string;
  descricao: string | null;
  valor: string;
  tipo: string;
  ativo: boolean;
};
type Venda = {
  id: string;
  lote_id: string;
  pacote_id: string | null;
  status: string;
  checkout_estado: string;
  valor_total: string;
  valor_total_centavos?: number | null;
  cliente_nome: string;
  cliente_email: string;
  vendedor_nome: string | null;
  evento_nome: string;
  lote_nome: string;
  pacote_nome: string | null;
  criado_em: string;
  origem_tipo: 'interna' | 'site' | 'nao_identificada';
  origem_comercial?: string | null;
  pagamento: {
    status: string;
    status_reconciliado: string;
    metodo: string;
    valor_centavos?: number | null;
    valor_pago_centavos?: number | null;
  } | null;
  contrato: {
    status: string;
    versao: number;
    validado_em?: string | null;
    aprovado_admin_em?: string | null;
  } | null;
};
type Vendedor = { id: string; nome: string; email: string };
type ResumoVendas = {
  total: number;
  ativas: number;
  abandonadas: number;
  internas: number;
  site: number;
  origem_nao_identificada: number;
  receita_centavos: number;
  recebido_centavos: number;
  a_receber_centavos: number;
  contratos_firmados: number;
};

type Props = {
  modoInicial?: 'geral' | 'interna';
};

const dinheiro = (valor: number | string | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0));
const dinheiroCentavos = (valor: number | undefined) => dinheiro(Number(valor || 0) / 100);
const dataCurta = (valor: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(valor));

const statusLabel: Record<string, string> = {
  pacote_montado: 'Pacote montado',
  checkout_iniciado: 'Checkout iniciado',
  aguardando_pagamento: 'Aguardando pagamento',
  contrato_gerado: 'Contrato gerado',
  cliente_confirmado: 'Confirmado',
  abandonado: 'Abandonado',
};

const statusPagamento: Record<string, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  confirmado: 'Confirmado',
  parcial: 'Parcial',
  falhou: 'Falhou',
  cancelado: 'Cancelado',
};

const FORM_CLIENTE = {
  nome: '',
  email: '',
  cpf: '',
  telefone: '',
  data_nascimento: '',
  endereco: '',
  senha: '',
};

function origemLabel(venda: Venda) {
  if (venda.origem_tipo === 'interna') return 'Venda interna';
  if (venda.origem_tipo === 'site') return 'Site';
  return 'Origem não registrada';
}

function contratoLabel(venda: Venda) {
  if (!venda.contrato) return 'Sem contrato';
  if (venda.contrato.status === 'aprovado_admin') return 'Contrato aprovado';
  if (venda.contrato.validado_em || venda.contrato.status === 'validado') return 'Contrato validado';
  return 'Contrato pendente';
}

export default function Vendas({ modoInicial = 'geral' }: Props) {
  const { user } = useAuth();
  const podeVerGeral = user?.tipo === 'admin' || user?.tipo === 'dev';
  const mostrarGeral = modoInicial === 'geral' && podeVerGeral;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [formCliente, setFormCliente] = useState(FORM_CLIENTE);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [pacoteId, setPacoteId] = useState('');
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [cupom, setCupom] = useState('');
  const [calculo, setCalculo] = useState<any>(null);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [resumo, setResumo] = useState<ResumoVendas>({
    total: 0,
    ativas: 0,
    abandonadas: 0,
    internas: 0,
    site: 0,
    origem_nao_identificada: 0,
    receita_centavos: 0,
    recebido_centavos: 0,
    a_receber_centavos: 0,
    contratos_firmados: 0,
  });
  const [filtroOrigem, setFiltroOrigem] = useState<'todas' | 'site' | 'interna' | 'nao_identificada'>('todas');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [buscaVenda, setBuscaVenda] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarVendas = async () => {
    const response = await api.get('/admin/vendas/reservas');
    setVendas(response.data.reservas || []);
    if (response.data.resumo) setResumo(response.data.resumo);
  };

  useEffect(() => {
    const iniciar = async () => {
      setCarregando(true);
      try {
        const [eventosResponse, vendedoresResponse] = await Promise.all([
          api.get('/eventos'),
          podeVerGeral ? api.get('/admin/usuarios?tipo=vendedor&limite=100') : Promise.resolve({ data: { usuarios: [] } }),
        ]);
        setEventos((eventosResponse.data.eventos || []).filter((item: Evento) => item.ativo));
        setVendedores((vendedoresResponse.data.usuarios || []).map((item: Vendedor) => ({ id: item.id, nome: item.nome, email: item.email })));
        await carregarVendas();
      } catch (err: any) {
        setErro(err.response?.data?.erro || 'Não foi possível carregar as vendas.');
      } finally {
        setCarregando(false);
      }
    };
    void iniciar();
  }, [user?.tipo]);

  const vendasFiltradas = useMemo(() => {
    const termo = buscaVenda.trim().toLocaleLowerCase('pt-BR');
    return vendas.filter((venda) => {
      if (filtroOrigem !== 'todas' && venda.origem_tipo !== filtroOrigem) return false;
      if (filtroStatus && venda.status !== filtroStatus) return false;
      if (!termo) return true;
      return [venda.cliente_nome, venda.cliente_email, venda.evento_nome, venda.lote_nome, venda.pacote_nome || '', venda.vendedor_nome || '']
        .some((valor) => valor.toLocaleLowerCase('pt-BR').includes(termo));
    });
  }, [vendas, filtroOrigem, filtroStatus, buscaVenda]);

  const vendasInternas = useMemo(() => vendas.filter((venda) => venda.origem_tipo === 'interna'), [vendas]);

  const buscarClientes = async () => {
    try {
      const response = await api.get('/admin/vendas/clientes', { params: { busca: buscaCliente.trim(), limite: 20 } });
      setClientes(response.data.clientes || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível buscar clientes.');
    }
  };

  const selecionarEvento = async (id: string) => {
    setEventoId(id);
    setLoteId('');
    setPacoteId('');
    setCalculo(null);
    if (!id) {
      setLotes([]);
      return;
    }
    try {
      const response = await api.get(`/lotes/evento/${id}`);
      setLotes(response.data.lotes || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar os lotes.');
    }
  };

  const selecionarLote = async (id: string) => {
    setLoteId(id);
    setPacoteId('');
    setCalculo(null);
    if (!id) {
      setPacotes([]);
      setItens([]);
      return;
    }
    try {
      const [pacotesResponse, itensResponse] = await Promise.all([
        api.get(`/pacotes/lotes/${id}/pacotes`),
        api.get(`/pacotes/lotes/${id}/itens`),
      ]);
      setPacotes(pacotesResponse.data.pacotes || []);
      setItens(itensResponse.data.itens || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar modalidades e adicionais.');
    }
  };

  const payload = useMemo(() => ({
    usuario_id: cliente?.id,
    vendedor_id: vendedorId || undefined,
    lote_id: loteId,
    pacote_id: pacoteId || undefined,
    cupom_codigo: cupom.trim() || undefined,
    itens: itens
      .filter((item) => (quantidades[item.id] || 0) > 0)
      .map((item) => ({
        id: item.id,
        nome: item.nome,
        tipo: item.tipo,
        valor: Number(item.valor),
        quantidade: quantidades[item.id],
      })),
  }), [cliente, vendedorId, loteId, pacoteId, cupom, itens, quantidades]);

  const calcular = async () => {
    setErro(null);
    setMensagem(null);
    if (!cliente || !loteId) {
      setErro('Selecione o cliente e o lote antes de calcular.');
      return;
    }
    setSalvando(true);
    try {
      const response = await api.post('/admin/vendas/calcular', payload);
      setCalculo(response.data);
    } catch (err: any) {
      setCalculo(null);
      setErro(err.response?.data?.erro || 'Não foi possível calcular esta venda.');
    } finally {
      setSalvando(false);
    }
  };

  const criarCliente = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro(null);
    setSenhaGerada(null);
    setSalvando(true);
    try {
      const response = await api.post('/admin/vendas/clientes', { ...formCliente, vendedor_id: vendedorId || undefined });
      const novo = response.data.usuario as Cliente;
      setCliente(novo);
      setClientes([novo]);
      setSenhaGerada(response.data.senha_gerada || null);
      setFormCliente(FORM_CLIENTE);
      setMostrarCadastro(false);
      setMensagem('Cliente criado e selecionado para a venda.');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível criar o cliente.');
    } finally {
      setSalvando(false);
    }
  };

  const reservar = async () => {
    setErro(null);
    setMensagem(null);
    if (!calculo) {
      setErro('Calcule o preço antes de reservar.');
      return;
    }
    setSalvando(true);
    try {
      const response = await api.post('/admin/vendas/reservar', payload);
      setMensagem(`${response.data.mensagem}. Reserva ${response.data.reserva_id} criada.`);
      setCalculo(null);
      await carregarVendas();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível registrar a venda.');
    } finally {
      setSalvando(false);
    }
  };

  const solicitarPosVenda = async (venda: Venda, tipo: 'cancelamento' | 'troca_pacote') => {
    let pacoteDestinoId: string | undefined;
    if (tipo === 'troca_pacote') {
      try {
        const response = await api.get(`/pacotes/lotes/${venda.lote_id}/pacotes`);
        const opcoes = (response.data.pacotes || []).filter((item: Pacote) => item.ativo && item.id !== venda.pacote_id);
        if (opcoes.length === 0) {
          setErro('Não existe outro pacote disponível nesta viagem.');
          return;
        }
        const escolha = window.prompt(`Escolha o novo pacote:\n${opcoes.map((item: Pacote, indice: number) => `${indice + 1}. ${item.nome} · ${dinheiro(item.valor_total)}`).join('\n')}`, '1');
        if (escolha === null) return;
        const indice = Number(escolha) - 1;
        if (!Number.isInteger(indice) || !opcoes[indice]) {
          setErro('Escolha uma opção válida de pacote.');
          return;
        }
        pacoteDestinoId = opcoes[indice].id;
      } catch (error: any) {
        setErro(error.response?.data?.erro || 'Não foi possível carregar os pacotes desta viagem.');
        return;
      }
    }
    const motivo = window.prompt(tipo === 'cancelamento' ? 'Motivo do cancelamento:' : 'Motivo da alteração do pacote:', '') || '';
    if (motivo.trim().length < 5) {
      setErro('Informe o motivo da solicitação.');
      return;
    }
    try {
      await api.post(`/solicitacoes/reservas/${venda.id}`, { tipo, motivo, pacote_destino_id: pacoteDestinoId });
      setMensagem('Solicitação registrada para análise.');
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível registrar a solicitação.');
    }
  };

  const eventoSelecionado = eventos.find((item) => item.id === eventoId);
  const loteSelecionado = lotes.find((item) => item.id === loteId);

  if (mostrarGeral) {
    return (
      <div className="admin-page">
        <div className="admin-page-header">
          <div>
            <p className="admin-eyebrow">Comercial e financeiro</p>
            <h1 className="admin-title">Vendas</h1>
            <p className="admin-subtitle">Acompanhe vendas do site e vendas internas, contratos, pagamentos e valores da operação.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/vendas/interna" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(133,31,50,.14)] transition hover:-translate-y-0.5 hover:bg-[#6f1929]"><Store size={16} className="mr-2" />Nova venda interna</Link>
            <Button type="button" variant="outline" onClick={() => void carregarVendas()}><RefreshCw size={16} className="mr-2" />Atualizar</Button>
          </div>
        </div>

        <div className="inline-flex w-full max-w-md rounded-2xl border border-[#182D3B]/10 bg-white p-1 shadow-sm">
          <Link to="/admin/vendas" className="flex-1 rounded-xl bg-[#073F50] px-4 py-2.5 text-center text-sm font-semibold text-white">Todas as vendas</Link>
          <Link to="/admin/vendas/interna" className="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-[#073F50] transition hover:bg-[#F8F5EF]">Vendas internas</Link>
        </div>

        {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
        {mensagem && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{mensagem}</div>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Vendas ativas', resumo.ativas, ShoppingCart],
            ['Receita em vendas', dinheiroCentavos(resumo.receita_centavos), BadgeDollarSign],
            ['Recebido', dinheiroCentavos(resumo.recebido_centavos), CheckCircle2],
            ['A receber', dinheiroCentavos(resumo.a_receber_centavos), WalletCards],
            ['Contratos firmados', resumo.contratos_firmados, FileSignature],
          ].map(([rotulo, valor, Icon]) => {
            const MetricIcon = Icon as typeof ShoppingCart;
            return (
              <div key={String(rotulo)} className="admin-metric-card">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500">{String(rotulo)}</p>
                  <MetricIcon size={17} className="text-[#DF6248]" />
                </div>
                <p className="mt-2 text-xl font-semibold text-[#073F50] xl:text-2xl">{String(valor)}</p>
              </div>
            );
          })}
        </div>

        <section className="admin-card p-5">
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={() => setFiltroOrigem('todas')} className={`rounded-full px-3 py-2 font-semibold ${filtroOrigem === 'todas' ? 'bg-[#073F50] text-white' : 'bg-slate-100 text-slate-600'}`}>Todas {resumo.total}</button>
            <button type="button" onClick={() => setFiltroOrigem('site')} className={`rounded-full px-3 py-2 font-semibold ${filtroOrigem === 'site' ? 'bg-[#073F50] text-white' : 'bg-slate-100 text-slate-600'}`}><Globe2 size={14} className="mr-1 inline" />Site {resumo.site}</button>
            <button type="button" onClick={() => setFiltroOrigem('interna')} className={`rounded-full px-3 py-2 font-semibold ${filtroOrigem === 'interna' ? 'bg-[#073F50] text-white' : 'bg-slate-100 text-slate-600'}`}><Store size={14} className="mr-1 inline" />Internas {resumo.internas}</button>
            {resumo.origem_nao_identificada > 0 && <button type="button" onClick={() => setFiltroOrigem('nao_identificada')} className={`rounded-full px-3 py-2 font-semibold ${filtroOrigem === 'nao_identificada' ? 'bg-[#073F50] text-white' : 'bg-slate-100 text-slate-600'}`}>Sem origem registrada {resumo.origem_nao_identificada}</button>}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input className="admin-field pl-10" value={buscaVenda} onChange={(event) => setBuscaVenda(event.target.value)} placeholder="Cliente, evento, pacote ou vendedor" />
            </div>
            <select className="admin-field" value={filtroStatus} onChange={(event) => setFiltroStatus(event.target.value)}>
              <option value="">Todos os status</option>
              {Object.entries(statusLabel).map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
            </select>
          </div>
        </section>

        <section className="admin-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-[#073F50]">Controle de vendas</h2>
              <p className="text-xs text-slate-500">{vendasFiltradas.length} registro(s) exibido(s)</p>
            </div>
          </div>
          {carregando ? (
            <p className="p-6 text-sm text-slate-500">Carregando vendas...</p>
          ) : vendasFiltradas.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Nenhuma venda encontrada com esses filtros.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {vendasFiltradas.map((venda) => (
                <article key={venda.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,1.25fr)_minmax(190px,.9fr)_minmax(190px,.9fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{venda.cliente_nome}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${venda.origem_tipo === 'interna' ? 'bg-orange-50 text-orange-700' : venda.origem_tipo === 'site' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>{origemLabel(venda)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{venda.evento_nome} · {venda.pacote_nome || venda.lote_nome}</p>
                    <p className="mt-1 text-xs text-slate-400">{dataCurta(venda.criado_em)}{venda.vendedor_nome ? ` · ${venda.vendedor_nome}` : ''}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.06em] text-slate-400">Venda</p>
                    <p className="mt-1 font-semibold text-[#073F50]">{dinheiro(venda.valor_total)}</p>
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{statusLabel[venda.status] || venda.status}</span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.06em] text-slate-400">Contrato e pagamento</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{contratoLabel(venda)}</p>
                    <p className="mt-1 text-xs text-slate-500">{venda.pagamento ? `${statusPagamento[venda.pagamento.status_reconciliado] || venda.pagamento.status_reconciliado} · ${dinheiroCentavos(venda.pagamento.valor_pago_centavos || 0)} recebido` : 'Sem pagamento registrado'}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Link className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#073F50] hover:border-[#DF6248]/40" to={`/admin/contratos?reserva=${encodeURIComponent(venda.id)}`}><FileSignature size={14} className="mr-1 inline" />Contrato</Link>
                    {venda.status !== 'abandonado' && <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#073F50]" onClick={() => void solicitarPosVenda(venda, 'troca_pacote')}>Alterar</button>}
                    {venda.status !== 'abandonado' && <button type="button" className="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-700" onClick={() => void solicitarPosVenda(venda, 'cancelamento')}>Cancelar</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Operação comercial</p>
          <h1 className="admin-title">Nova venda interna</h1>
          <p className="admin-subtitle">Selecione o cliente, escolha a viagem e registre a reserva. Contrato e pagamento seguem o fluxo normal do cliente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeVerGeral && <Link to="/admin/vendas" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#182D3B]/18 bg-white px-5 text-sm font-semibold text-gray-900 transition hover:border-primary/35 hover:bg-[#fffaf5]"><ShoppingCart size={16} className="mr-2" />Ver todas as vendas</Link>}
          <Button type="button" variant="outline" onClick={() => void carregarVendas()}><RefreshCw size={16} className="mr-2" />Atualizar</Button>
        </div>
      </div>

      <div className="inline-flex w-full max-w-md rounded-2xl border border-[#182D3B]/10 bg-white p-1 shadow-sm">
        {podeVerGeral && <Link to="/admin/vendas" className="flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-[#073F50] transition hover:bg-[#F8F5EF]">Todas as vendas</Link>}
        <Link to="/admin/vendas/interna" className="flex-1 rounded-xl bg-[#073F50] px-4 py-2.5 text-center text-sm font-semibold text-white">Vendas internas</Link>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      {mensagem && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="mr-2 inline" size={17} />{mensagem}
          {senhaGerada && <><br /><strong>Senha temporária:</strong> {senhaGerada}</>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart size={20} className="text-primary" />Composição da venda</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">1. Cliente</h2>
                <Button type="button" variant="outline" onClick={() => setMostrarCadastro((value) => !value)} className="flex items-center gap-2"><UserPlus size={16} />{mostrarCadastro ? 'Fechar cadastro' : 'Novo cliente'}</Button>
              </div>
              {!mostrarCadastro && (
                <form onSubmit={(event) => { event.preventDefault(); void buscarClientes(); }} className="flex gap-2">
                  <Input value={buscaCliente} onChange={(event) => setBuscaCliente(event.target.value)} placeholder="Nome, e-mail ou CPF" className="flex-1" />
                  <Button type="submit" variant="outline" className="flex items-center gap-2"><Search size={16} />Buscar</Button>
                </form>
              )}
              {mostrarCadastro && (
                <form onSubmit={criarCliente} className="grid grid-cols-1 gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 md:grid-cols-2">
                  <Input label="Nome completo" required value={formCliente.nome} onChange={(event) => setFormCliente((form) => ({ ...form, nome: event.target.value }))} />
                  <Input label="E-mail" required type="email" value={formCliente.email} onChange={(event) => setFormCliente((form) => ({ ...form, email: event.target.value }))} />
                  <Input label="CPF" required placeholder="Somente números" value={formCliente.cpf} onChange={(event) => setFormCliente((form) => ({ ...form, cpf: event.target.value }))} />
                  <Input label="Telefone / WhatsApp" required value={formCliente.telefone} onChange={(event) => setFormCliente((form) => ({ ...form, telefone: event.target.value }))} />
                  <Input label="Data de nascimento" required type="date" value={formCliente.data_nascimento} onChange={(event) => setFormCliente((form) => ({ ...form, data_nascimento: event.target.value }))} />
                  <Input label="Endereço completo" required value={formCliente.endereco} onChange={(event) => setFormCliente((form) => ({ ...form, endereco: event.target.value }))} />
                  <Input label="Senha (opcional)" type="password" value={formCliente.senha} onChange={(event) => setFormCliente((form) => ({ ...form, senha: event.target.value }))} />
                  <div className="flex items-end"><Button type="submit" disabled={salvando} className="w-full">{salvando ? 'Salvando...' : 'Cadastrar cliente'}</Button></div>
                </form>
              )}
              {!mostrarCadastro && clientes.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-gray-200 p-2">
                  {clientes.map((item) => (
                    <button type="button" key={item.id} onClick={() => setCliente(item)} className={`w-full rounded-lg border p-3 text-left transition ${cliente?.id === item.id ? 'border-primary bg-primary/5' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'}`}>
                      <span className="font-medium text-gray-900">{item.nome}</span>
                      <span className="block text-xs text-gray-500">{item.email} · CPF {item.cpf || 'não informado'}</span>
                    </button>
                  ))}
                </div>
              )}
              {cliente && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  <strong>Cliente selecionado:</strong> {cliente.nome} · {cliente.email}
                  <button type="button" onClick={() => { setCliente(null); setCalculo(null); }} className="ml-3 text-xs font-semibold underline">Trocar</button>
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-5 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Vendedor responsável</label>
                <select className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" value={vendedorId} onChange={(event) => setVendedorId(event.target.value)} disabled={user?.tipo === 'vendedor'}>
                  <option value="">Sem atribuição de vendedor</option>
                  {user?.tipo === 'vendedor' && <option value={user.id}>{user.nome} (você)</option>}
                  {podeVerGeral && vendedores.map((item) => <option key={item.id} value={item.id}>{item.nome} — {item.email}</option>)}
                </select>
              </div>
              <div className="flex items-end text-sm text-gray-500">A comissão segue a regra cadastrada para o vendedor.</div>
            </section>

            <section className="space-y-4 border-t border-gray-100 pt-5">
              <h2 className="font-semibold text-gray-900">2. Evento e pacote</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Excursão</label>
                  <select className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" value={eventoId} onChange={(event) => void selecionarEvento(event.target.value)}>
                    <option value="">Selecione uma excursão</option>
                    {eventos.map((item) => <option key={item.id} value={item.id}>{item.nome} — {item.local}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Lote / período</label>
                  <select className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" value={loteId} onChange={(event) => void selecionarLote(event.target.value)} disabled={!eventoId}>
                    <option value="">Selecione o lote</option>
                    {lotes.map((item) => <option key={item.id} value={item.id}>{item.nome} — {item.vagas_disponíveis} vagas</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Modalidade / pacote</label>
                <select className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" value={pacoteId} onChange={(event) => { setPacoteId(event.target.value); setCalculo(null); }} disabled={!loteId}>
                  <option value="">Usar valor-base do lote ({dinheiro(loteSelecionado?.valor_base)})</option>
                  {pacotes.filter((item) => item.ativo && item.disponibilidade !== 'esgotado').map((item) => <option key={item.id} value={item.id}>{item.nome} — {dinheiro(item.valor_total)}</option>)}
                </select>
              </div>
            </section>

            {itens.length > 0 && (
              <section className="space-y-3 border-t border-gray-100 pt-5">
                <h2 className="font-semibold text-gray-900">3. Adicionais</h2>
                {itens.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
                    <div><p className="font-medium text-gray-900">{item.nome}</p><p className="text-xs text-gray-500">{item.descricao || item.tipo} · {dinheiro(item.valor)}</p></div>
                    <Input type="number" min={0} max={10} value={quantidades[item.id] || 0} onChange={(event) => { setQuantidades((state) => ({ ...state, [item.id]: Math.max(0, Number(event.target.value) || 0) })); setCalculo(null); }} className="w-24" />
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-3 border-t border-gray-100 pt-5">
              <h2 className="font-semibold text-gray-900">4. Cupom</h2>
              <Input label="Código do cupom (opcional)" value={cupom} onChange={(event) => { setCupom(event.target.value); setCalculo(null); }} placeholder="Digite o cupom" />
              <p className="text-xs text-gray-500">O cupom será aplicado conforme as regras cadastradas.</p>
            </section>

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" disabled={salvando} onClick={() => void calcular()} className="flex items-center gap-2"><Calculator size={17} />Calcular preço</Button>
              <Button type="button" disabled={salvando || !calculo} onClick={() => void reservar()}>{salvando ? 'Processando...' : 'Reservar vaga e registrar venda'}</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Resumo da venda</CardTitle></CardHeader>
            <CardContent>
              {!calculo ? (
                <p className="text-sm text-gray-500">Calcule o preço para conferir os valores.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span>Base</span><strong>{dinheiro(calculo.valor_base)}</strong></div>
                  <div className="flex justify-between"><span>Adicionais</span><strong>{dinheiro(calculo.subtotal - calculo.valor_base)}</strong></div>
                  <div className="flex justify-between text-green-700"><span>Desconto</span><strong>- {dinheiro(calculo.desconto_cupom)}</strong></div>
                  <div className="border-t pt-3 text-lg font-bold"><div className="flex justify-between"><span>Total</span><span>{dinheiro(calculo.valor_total)}</span></div></div>
                  <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">A vaga fica reservada enquanto o cliente conclui contrato e pagamento.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Últimas vendas internas</CardTitle></CardHeader>
            <CardContent>
              {carregando ? (
                <p className="text-sm text-gray-500">Carregando...</p>
              ) : vendasInternas.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma venda interna registrada.</p>
              ) : (
                <div className="space-y-3">
                  {vendasInternas.slice(0, 8).map((venda) => (
                    <div key={venda.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">{venda.cliente_nome}</p>
                          <p className="text-xs text-gray-500">{venda.evento_nome} · {venda.pacote_nome || venda.lote_nome}</p>
                          {venda.vendedor_nome && <p className="mt-1 text-xs font-semibold text-primary">Vendedor: {venda.vendedor_nome}</p>}
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{statusLabel[venda.status] || venda.status}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                        <span>{dinheiro(venda.valor_total)}</span>
                        <div className="flex flex-wrap gap-2">
                          <Link className="font-semibold text-primary hover:underline" to={`/admin/contratos?reserva=${encodeURIComponent(venda.id)}`}><FileSignature size={14} className="mr-1 inline" />Contrato</Link>
                          {venda.status !== 'abandonado' && <button type="button" className="font-semibold text-primary hover:underline" onClick={() => void solicitarPosVenda(venda, 'troca_pacote')}>Alterar</button>}
                          {venda.status !== 'abandonado' && <button type="button" className="font-semibold text-red-700 hover:underline" onClick={() => void solicitarPosVenda(venda, 'cancelamento')}>Cancelar</button>}
                          <span>{venda.pagamento?.status_reconciliado || 'sem pagamento'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {eventoSelecionado && <p className="text-xs text-gray-400">Operando: {eventoSelecionado.nome}</p>}
    </div>
  );
}
