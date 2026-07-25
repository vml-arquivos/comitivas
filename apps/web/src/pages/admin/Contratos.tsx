import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, Button, Input } from '@ui/index';
import { Eye, Download, FileSignature, X, FileText } from 'lucide-react';

interface ContratoLinha {
  reserva_id: string;
  status_reserva: string;
  valor_total: string;
  forma_pagamento: string | null;
  quantidade_parcelas: number | null;
  contrato_pdf_url: string | null;
  aceite_timestamp: string | null;
  aceite_ip: string | null;
  criado_em: string;
  cliente_nome: string;
  cliente_email: string;
  cliente_cpf: string | null;
  evento_nome: string;
  lote_nome: string;
  contrato_gerado: boolean;
}

const FORMA_LABEL: Record<string, string> = {
  pix: 'PIX à vista',
  boleto: 'Boleto parcelado',
  credito: 'Cartão de crédito',
};

export default function Contratos() {
  const [contratos, setContratos] = useState<ContratoLinha[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'' | 'gerados' | 'pendentes'>('');
  const [busca, setBusca] = useState('');
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);

  const [gerandoId, setGerandoId] = useState<string | null>(null);
  const [formaPagamentoContrato, setFormaPagamentoContrato] = useState<'pix' | 'boleto' | 'credito'>('pix');
  const [parcelasContrato, setParcelasContrato] = useState('1');
  const [salvandoContrato, setSalvandoContrato] = useState(false);
  const [erroContrato, setErroContrato] = useState<string | null>(null);

  const carregar = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (filtro) params.status = filtro;
      const response = await api.get('/admin/contratos', { params });
      setContratos(response.data.contratos || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar contratos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  const contratosFiltrados = contratos.filter((c) => {
    if (!busca.trim()) return true;
    const termo = busca.trim().toLowerCase();
    return (
      c.cliente_nome?.toLowerCase().includes(termo) ||
      c.cliente_email?.toLowerCase().includes(termo) ||
      (c.cliente_cpf || '').includes(termo) ||
      c.evento_nome?.toLowerCase().includes(termo) ||
      c.reserva_id.toLowerCase().includes(termo)
    );
  });

  const handleVisualizarImprimir = async (reservaId: string) => {
    try {
      const response = await api.get(`/contratos/download/${reservaId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      // Abre em nova aba no visualizador de PDF do navegador — de lá dá para
      // imprimir (Ctrl+P) ou salvar, sem precisar de outra ação.
      window.open(url, '_blank');
    } catch (err: any) {
      alert(err.response?.data?.erro || 'Contrato ainda não disponível para esta reserva.');
    }
  };

  const handleBaixarPdf = async (reservaId: string, clienteNome: string) => {
    try {
      const response = await api.get(`/contratos/download/${reservaId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const nomeArquivo = `contrato-${clienteNome.replace(/\s+/g, '-').toLowerCase()}-${reservaId.substring(0, 8)}.pdf`;
      link.setAttribute('download', nomeArquivo);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      alert(err.response?.data?.erro || 'Contrato ainda não disponível para esta reserva.');
    }
  };

  const abrirGerarContrato = (contrato: ContratoLinha) => {
    setGerandoId(contrato.reserva_id);
    setFormaPagamentoContrato((contrato.forma_pagamento as any) || 'pix');
    setParcelasContrato(String(contrato.quantidade_parcelas || 1));
    setErroContrato(null);
  };

  const fecharGerarContrato = () => {
    setGerandoId(null);
    setErroContrato(null);
  };

  const handleGerarContrato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gerandoId) return;
    setErroContrato(null);
    setSalvandoContrato(true);
    try {
      await api.post(`/admin/contratos/gerar/${gerandoId}`, {
        metodo_pagamento: formaPagamentoContrato,
        quantidade_parcelas: parseInt(parcelasContrato, 10) || 1,
      });
      setAcaoMsg('Contrato gerado com sucesso.');
      setGerandoId(null);
      carregar();
    } catch (err: any) {
      setErroContrato(err.response?.data?.erro || 'Erro ao gerar contrato.');
    } finally {
      setSalvandoContrato(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Contratos</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, e-mail, CPF, evento ou ID da reserva"
          className="flex-1"
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as any)}
          className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todos os status</option>
          <option value="gerados">Contrato gerado</option>
          <option value="pendentes">Sem contrato</option>
        </select>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>}
      {acaoMsg && <div className="bg-blue-50 text-blue-700 p-4 rounded-lg">{acaoMsg}</div>}

      {gerandoId && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleGerarContrato} className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-gray-900">
                  Gerar contrato — reserva {gerandoId.substring(0, 8)}
                </h2>
                <button type="button" onClick={fecharGerarContrato} className="text-gray-500 hover:text-gray-700">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-gray-600">
                O PDF é gerado com a condição de pagamento informada abaixo e passa a aparecer
                nesta lista como "Contrato gerado", disponível para visualizar, imprimir e baixar.
                Para boleto, o número máximo de parcelas é calculado automaticamente pela
                proximidade da data da viagem.
              </p>
              {erroContrato && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{erroContrato}</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Forma de pagamento</label>
                  <select
                    value={formaPagamentoContrato}
                    onChange={(e) => setFormaPagamentoContrato(e.target.value as any)}
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="pix">PIX à vista</option>
                    <option value="boleto">Boleto (parcelas conforme proximidade da viagem)</option>
                    <option value="credito">Cartão de crédito (até 10x)</option>
                  </select>
                </div>
                <Input
                  label="Quantidade de parcelas"
                  type="number"
                  min={1}
                  max={formaPagamentoContrato === 'boleto' ? 20 : formaPagamentoContrato === 'credito' ? 10 : 1}
                  disabled={formaPagamentoContrato === 'pix'}
                  value={formaPagamentoContrato === 'pix' ? '1' : parcelasContrato}
                  onChange={(e) => setParcelasContrato(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={salvandoContrato}>
                  {salvandoContrato ? 'Gerando...' : 'Gerar contrato'}
                </Button>
                <Button type="button" variant="outline" onClick={fecharGerarContrato}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium">Evento / Lote</th>
                  <th className="px-6 py-4 font-medium">Valor</th>
                  <th className="px-6 py-4 font-medium">Pagamento</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Carregando...</td>
                  </tr>
                )}
                {!isLoading && contratosFiltrados.map((c) => (
                  <tr key={c.reserva_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{c.cliente_nome}</div>
                      <div className="text-xs text-gray-500">{c.cliente_email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div>{c.evento_nome}</div>
                      <div className="text-xs text-gray-500">{c.lote_nome}</div>
                    </td>
                    <td className="px-6 py-4">R$ {c.valor_total}</td>
                    <td className="px-6 py-4">
                      {c.forma_pagamento ? (
                        <>
                          {FORMA_LABEL[c.forma_pagamento] || c.forma_pagamento}
                          {(c.quantidade_parcelas || 1) > 1 ? ` — ${c.quantidade_parcelas}x` : ''}
                        </>
                      ) : (
                        <span className="text-gray-400">Não definida</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        c.contrato_gerado ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {c.contrato_gerado ? 'Contrato gerado' : 'Sem contrato'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      {c.contrato_gerado ? (
                        <>
                          <button
                            onClick={() => handleVisualizarImprimir(c.reserva_id)}
                            className="text-gray-500 hover:text-primary transition-colors p-1"
                            title="Visualizar / Imprimir"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            onClick={() => handleBaixarPdf(c.reserva_id, c.cliente_nome)}
                            className="text-gray-500 hover:text-primary transition-colors p-1"
                            title="Baixar PDF"
                          >
                            <Download size={18} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => abrirGerarContrato(c)}
                          className="text-gray-500 hover:text-primary transition-colors p-1"
                          title="Gerar contrato"
                        >
                          <FileSignature size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!isLoading && contratosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <FileText size={24} className="text-gray-300" />
                        Nenhum contrato encontrado
                      </div>
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
