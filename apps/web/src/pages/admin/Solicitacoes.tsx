import { useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { Button, Input } from '@ui/index';
import { api, useAuth } from '../../contexts/AuthContext';
import { AdminModal } from '../../components/admin/AdminModal';

const rotulos: Record<string, string> = {
  cancelamento: 'Cancelamento',
  troca_pacote: 'Alteração de pacote',
  reinicio: 'Recomeçar contratação',
  pendente: 'Pendente',
  em_analise: 'Em análise',
  aprovada: 'Aprovada',
  rejeitada: 'Não aprovada',
  concluida: 'Concluída',
  a_analisar: 'Estorno a analisar',
  aprovado: 'Estorno aprovado',
  negado: 'Sem estorno',
  processado: 'Estorno processado',
  nao_aplicavel: 'Não aplicável',
};

export default function Solicitacoes() {
  const { user } = useAuth();
  const [itens, setItens] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [selecionada, setSelecionada] = useState<any | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ status: 'em_analise', parecer: '', reembolso_status: 'nao_aplicavel', valor_reembolso: '' });

  const carregar = async () => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.get('/solicitacoes');
      setItens(resposta.data.solicitacoes || []);
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível carregar as solicitações.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const abrir = (item: any) => {
    setSelecionada(item);
    setForm({
      status: item.status === 'pendente' ? 'em_analise' : item.status === 'em_analise' ? 'aprovada' : item.status === 'aprovada' ? 'concluida' : item.status,
      parecer: item.parecer || '',
      reembolso_status: item.reembolso_status || (item.tipo === 'cancelamento' ? 'a_analisar' : 'nao_aplicavel'),
      valor_reembolso: item.valor_reembolso_centavos == null ? '' : (Number(item.valor_reembolso_centavos) / 100).toFixed(2),
    });
  };

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selecionada) return;
    setSalvando(true);
    setErro('');
    setMensagem('');
    try {
      await api.patch(`/solicitacoes/${selecionada.id}`, {
        status: form.status,
        parecer: form.parecer,
        reembolso_status: selecionada.tipo === 'cancelamento' ? form.reembolso_status : 'nao_aplicavel',
        valor_reembolso_centavos: form.valor_reembolso === '' ? null : Math.round(Number(form.valor_reembolso) * 100),
      });
      setSelecionada(null);
      setMensagem('Análise atualizada. O histórico da contratação foi preservado.');
      await carregar();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível salvar a análise.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Pós-venda</p>
          <h1 className="admin-title">Solicitações</h1>
          <p className="admin-subtitle">Analise cancelamentos e alterações sem apagar contratos, pagamentos ou histórico.</p>
        </div>
        <Button variant="outline" onClick={() => void carregar()}><RefreshCw size={16} className="mr-2" />Atualizar</Button>
      </div>
      {erro && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{mensagem}</div>}
      <div className="grid gap-3">
        {carregando ? <p className="text-sm text-slate-500">Carregando...</p> : itens.map((item) => (
          <article key={item.id} className="admin-card grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="admin-status bg-[#fff0eb] text-[#9f3927]">{rotulos[item.tipo] || item.tipo}</span>
                <span className="admin-status bg-slate-100 text-slate-700">{rotulos[item.status] || item.status}</span>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-[#073F50]">{item.cliente_nome}</h2>
              <p className="text-sm text-slate-500">{item.evento_nome} · {item.pacote_nome || item.lote_nome}</p>
              {item.tipo === 'troca_pacote' && <p className="mt-1 text-xs font-medium text-[#9f3927]">Novo pacote: {item.pacote_destino_nome || 'não informado'}</p>}
            </div>
            <div className="text-sm text-slate-600">
              <p className="line-clamp-2">{item.motivo}</p>
              <p className="mt-2 text-xs">Solicitado por {item.solicitado_por_tipo} · {new Date(item.criado_em).toLocaleString('pt-BR')}</p>
            </div>
            {user?.tipo !== 'vendedor' && !['rejeitada', 'concluida'].includes(item.status) ? (
              <Button variant="outline" onClick={() => abrir(item)}><ClipboardCheck size={16} className="mr-2" />Analisar</Button>
            ) : <span className="text-xs text-slate-500">{item.parecer || 'Acompanhamento disponível'}</span>}
          </article>
        ))}
        {!carregando && itens.length === 0 && <div className="admin-card p-8 text-center text-sm text-slate-500">Nenhuma solicitação registrada.</div>}
      </div>

      <AdminModal aberto={Boolean(selecionada)} titulo="Analisar solicitação" descricao="Registre cada etapa. A conclusão é separada da aprovação para permitir a análise de estorno." fechar={() => setSelecionada(null)}>
        <form className="space-y-4" onSubmit={salvar}>
          <label className="block text-sm font-medium">Situação
            <select className="admin-field mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="em_analise">Em análise</option>
              <option value="aprovada">Aprovar</option>
              <option value="rejeitada">Não aprovar</option>
              {selecionada?.status === 'aprovada' && <option value="concluida">Concluir processo</option>}
            </select>
          </label>
          <label className="block text-sm font-medium">Parecer
            <textarea required minLength={5} className="admin-field mt-1 min-h-28" value={form.parecer} onChange={(e) => setForm({ ...form, parecer: e.target.value })} placeholder="Decisão, condições e providências adotadas" />
          </label>
          {selecionada?.tipo === 'cancelamento' && <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Estorno
              <select className="admin-field mt-1" value={form.reembolso_status} onChange={(e) => setForm({ ...form, reembolso_status: e.target.value })}>
                <option value="a_analisar">A analisar</option><option value="aprovado">Aprovado</option><option value="negado">Não devido</option><option value="processado">Processado</option>
              </select>
            </label>
            <Input label="Valor do estorno (R$)" type="number" min="0" step="0.01" value={form.valor_reembolso} onChange={(e) => setForm({ ...form, valor_reembolso: e.target.value })} />
          </div>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSelecionada(null)}>Fechar</Button><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar análise'}</Button></div>
        </form>
      </AdminModal>
    </div>
  );
}
