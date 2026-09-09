import { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@ui/index';
import { CreditCard, RefreshCw, Search } from 'lucide-react';

type Pagamento = {
  id: string;
  reserva_id: string;
  status: string;
  status_reconciliado: string;
  metodo: string;
  valor: string;
  valor_centavos: number | null;
  valor_pago_centavos: number;
  gateway_id: string | null;
  criado_em: string;
  atualizado_em: string;
  cliente_nome: string;
  cliente_email: string;
  evento_nome: string;
  lote_nome: string;
};
const moeda = (valor: number | string | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0));
const statusLabel: Record<string, string> = {
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

export default function Pagamentos() {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [reconciliado, setReconciliado] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const response = await api.get('/admin/pagamentos', {
        params: {
          busca: busca.trim() || undefined,
          status: status || undefined,
          reconciliado: reconciliado || undefined,
        },
      });
      setPagamentos(response.data.pagamentos || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar os pagamentos.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, [status, reconciliado]);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Financeiro</p>
          <h1 className="admin-title">Pagamentos</h1>
          <p className="admin-subtitle">Acompanhamento dos valores e das situações de pagamento.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void carregar()} className="flex items-center gap-2">
          <RefreshCw size={16} /> Atualizar
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void carregar();
            }}
            className="flex flex-1 gap-2"
          >
            <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Cliente, e-mail ou excursão" className="flex-1" />
            <Button type="submit" variant="outline" className="flex items-center gap-2">
              <Search size={16} /> Buscar
            </Button>
          </form>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="processando">Processando</option>
            <option value="aprovado">Aprovado</option>
            <option value="recusado">Recusado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <select value={reconciliado} onChange={(event) => setReconciliado(event.target.value)} className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">Todas as situações</option>
            <option value="pendente">Pendente</option>
            <option value="parcial">Parcial</option>
            <option value="quitado">Quitado</option>
            <option value="falhou">Falhou</option>
          </select>
        </CardContent>
      </Card>
      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard size={20} className="text-primary" /> {pagamentos.length} registro(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 uppercase text-gray-700">
                <tr>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium">Excursão / lote</th>
                  <th className="px-6 py-4 font-medium">Método</th>
                  <th className="px-6 py-4 font-medium">Valor</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Atualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {carregando && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Carregando pagamentos...
                    </td>
                  </tr>
                )}
                {!carregando &&
                  pagamentos.map((pagamento) => (
                    <tr key={pagamento.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{pagamento.cliente_nome}</div>
                        <div className="text-xs text-gray-500">{pagamento.cliente_email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div>{pagamento.evento_nome}</div>
                        <div className="text-xs text-gray-500">
                          {pagamento.lote_nome} · reserva {pagamento.reserva_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-6 py-4 uppercase">{pagamento.metodo}</td>
                      <td className="px-6 py-4">
                        {moeda(pagamento.valor)}
                        <div className="text-xs text-gray-500">Pago: {moeda((pagamento.valor_pago_centavos || 0) / 100)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{statusLabel[pagamento.status] || pagamento.status}</span>
                        <div className="mt-1 text-xs text-gray-500">{statusLabel[pagamento.status_reconciliado] || pagamento.status_reconciliado}</div>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">{new Date(pagamento.atualizado_em).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                {!carregando && pagamentos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Nenhum pagamento encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
