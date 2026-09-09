import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Armchair, BusFront, CheckCircle2, CircleDollarSign, Clock3, FileCheck2, FileText, RefreshCw, Ticket, UserPlus, Users, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button } from '@ui/index';

type DashboardData = {
  resumo: Record<string, number | string>;
  financeiro: {
    contratado_centavos: number;
    recebido_centavos: number;
    a_receber_centavos: number;
    vencido_centavos: number;
    parcelas_vencidas: number;
  };
  contratos: {
    total: number;
    aguardando_cliente: number;
    aguardando_admin: number;
    aprovados: number;
  };
  reservas_status: Record<string, number>;
  operacao: {
    saidas: number;
    onibus: number;
    capacidade: number;
    ocupadas: number;
    bloqueadas: number;
    em_hold: number;
    livres: number;
    presentes: number;
    divergencias: number;
  };
  alertas: Record<string, number>;
  filtros: {
    eventos: Array<{ id: string; nome: string }>;
    evento_id: string | null;
  };
};

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const statusLabel: Record<string, string> = {
  visitante: 'Iniciadas',
  cadastrado: 'Cadastradas',
  pacote_montado: 'Pacote escolhido',
  checkout_iniciado: 'Em contratação',
  aguardando_pagamento: 'Aguardando pagamento',
  contrato_gerado: 'Contrato gerado',
  cliente_confirmado: 'Confirmadas',
  abandonado: 'Interrompidas',
};
const coresStatus = ['#DF6248', '#EBA24D', '#437E8E', '#51A37B', '#7E6EB0', '#C76C8B'];

function Stat({ titulo, valor, apoio, icon: Icon, tom }: { titulo: string; valor: string | number; apoio?: string; icon: LucideIcon; tom: 'coral' | 'teal' | 'green' | 'amber' }) {
  const tons = {
    coral: 'bg-[#fff0eb] text-[#d75439]',
    teal: 'bg-[#eaf4f5] text-[#176477]',
    green: 'bg-[#eaf7f0] text-[#2b8a62]',
    amber: 'bg-[#fff5df] text-[#b77718]',
  };
  return (
    <div className="admin-metric-card flex items-start gap-4">
      <div className={`admin-icon-bubble ${tons[tom]}`}>
        <Icon size={21} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{titulo}</p>
        <p className="mt-1 truncate text-2xl font-black text-[#073F50]">{valor}</p>
        {apoio && <p className="mt-0.5 text-xs text-slate-400">{apoio}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [eventoId, setEventoId] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = async (filtro = eventoId) => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.get('/admin/dashboard', {
        params: filtro ? { evento_id: filtro } : {},
      });
      setData(resposta.data);
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Erro ao carregar o dashboard.');
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => {
    void carregar('');
  }, []);

  const resumo = data?.resumo || {};
  const totalReservas = Number(resumo.total_reservas || 0);
  const capacidade = data?.operacao.capacidade || 0;
  const ocupadas = data?.operacao.ocupadas || 0;
  const ocupacao = capacidade > 0 ? Math.min(100, Math.round((ocupadas / capacidade) * 100)) : 0;
  const contratosTotal = data?.contratos.total || 0;
  const contratosAprovados = data?.contratos.aprovados || 0;
  const contratosPercentual = contratosTotal > 0 ? Math.min(100, Math.round((contratosAprovados / contratosTotal) * 100)) : 0;
  const alertas = Object.entries(data?.alertas || {}).filter(([, total]) => Number(total) > 0);
  const alertaLabel: Record<string, string> = {
    cadastros_sem_reserva: 'Cadastros ainda sem reserva',
    aprovacoes_inconsistentes: 'Cadastros aprovados com registro incompleto',
    contratos_aguardando_cliente: 'Contratos aguardando o cliente',
    contratos_aguardando_admin: 'Contratos aguardando aprovação',
    parcelas_vencidas: 'Parcelas vencidas',
    divergencias_capacidade: 'Diferenças entre vagas comerciais e físicas',
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Painel operacional</p>
          <h1 className="admin-title">Visão geral</h1>
          <p className="admin-subtitle">Acompanhe vendas, contratos, recebimentos e lugares disponíveis em tempo real.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filtrar por viagem"
            value={eventoId}
            onChange={(e) => {
              setEventoId(e.target.value);
              void carregar(e.target.value);
            }}
            className="admin-field min-w-[220px]"
          >
            <option value="">Todas as viagens</option>
            {data?.filtros.eventos.map((evento) => (
              <option key={evento.id} value={evento.id}>
                {evento.nome}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => void carregar()}>
            <RefreshCw size={16} className={carregando ? 'mr-2 animate-spin' : 'mr-2'} />
            Atualizar
          </Button>
        </div>
      </div>
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      {carregando && !data && <p className="text-sm text-slate-500">Carregando indicadores...</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat titulo="Recebido" valor={moeda.format((data?.financeiro.recebido_centavos || 0) / 100)} apoio="Pagamentos confirmados" icon={WalletCards} tom="green" />
        <Stat titulo="Lugares ocupados" valor={`${ocupadas} / ${capacidade}`} apoio={`${ocupacao}% da capacidade física`} icon={Armchair} tom="coral" />
        <Stat titulo="A receber" valor={moeda.format((data?.financeiro.a_receber_centavos || 0) / 100)} apoio="Saldo contratado" icon={Clock3} tom="teal" />
        <Stat titulo="Em atraso" valor={moeda.format((data?.financeiro.vencido_centavos || 0) / 100)} apoio={`${data?.financeiro.parcelas_vencidas || 0} parcela(s)`} icon={AlertTriangle} tom="amber" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat titulo="Clientes" valor={resumo.total_clientes || 0} icon={UserPlus} tom="teal" />
        <Stat titulo="Contatos" valor={resumo.total_leads_crm || 0} icon={Users} tom="coral" />
        <Stat titulo="Reservas" valor={totalReservas} icon={Ticket} tom="amber" />
        <Stat titulo="Conversão" valor={`${resumo.taxa_conversao || 0}%`} icon={CircleDollarSign} tom="green" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr_1fr]">
        <section className="admin-card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="admin-eyebrow">Comercial</p>
              <h2 className="text-lg font-black text-[#073F50]">Situação das reservas</h2>
            </div>
            <Ticket size={20} className="text-[#DF6248]" />
          </div>
          <div className="space-y-4">
            {Object.entries(data?.reservas_status || {})
              .filter(([, total]) => total > 0)
              .map(([status, total], indice) => (
                <div key={status}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{statusLabel[status] || status}</span>
                    <strong className="text-[#073F50]">{total}</strong>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${totalReservas ? Math.max(3, (total / totalReservas) * 100) : 0}%`,
                        backgroundColor: coresStatus[indice % coresStatus.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            {totalReservas === 0 && <p className="text-sm text-slate-500">Nenhuma reserva no período.</p>}
          </div>
        </section>

        <section className="admin-card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="admin-eyebrow">Documentos</p>
              <h2 className="text-lg font-black text-[#073F50]">Contratos</h2>
            </div>
            <FileText size={20} className="text-[#DF6248]" />
          </div>
          <div className="flex items-center gap-5">
            <div
              className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#DF6248 ${contratosPercentual}%, #EDF1F1 0)`,
              }}
            >
              <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-lg font-black text-[#073F50]">{contratosPercentual}%</div>
            </div>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-slate-600">
                <CheckCircle2 size={15} className="text-emerald-600" />
                {contratosAprovados} aprovados
              </p>
              <p className="flex items-center gap-2 text-slate-600">
                <Clock3 size={15} className="text-amber-600" />
                {data?.contratos.aguardando_cliente || 0} aguardando cliente
              </p>
              <p className="flex items-center gap-2 text-slate-600">
                <FileCheck2 size={15} className="text-sky-700" />
                {data?.contratos.aguardando_admin || 0} aguardando equipe
              </p>
            </div>
          </div>
          <Link to="/admin/contratos" className="mt-5 inline-block text-sm font-bold text-[#DF6248]">
            Ver contratos →
          </Link>
        </section>

        <section className="admin-card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="admin-eyebrow">Operação</p>
              <h2 className="text-lg font-black text-[#073F50]">Transporte</h2>
            </div>
            <BusFront size={20} className="text-[#DF6248]" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Capacidade utilizada</span>
              <strong>{ocupacao}%</strong>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100">
              <div className="h-2.5 rounded-full bg-[#DF6248]" style={{ width: `${ocupacao}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2">
                <strong className="block text-lg text-[#073F50]">{data?.operacao.onibus || 0}</strong>
                <span className="text-[10px] uppercase text-slate-400">Veículos</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-2">
                <strong className="block text-lg text-[#073F50]">{data?.operacao.livres || 0}</strong>
                <span className="text-[10px] uppercase text-slate-400">Livres</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-2">
                <strong className="block text-lg text-[#073F50]">{data?.operacao.presentes || 0}</strong>
                <span className="text-[10px] uppercase text-slate-400">Embarcados</span>
              </div>
            </div>
          </div>
          {['admin', 'dev'].includes(user?.tipo || '') && (
            <Link to="/admin/onibus" className="mt-5 inline-block text-sm font-bold text-[#DF6248]">
              Abrir mapa de lugares →
            </Link>
          )}
        </section>
      </div>

      <section className="admin-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <p className="admin-eyebrow">Atenção</p>
            <h2 className="text-lg font-black text-[#073F50]">Pendências</h2>
          </div>
          <AlertTriangle size={20} className={alertas.length ? 'text-amber-600' : 'text-emerald-600'} />
        </div>
        {alertas.length > 0 ? (
          <div className="grid gap-px bg-slate-100 md:grid-cols-2">
            {alertas.map(([tipo, total]) => (
              <div key={tipo} className="flex items-center justify-between bg-white px-5 py-4 text-sm">
                <span className="text-slate-600">{alertaLabel[tipo] || tipo}</span>
                <strong className="admin-status bg-amber-100 text-amber-800">{total}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-5 py-5 text-sm text-emerald-700">
            <CheckCircle2 size={18} />
            Nenhuma pendência crítica encontrada.
          </div>
        )}
      </section>
    </div>
  );
}
