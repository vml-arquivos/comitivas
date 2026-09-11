import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent } from '@ui/index';
import { BadgeDollarSign, BarChart3, Percent, Ticket } from 'lucide-react';
import { HorizontalBars } from '../../components/admin/DataVisuals';

interface Evento {
  id: string;
  nome: string;
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

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
        const [ocupacaoRes, faturamentoRes, pacotesRes, cuponsRes] = await Promise.all([api.get(`/admin/relatorios/ocupacao/${eventoId}`), api.get(`/admin/relatorios/faturamento/${eventoId}`), api.get(`/admin/relatorios/pacotes/${eventoId}`), api.get(`/admin/relatorios/cupons/${eventoId}`)]);
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
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Análise da operação</p>
          <h1 className="admin-title">Relatórios e métricas</h1>
          <p className="admin-subtitle">Indicadores financeiros, ocupação, pacotes e cupons com dados do sistema.</p>
        </div>
      </div>

      {eventos.length > 1 && (
        <div className="admin-card max-w-sm p-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">Evento</label>
          <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} className="admin-field">
            {eventos.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>}

      {eventos.length === 0 && !isLoading && !error && <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg">Crie um evento primeiro para ver relatórios.</div>}

      {isLoading && <p className="text-gray-500">Carregando relatórios...</p>}

      {!isLoading && eventoId && (
        <>
          {/* Faturamento resumo */}
          {faturamento && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="admin-card">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="admin-icon-bubble bg-[#eaf7f0] text-emerald-700">
                    <BadgeDollarSign size={21} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Faturamento total</p>
                    <p className="text-2xl font-black text-[#073F50]">R$ {Number(faturamento.resumo?.faturamento_total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="admin-card">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="admin-icon-bubble bg-[#fff5df] text-amber-700">
                    <Percent size={21} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Descontos aplicados</p>
                    <p className="text-2xl font-black text-[#073F50]">R$ {Number(faturamento.resumo?.desconto_total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="admin-card">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="admin-icon-bubble bg-[#fff0eb] text-[#DF6248]">
                    <BarChart3 size={21} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Valor líquido</p>
                    <p className="text-2xl font-black text-[#DF6248]">R$ {Number(faturamento.resumo?.valor_liquido ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-3">
            <section className="admin-card p-5 sm:p-6">
              <p className="admin-eyebrow">Capacidade</p>
              <h2 className="mb-5 text-lg font-black text-[#073F50]">Ocupação por lote</h2>
              <HorizontalBars itens={ocupacao.map((lote: any) => ({ label: lote.lote_nome, value: Number(lote.percentual_ocupacao || 0), detail: `${lote.vagas_ocupadas}/${lote.vagas_totais} · ${lote.percentual_ocupacao}%` }))} />
            </section>
            <section className="admin-card p-5 sm:p-6">
              <p className="admin-eyebrow">Receita</p>
              <h2 className="mb-5 text-lg font-black text-[#073F50]">Faturamento por lote</h2>
              <HorizontalBars itens={(faturamento?.relatorio || []).map((lote: any) => ({ label: lote.lote_nome, value: Number(lote.faturamento || 0), detail: moeda.format(Number(lote.faturamento || 0)) }))} />
            </section>
            <section className="admin-card p-5 sm:p-6">
              <p className="admin-eyebrow">Preferência</p>
              <h2 className="mb-5 text-lg font-black text-[#073F50]">Itens mais vendidos</h2>
              <HorizontalBars itens={pacotesVendidos.map((item: any) => ({ label: item.pacote, value: Number(item.quantidade_vendida || 0), detail: `${item.quantidade_vendida} venda(s)` }))} />
            </section>
          </div>

          <details className="admin-card group overflow-hidden">
            <summary className="cursor-pointer list-none px-5 py-4 font-bold text-[#073F50] marker:hidden">Ver tabelas detalhadas <span className="float-right text-[#DF6248] transition group-open:rotate-180">⌄</span></summary>
            <div className="space-y-5 border-t border-slate-100 p-4 sm:p-5">
          {/* Ocupação por lote */}
          <Card className="admin-card">
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
                        <td className="min-w-40 px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-slate-100">
                              <div
                                className="h-2 rounded-full bg-[#DF6248]"
                                style={{
                                  width: `${Math.min(100, Number(lote.percentual_ocupacao || 0))}%`,
                                }}
                              />
                            </div>
                            <strong className="w-11 text-right text-xs">{lote.percentual_ocupacao}%</strong>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {ocupacao.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                          Sem lotes cadastrados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Faturamento por lote */}
          <Card className="admin-card">
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
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                          Sem dados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pacotes mais vendidos */}
          <Card className="admin-card">
            <CardContent className="p-6">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900">
                <Ticket size={18} className="text-[#DF6248]" />
                Itens mais vendidos
              </h2>
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
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-gray-500">
                          Sem vendas registradas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Uso de cupons */}
          <Card className="admin-card">
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
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-gray-500">
                          Nenhum cupom usado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
