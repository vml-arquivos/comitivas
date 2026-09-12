import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Armchair, BedDouble, BusFront, CheckCircle2, CircleDollarSign, ClipboardCheck, Clock3, RefreshCw, Ticket, UserPlus, Users, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button } from '@ui/index';
import { FunnelChart, HorizontalBars, LineTrend } from '../../components/admin/DataVisuals';
import LimpezaDadosIncompletos from '../../components/admin/LimpezaDadosIncompletos';

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
  serie_vendas: Array<{ data: string; label: string; valor_centavos: number; reservas: number }>;
  funil: Array<{ label: string; valor: number }>;
  ocupacao_onibus: Array<{ id: string; nome: string; saida_nome: string; capacidade: number; ocupadas: number; bloqueadas: number }>;
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
  hospedagem: { quartos: number; capacidade: number; ocupadas: number; livres: number };
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
  const alertas = Object.entries(data?.alertas || {}).filter(([, total]) => Number(total) > 0);
  const alertaLabel: Record<string, string> = {
    cadastros_sem_reserva: 'Cadastros ainda sem reserva',
    aprovacoes_inconsistentes: 'Cadastros aprovados com registro incompleto',
    contratos_aguardando_cliente: 'Contratos aguardando o cliente',
    contratos_aguardando_admin: 'Contratos aguardando aprovação',
    parcelas_vencidas: 'Parcelas vencidas',
    divergencias_capacidade: 'Diferenças entre vagas comerciais e físicas',
    solicitacoes_pendentes: 'Solicitações de cancelamento ou alteração',
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

      {['admin', 'dev'].includes(user?.tipo || '') && <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/admin/hospedagem"><Stat titulo="Hospedagem" valor={`${data?.hospedagem.ocupadas || 0} / ${data?.hospedagem.capacidade || 0}`} apoio={`${data?.hospedagem.quartos || 0} quarto(s) mapeado(s)`} icon={BedDouble} tom="teal" /></Link>
        <Link to="/admin/solicitacoes"><Stat titulo="Pós-venda" valor={data?.alertas.solicitacoes_pendentes || 0} apoio="Solicitações aguardando conclusão" icon={ClipboardCheck} tom="amber" /></Link>
      </div>}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr_1fr]">
        <section className="admin-card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="admin-eyebrow">Comercial</p>
              <h2 className="text-lg font-black text-[#073F50]">Evolução das vendas</h2>
            </div>
            <span className="admin-status bg-[#eaf4f5] text-[#176477]">Últimos 30 dias</span>
          </div>
          <LineTrend dados={(data?.serie_vendas || []).map((item) => ({ label: item.label, value: item.valor_centavos / 100 }))} formatar={(valor) => moeda.format(valor)} />
        </section>

        <section className="admin-card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="admin-eyebrow">Operação</p>
              <h2 className="text-lg font-black text-[#073F50]">Ocupação dos veículos</h2>
            </div>
            <BusFront size={20} className="text-[#DF6248]" />
          </div>
          <HorizontalBars itens={(data?.ocupacao_onibus || []).map((item) => ({ label: item.nome, value: item.capacidade ? Math.round((item.ocupadas / item.capacidade) * 100) : 0, detail: `${item.ocupadas}/${item.capacidade} · ${item.saida_nome}` }))} />
          {['admin', 'dev'].includes(user?.tipo || '') && <Link to="/admin/onibus" className="mt-5 inline-block text-sm font-bold text-[#DF6248]">Abrir mapa de lugares →</Link>}
        </section>

        <section className="admin-card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="admin-eyebrow">Conversão</p>
              <h2 className="text-lg font-black text-[#073F50]">Funil comercial</h2>
            </div>
            <Users size={20} className="text-[#DF6248]" />
          </div>
          <FunnelChart etapas={(data?.funil || []).map((item) => ({ label: item.label, value: item.valor }))} />
          <Link to="/admin/jornada" className="mt-5 inline-block text-sm font-bold text-[#DF6248]">Ver negociações →</Link>
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
      {['admin', 'dev'].includes(user?.tipo || '') && <LimpezaDadosIncompletos onConcluido={() => void carregar()} />}
    </div>
  );
}
