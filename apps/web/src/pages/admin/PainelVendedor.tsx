import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Mail, MessageCircle, RefreshCw, ShoppingCart, Users, WalletCards } from 'lucide-react';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button } from '@ui/index';

type PainelData = {
  perfil: string;
  equipe_nome: string | null;
  resumo: { vendedores: number; leads: number; clientes: number; vendas: number; confirmadas: number; receita_centavos: number; recebido_centavos: number; comissao_centavos: number };
  vendedores: Array<{ id: string; nome: string; email: string; equipe_nome: string | null; leads: number; vendas: number; confirmadas: number; receita_centavos: number; comissao_centavos: number }>;
  leads: Array<{ id: string; vendedor_id: string | null; usuario_id: string | null; nome: string | null; email: string | null; whatsapp: string | null; status: string | null; atualizado_em: string }>;
  ultimas_vendas: Array<{ id: string; vendedor_id: string | null; cliente_nome: string; cliente_email: string; evento_nome: string; lote_nome: string; pacote_nome: string | null; status: string | null; checkout_estado: string; valor_total: string; criado_em: string }>;
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabel: Record<string, string> = { cliente_confirmado: 'Confirmada', aguardando_pagamento: 'Aguardando pagamento', contrato_gerado: 'Contrato em andamento', checkout_iniciado: 'Checkout iniciado', abandonado: 'Abandonada' };

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof Users; tone: string }) {
  return <div className="admin-metric-card flex items-center gap-3"><span className={`admin-icon-bubble ${tone}`}><Icon size={19} /></span><div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><strong className="text-xl text-[#073F50]">{value}</strong></div></div>;
}

export default function PainelVendedor() {
  const { user } = useAuth();
  const [data, setData] = useState<PainelData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.get('/admin/painel-vendedor');
      setData(resposta.data);
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível carregar o painel comercial.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const resumo = data?.resumo;
  const titulo = user?.tipo === 'vendedor' ? 'Meu painel comercial' : 'Painel da equipe de vendas';
  const descricao = user?.tipo === 'vendedor' ? 'Acompanhe sua carteira, seus contatos e suas vendas.' : 'Acompanhe resultados e carteira dos vendedores sob sua gestão.';

  return <div className="admin-page">
    <section className="admin-page-header">
      <div><p className="admin-eyebrow">Operação comercial</p><h1 className="admin-title">{titulo}</h1><p className="admin-subtitle">{data?.equipe_nome ? `${data.equipe_nome} · ` : ''}{descricao}</p></div>
      <div className="flex gap-2"><Link to="/admin/vendas/interna"><Button className="flex items-center gap-2"><ShoppingCart size={16} /> Registrar venda</Button></Link><Button type="button" variant="outline" onClick={() => void carregar()} disabled={carregando}><RefreshCw size={16} className={carregando ? 'mr-2 animate-spin' : 'mr-2'} /> Atualizar</Button></div>
    </section>
    {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Vendas" value={resumo?.vendas || 0} icon={ShoppingCart} tone="bg-[#fff0eb] text-[#d75439]" />
      <Metric label="Confirmadas" value={resumo?.confirmadas || 0} icon={BarChart3} tone="bg-[#eaf7f0] text-[#2b8a62]" />
      <Metric label="Receita" value={moeda.format((resumo?.receita_centavos || 0) / 100)} icon={WalletCards} tone="bg-[#eaf4f5] text-[#176477]" />
      <Metric label="Carteira" value={`${resumo?.clientes || 0} clientes · ${resumo?.leads || 0} contatos`} icon={Users} tone="bg-[#fff5df] text-[#b77718]" />
    </div>
    {user?.tipo !== 'vendedor' && <section className="admin-card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><p className="admin-eyebrow">Gestão</p><h2 className="text-lg font-black text-[#073F50]">Resultado por vendedor</h2></div><div className="overflow-x-auto"><table className="admin-table"><thead><tr><th>Vendedor</th><th>Contatos</th><th>Vendas</th><th>Confirmadas</th><th>Receita</th><th>Comissão</th></tr></thead><tbody>{data?.vendedores.map((vendedor) => <tr key={vendedor.id}><td><strong className="text-[#073F50]">{vendedor.nome}</strong><span className="block text-xs text-slate-400">{vendedor.email}</span></td><td>{vendedor.leads}</td><td>{vendedor.vendas}</td><td>{vendedor.confirmadas}</td><td>{moeda.format(vendedor.receita_centavos / 100)}</td><td>{moeda.format(vendedor.comissao_centavos / 100)}</td></tr>)}{!data?.vendedores.length && <tr><td colSpan={6} className="py-8 text-center text-slate-400">Nenhum vendedor vinculado a esta equipe.</td></tr>}</tbody></table></div></section>}
    <div className="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
      <section className="admin-card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><p className="admin-eyebrow">Carteira</p><h2 className="text-lg font-black text-[#073F50]">Contatos recentes</h2></div><div className="divide-y divide-slate-100">{data?.leads.slice(0, 12).map((lead) => <div key={lead.id} className="flex items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><strong className="block truncate text-sm text-[#073F50]">{lead.nome || 'Contato sem nome'}</strong><span className="block truncate text-xs text-slate-500">{lead.email || lead.whatsapp || 'Sem contato informado'} · {lead.status || 'novo'}</span></div><div className="flex shrink-0 gap-1">{lead.whatsapp && <a href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="admin-row-action text-emerald-700" title="Conversar no WhatsApp"><MessageCircle size={16} /></a>}{lead.email && <a href={`mailto:${lead.email}`} className="admin-row-action text-sky-700" title="Enviar e-mail"><Mail size={16} /></a>}</div></div>)}{!data?.leads.length && <p className="p-8 text-center text-sm text-slate-400">Nenhum contato na carteira.</p>}</div></section>
      <section className="admin-card overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="admin-eyebrow">Vendas</p><h2 className="text-lg font-black text-[#073F50]">Últimas vendas da carteira</h2></div><Link to="/admin/vendas" className="text-sm font-bold text-[#DF6248]">Ver vendas</Link></div><div className="overflow-x-auto"><table className="admin-table"><thead><tr><th>Cliente</th><th>Viagem</th><th>Status</th><th>Valor</th></tr></thead><tbody>{data?.ultimas_vendas.map((venda) => <tr key={venda.id}><td><strong className="text-[#073F50]">{venda.cliente_nome}</strong><span className="block text-xs text-slate-400">{venda.cliente_email}</span></td><td><span className="block text-sm">{venda.evento_nome}</span><span className="text-xs text-slate-500">{venda.pacote_nome || venda.lote_nome}</span></td><td><span className="admin-status bg-slate-100 text-slate-700">{statusLabel[venda.status || ''] || venda.status || venda.checkout_estado}</span></td><td>{moeda.format(Number(venda.valor_total || 0))}</td></tr>)}{!data?.ultimas_vendas.length && <tr><td colSpan={4} className="py-8 text-center text-slate-400">Nenhuma venda registrada.</td></tr>}</tbody></table></div></section>
    </div>
  </div>;
}
