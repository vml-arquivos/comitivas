import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent } from '@ui/index';

interface Evento {
  id: string;
  nome: string;
}

export default function Relatorios() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoId, setEventoId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ocupacao, setOcupacao] = useState<any[]>([]);
  const [faturamento, setFaturamento] = useState<any>(null);
  const [pacotesVendidos, setPacotesVendidos] = useState<any[]>([]);
  const [usoCupons, setUsoCupons] = useState<any[]>([]);

  useEffect(() => {
    const fetchEventos = async () => {
      try {
        const response = await api.get('/eventos');
        const lista: Evento[] = response.data.eventos || [];
        setEventos(lista);
        if (lista.length > 0) setEventoId(lista[0].id);
        else setIsLoading(false);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar eventos.');
        setIsLoading(false);
      }
    };
    fetchEventos();
  }, []);

  useEffect(() => {
    if (!eventoId) return;

    const fetchRelatorios = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [ocupacaoRes, faturamentoRes, pacotesRes, cuponsRes] = await Promise.all([
          api.get(`/admin/relatorios/ocupacao/${eventoId}`),
          api.get(`/admin/relatorios/faturamento/${eventoId}`),
          api.get(`/admin/relatorios/pacotes/${eventoId}`),
          api.get(`/admin/relatorios/cupons/${eventoId}`),
        ]);
        setOcupacao(ocupacaoRes.data.relatorio || []);
        setFaturamento(faturamentoRes.data);
        setPacotesVendidos(pacotesRes.data.relatorio || []);
        setUsoCupons(cuponsRes.data.relatorio || []);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar relatórios.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchRelatorios();
  }, [eventoId]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
      </div>

      {eventos.length > 1 && (
        <div className="max-w-xs">
          <label className="mb-1 block text-sm font-medium text-gray-700">Evento</label>
          <select
            value={eventoId}
            onChange={(e) => setEventoId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {eventos.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.nome}</option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>}

      {eventos.length === 0 && !isLoading && !error && (
        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg">Crie um evento primeiro para ver relatórios.</div>
      )}

      {isLoading && <p className="text-gray-500">Carregando relatórios...</p>}

      {!isLoading && eventoId && (
        <>
          {/* Faturamento resumo */}
          {faturamento && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500">Faturamento Total</p>
                  <p className="text-2xl font-bold text-gray-900">R$ {Number(faturamento.resumo?.faturamento_total ?? 0).toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500">Descontos Aplicados</p>
                  <p className="text-2xl font-bold text-gray-900">R$ {Number(faturamento.resumo?.desconto_total ?? 0).toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500">Valor Líquido</p>
                  <p className="text-2xl font-bold text-primary">R$ {Number(faturamento.resumo?.valor_liquido ?? 0).toFixed(2)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Ocupação por lote */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-bold text-gray-900 mb-4">Ocupação por Lote</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-700 uppercase">
                    <tr>
                      <th className="px-4 py-2 font-medium">Lote</th>
                      <th className="px-4 py-2 font-medium">Vagas Totais</th>
                      <th className="px-4 py-2 font-medium">Ocupadas</th>
                      <th className="px-4 py-2 font-medium">Disponíveis</th>
                      <th className="px-4 py-2 font-medium">% Ocupação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {ocupacao.map((lote: any) => (
                      <tr key={lote.lote_id}>
                        <td className="px-4 py-2 font-medium">{lote.lote_nome}</td>
                        <td className="px-4 py-2">{lote.vagas_totais}</td>
                        <td className="px-4 py-2">{lote.vagas_ocupadas}</td>
                        <td className="px-4 py-2">{lote.vagas_disponiveis}</td>
                        <td className="px-4 py-2">{lote.percentual_ocupacao}%</td>
                      </tr>
                    ))}
                    {ocupacao.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Sem lotes cadastrados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Faturamento por lote */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-bold text-gray-900 mb-4">Faturamento por Lote</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-700 uppercase">
                    <tr>
                      <th className="px-4 py-2 font-medium">Lote</th>
                      <th className="px-4 py-2 font-medium">Reservas Confirmadas</th>
                      <th className="px-4 py-2 font-medium">Faturamento</th>
                      <th className="px-4 py-2 font-medium">Desconto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(faturamento?.relatorio || []).map((lote: any) => (
                      <tr key={lote.lote_id}>
                        <td className="px-4 py-2 font-medium">{lote.lote_nome}</td>
                        <td className="px-4 py-2">{lote.reservas_confirmadas}</td>
                        <td className="px-4 py-2">R$ {Number(lote.faturamento).toFixed(2)}</td>
                        <td className="px-4 py-2">R$ {Number(lote.desconto_total).toFixed(2)}</td>
                      </tr>
                    ))}
                    {(!faturamento || (faturamento.relatorio || []).length === 0) && (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Sem dados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pacotes mais vendidos */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-bold text-gray-900 mb-4">Itens Mais Vendidos</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-700 uppercase">
                    <tr>
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-4 py-2 font-medium">Qtd. Vendida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {pacotesVendidos.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 font-medium">{item.pacote}</td>
                        <td className="px-4 py-2">{item.quantidade_vendida}</td>
                      </tr>
                    ))}
                    {pacotesVendidos.length === 0 && (
                      <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-500">Sem vendas registradas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Uso de cupons */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-bold text-gray-900 mb-4">Uso de Cupons</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-700 uppercase">
                    <tr>
                      <th className="px-4 py-2 font-medium">Código</th>
                      <th className="px-4 py-2 font-medium">Usos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {usoCupons.map((cupom: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 font-medium">{cupom.codigo}</td>
                        <td className="px-4 py-2">{cupom.uso_atual ?? cupom.usos}</td>
                      </tr>
                    ))}
                    {usoCupons.length === 0 && (
                      <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-500">Nenhum cupom usado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
