import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';

function moedaCentavos(valor: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0) / 100); }

export default function Comissoes() {
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [regras, setRegras] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  const [tipo, setTipo] = useState<'percentual' | 'fixo'>('percentual');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');

  const carregar = async () => {
    try {
      const [usuarios, regrasResponse, ledgerResponse] = await Promise.all([api.get('/admin/usuarios?tipo=vendedor'), api.get('/admin/comissoes/regras'), api.get('/admin/comissoes')]);
      setVendedores(usuarios.data.usuarios || []);
      setRegras(regrasResponse.data.regras || []);
      setLedger(ledgerResponse.data.comissoes || []);
    } catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível carregar as comissões.'); }
  };

  useEffect(() => { void carregar(); }, []);

  const criarRegra = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro('');
    setMensagem('');
    try {
      await api.post('/admin/comissoes/regras', { vendedor_id: vendedorId, tipo, valor: Number(valor) });
      setValor('');
      setMensagem('Regra de comissão salva. Novas reservas usarão esta configuração.');
      await carregar();
    } catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível salvar a regra.'); }
  };

  return <div className="space-y-6"><Helmet><title>Comissões | Painel Admin</title></Helmet><header><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Financeiro comercial</p><h1 className="mt-1 text-3xl font-black text-secondary">Comissões por vendedor</h1><p className="mt-2 text-sm text-slate-600">A regra é congelada na reserva e o pagamento só torna a comissão elegível quando quitado.</p></header>{erro && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{erro}</div>}{mensagem && <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">{mensagem}</div>}<Card><CardHeader><CardTitle>Nova regra</CardTitle></CardHeader><CardContent><form onSubmit={criarRegra} className="grid gap-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end"><label className="text-sm font-semibold">Vendedor<select value={vendedorId} onChange={(event) => setVendedorId(event.target.value)} required className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Selecione</option>{vendedores.map((vendedor) => <option key={vendedor.id} value={vendedor.id}>{vendedor.nome} · {vendedor.email}</option>)}</select></label><label className="text-sm font-semibold">Tipo<select value={tipo} onChange={(event) => setTipo(event.target.value as 'percentual' | 'fixo')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="percentual">Percentual</option><option value="fixo">Valor fixo</option></select></label><Input label={tipo === 'percentual' ? 'Percentual' : 'Valor em R$'} type="number" min="0" step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} required /><Button type="submit">Salvar regra</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Regras ativas e históricas</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="px-3 py-2">Vendedor</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">Ativa</th></tr></thead><tbody>{regras.map((regra) => <tr key={regra.id} className="border-b last:border-0"><td className="px-3 py-3">{vendedores.find((vendedor) => vendedor.id === regra.vendedor_id)?.nome || regra.vendedor_id}</td><td className="px-3 py-3">{regra.tipo}</td><td className="px-3 py-3">{regra.tipo === 'percentual' ? `${regra.valor}%` : `R$ ${regra.valor}`}</td><td className="px-3 py-3">{regra.ativo ? 'Sim' : 'Não'}</td></tr>)}</tbody></table></div></CardContent></Card><Card><CardHeader><CardTitle>Ledger de comissões</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="px-3 py-2">Reserva</th><th className="px-3 py-2">Vendedor</th><th className="px-3 py-2">Base</th><th className="px-3 py-2">Comissão</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{ledger.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="px-3 py-3 font-mono text-xs">{item.reserva_id}</td><td className="px-3 py-3">{vendedores.find((vendedor) => vendedor.id === item.vendedor_id)?.nome || item.vendedor_id}</td><td className="px-3 py-3">{moedaCentavos(item.base_centavos)}</td><td className="px-3 py-3 font-bold">{moedaCentavos(item.valor_centavos)}</td><td className="px-3 py-3">{item.status}</td></tr>)}</tbody></table></div>{ledger.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Nenhuma comissão registrada ainda.</p>}</CardContent></Card></div>;
}
