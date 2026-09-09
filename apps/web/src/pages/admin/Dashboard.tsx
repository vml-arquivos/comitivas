import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BusFront, CheckCircle2, CircleDollarSign, Clock3, FileText, RefreshCw, Ticket, UserPlus, Users, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';

type DashboardData = {
  resumo: Record<string, number | string>;
  financeiro: { contratado_centavos: number; recebido_centavos: number; a_receber_centavos: number; vencido_centavos: number; parcelas_vencidas: number };
  contratos: { total: number; aguardando_cliente: number; aguardando_admin: number; aprovados: number };
  reservas_status: Record<string, number>;
  operacao: { saidas: number; onibus: number; capacidade: number; ocupadas: number; bloqueadas: number; em_hold: number; livres: number; presentes: number; divergencias: number };
  alertas: Record<string, number>;
  filtros: { eventos: Array<{ id: string; nome: string }>; evento_id: string | null };
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabel: Record<string, string> = { visitante: 'Iniciadas', cadastrado: 'Cadastradas', pacote_montado: 'Pacote escolhido', checkout_iniciado: 'Em contratação', aguardando_pagamento: 'Aguardando pagamento', contrato_gerado: 'Contrato gerado', cliente_confirmado: 'Confirmadas', abandonado: 'Interrompidas' };

function Stat({ titulo, valor, icon: Icon, cor }: { titulo: string; valor: string | number; icon: LucideIcon; cor: string }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><div className={`rounded-full bg-gray-100 p-3 ${cor}`}><Icon size={22} /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p><p className="mt-1 text-2xl font-bold text-secondary">{valor}</p></div></CardContent></Card>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [eventoId, setEventoId] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = async (filtro = eventoId) => {
    setCarregando(true); setErro('');
    try { const resposta = await api.get('/admin/dashboard', { params: filtro ? { evento_id: filtro } : {} }); setData(resposta.data); }
    catch (error: any) { setErro(error.response?.data?.erro || 'Erro ao carregar o dashboard.'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(''); }, []);

  const resumo = data?.resumo || {};
  const totalReservas = Number(resumo.total_reservas || 0);
  const alertas = Object.entries(data?.alertas || {}).filter(([, total]) => Number(total) > 0);
  const alertaLabel: Record<string, string> = { cadastros_sem_reserva: 'cadastros ainda sem reserva', aprovacoes_inconsistentes: 'cadastros aprovados com registro incompleto', contratos_aguardando_cliente: 'contratos aguardando o cliente', contratos_aguardando_admin: 'contratos aguardando aprovação administrativa', parcelas_vencidas: 'parcelas vencidas', divergencias_capacidade: 'saídas com diferença entre vagas comerciais e físicas' };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Visão geral</p><h1 className="text-3xl font-bold text-secondary">Dashboard operacional</h1><p className="mt-1 text-sm text-gray-600">Vendas, contratos, recebimentos e capacidade com a mesma base de dados.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Filtrar por viagem" value={eventoId} onChange={(e) => { setEventoId(e.target.value); void carregar(e.target.value); }} className="h-11 rounded-full border border-gray-300 bg-white px-4 text-sm"><option value="">Todas as viagens</option>{data?.filtros.eventos.map((evento) => <option key={evento.id} value={evento.id}>{evento.nome}</option>)}</select><Button variant="outline" onClick={() => void carregar()}><RefreshCw size={16} className="mr-2" />Atualizar</Button></div></div>
    {erro && <div className="rounded-xl bg-red-50 p-4 text-red-700">{erro}</div>}
    {carregando && !data && <p className="text-sm text-gray-500">Carregando indicadores...</p>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat titulo="Clientes" valor={resumo.total_clientes || 0} icon={UserPlus} cor="text-sky-600" />
      <Stat titulo="Contatos comerciais" valor={resumo.total_leads_crm || 0} icon={Users} cor="text-rose-600" />
      <Stat titulo="Reservas" valor={totalReservas} icon={Ticket} cor="text-purple-600" />
      <Stat titulo="Confirmadas" valor={resumo.reservas_confirmadas || 0} icon={CheckCircle2} cor="text-emerald-600" />
      <Stat titulo="Contratos vigentes" valor={data?.contratos.total || 0} icon={FileText} cor="text-indigo-600" />
      <Stat titulo="Conversão" valor={`${resumo.taxa_conversao || 0}%`} icon={CircleDollarSign} cor="text-primary" />
      <Stat titulo="Recebido" valor={moeda.format((data?.financeiro.recebido_centavos || 0) / 100)} icon={WalletCards} cor="text-emerald-700" />
      <Stat titulo="A receber" valor={moeda.format((data?.financeiro.a_receber_centavos || 0) / 100)} icon={Clock3} cor="text-amber-700" />
    </div>

    <div className="grid gap-6 xl:grid-cols-3">
      <Card><CardHeader><CardTitle>Situação das reservas</CardTitle></CardHeader><CardContent className="space-y-3">{Object.entries(data?.reservas_status || {}).filter(([, total]) => total > 0).map(([status, total]) => <div key={status}><div className="flex justify-between text-sm"><span className="text-gray-600">{statusLabel[status] || status}</span><strong>{total}</strong></div><div className="mt-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-primary" style={{ width: `${totalReservas ? Math.max(3, (total / totalReservas) * 100) : 0}%` }} /></div></div>)}{totalReservas === 0 && <p className="text-sm text-gray-500">Nenhuma reserva no período.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Contratos</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{[
        ['Aguardando cliente', data?.contratos.aguardando_cliente || 0], ['Aguardando admin', data?.contratos.aguardando_admin || 0], ['Aprovados', data?.contratos.aprovados || 0], ['Total vigente', data?.contratos.total || 0],
      ].map(([rotulo, valor]) => <div key={String(rotulo)} className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{rotulo}</p><p className="mt-1 text-xl font-bold text-secondary">{valor}</p></div>)}<Link to="/admin/contratos" className="col-span-2 text-sm font-semibold text-primary">Abrir contratos →</Link></CardContent></Card>
      <Card><CardHeader><CardTitle>Financeiro</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-gray-600">Total contratado</span><strong>{moeda.format((data?.financeiro.contratado_centavos || 0) / 100)}</strong></div><div className="flex justify-between"><span className="text-gray-600">Total pago</span><strong className="text-emerald-700">{moeda.format((data?.financeiro.recebido_centavos || 0) / 100)}</strong></div><div className="flex justify-between"><span className="text-gray-600">Valor vencido</span><strong className="text-red-700">{moeda.format((data?.financeiro.vencido_centavos || 0) / 100)}</strong></div><div className="flex justify-between"><span className="text-gray-600">Parcelas vencidas</span><strong>{data?.financeiro.parcelas_vencidas || 0}</strong></div><Link to="/admin/pagamentos" className="inline-block pt-2 font-semibold text-primary">Abrir pagamentos →</Link></CardContent></Card>
    </div>

    {['admin', 'dev'].includes(user?.tipo || '') && <Card><CardHeader><CardTitle className="flex items-center gap-2"><BusFront size={19} />Capacidade dos ônibus</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[
      ['Saídas', data?.operacao.saidas || 0], ['Ônibus', data?.operacao.onibus || 0], ['Capacidade', data?.operacao.capacidade || 0], ['Ocupadas', data?.operacao.ocupadas || 0], ['Livres', data?.operacao.livres || 0], ['Embarcados', data?.operacao.presentes || 0],
    ].map(([rotulo, valor]) => <div key={String(rotulo)} className="rounded-xl border border-gray-200 p-3"><p className="text-xs text-gray-500">{rotulo}</p><p className="text-xl font-bold text-secondary">{valor}</p></div>)}</div><Link to="/admin/onibus" className="mt-4 inline-block text-sm font-semibold text-primary">Abrir mapa dos ônibus →</Link></CardContent></Card>}

    {alertas.length > 0 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle size={19} className="text-amber-600" />Pendências que precisam de atenção</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-2">{alertas.map(([tipo, total]) => <div key={tipo} className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950"><span>{alertaLabel[tipo] || tipo}</span><strong>{total}</strong></div>)}</div></CardContent></Card>}
  </div>;
}
