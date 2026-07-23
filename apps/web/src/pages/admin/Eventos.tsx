import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, Button, Input } from '@ui/index';
import { Plus, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

interface Evento {
  id: string;
  nome: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  local: string;
  ativo: boolean;
}

interface Lote {
  id: string;
  evento_id: string;
  nome: string;
  vagas_totais: number;
  'vagas_disponíveis': number;
  data_inicio: string;
  data_fim: string;
  valor_base: string;
  ativo: boolean;
}

export default function EventosAdmin() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarFormEvento, setMostrarFormEvento] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [lotesPorEvento, setLotesPorEvento] = useState<Record<string, Lote[]>>({});
  const [mostrarFormLote, setMostrarFormLote] = useState<string | null>(null);

  // Form evento
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [local, setLocal] = useState('');
  const [salvandoEvento, setSalvandoEvento] = useState(false);
  const [erroEvento, setErroEvento] = useState<string | null>(null);

  // Form lote
  const [loteNome, setLoteNome] = useState('');
  const [loteVagas, setLoteVagas] = useState('');
  const [loteDataInicio, setLoteDataInicio] = useState('');
  const [loteDataFim, setLoteDataFim] = useState('');
  const [loteValorBase, setLoteValorBase] = useState('');
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);

  const fetchEventos = async () => {
    try {
      const response = await api.get('/eventos');
      setEventos(response.data.eventos || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar eventos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEventos();
  }, []);

  const resetFormEvento = () => {
    setNome(''); setDescricao(''); setDataInicio(''); setDataFim(''); setLocal(''); setErroEvento(null);
  };

  const handleCriarEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroEvento(null);

    if (!nome || !dataInicio || !dataFim) {
      setErroEvento('Nome, data de início e data de fim são obrigatórios.');
      return;
    }

    setSalvandoEvento(true);
    try {
      const response = await api.post('/eventos', {
        nome, descricao, local,
        data_inicio: new Date(dataInicio).toISOString(),
        data_fim: new Date(dataFim).toISOString(),
      });
      setEventos((prev) => [...prev, response.data.evento]);
      resetFormEvento();
      setMostrarFormEvento(false);
    } catch (err: any) {
      setErroEvento(err.response?.data?.erro || 'Erro ao criar evento.');
    } finally {
      setSalvandoEvento(false);
    }
  };

  const handleExcluirEvento = async (eventoId: string) => {
    if (!confirm('Excluir este evento? Só é possível se não houver lotes vinculados.')) return;
    try {
      await api.delete(`/eventos/${eventoId}`);
      setEventos((prev) => prev.filter((e) => e.id !== eventoId));
    } catch (err: any) {
      alert(err.response?.data?.erro || 'Erro ao excluir evento.');
    }
  };

  const toggleExpandir = async (eventoId: string) => {
    if (expandido === eventoId) {
      setExpandido(null);
      return;
    }
    setExpandido(eventoId);
    if (!lotesPorEvento[eventoId]) {
      try {
        const response = await api.get(`/lotes/evento/${eventoId}`);
        setLotesPorEvento((prev) => ({ ...prev, [eventoId]: response.data.lotes || [] }));
      } catch (err: any) {
        alert(err.response?.data?.erro || 'Erro ao carregar lotes.');
      }
    }
  };

  const resetFormLote = () => {
    setLoteNome(''); setLoteVagas(''); setLoteDataInicio(''); setLoteDataFim(''); setLoteValorBase(''); setErroLote(null);
  };

  const handleCriarLote = async (e: React.FormEvent, eventoId: string) => {
    e.preventDefault();
    setErroLote(null);

    if (!loteNome || !loteVagas || !loteDataInicio || !loteDataFim || !loteValorBase) {
      setErroLote('Todos os campos são obrigatórios.');
      return;
    }

    setSalvandoLote(true);
    try {
      const response = await api.post('/lotes', {
        evento_id: eventoId,
        nome: loteNome,
        vagas_totais: parseInt(loteVagas),
        vagas_disponiveis: parseInt(loteVagas),
        data_inicio: new Date(loteDataInicio).toISOString(),
        data_fim: new Date(loteDataFim).toISOString(),
        valor_base: parseFloat(loteValorBase),
      });
      setLotesPorEvento((prev) => ({
        ...prev,
        [eventoId]: [...(prev[eventoId] || []), response.data.lote],
      }));
      resetFormLote();
      setMostrarFormLote(null);
    } catch (err: any) {
      setErroLote(err.response?.data?.erro || 'Erro ao criar lote.');
    } finally {
      setSalvandoLote(false);
    }
  };

  const handleExcluirLote = async (eventoId: string, loteId: string) => {
    if (!confirm('Excluir este lote?')) return;
    try {
      await api.delete(`/lotes/${loteId}`);
      setLotesPorEvento((prev) => ({
        ...prev,
        [eventoId]: (prev[eventoId] || []).filter((l) => l.id !== loteId),
      }));
    } catch (err: any) {
      alert(err.response?.data?.erro || 'Erro ao excluir lote.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Eventos & Lotes</h1>
        <Button onClick={() => setMostrarFormEvento((v) => !v)} className="flex items-center gap-2">
          {mostrarFormEvento ? <X size={16} /> : <Plus size={16} />}
          {mostrarFormEvento ? 'Cancelar' : 'Novo Evento'}
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>}

      {mostrarFormEvento && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleCriarEvento} className="space-y-4">
              {erroEvento && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{erroEvento}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Nome do evento" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Barretos 2026" />
                <Input label="Local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex: Barretos-SP" />
                <Input label="Data de início" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                <Input label="Data de fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
                  <textarea
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    rows={3}
                    className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <Button type="submit" disabled={salvandoEvento}>
                {salvandoEvento ? 'Salvando...' : 'Criar Evento'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-gray-500">Carregando eventos...</p>}

      {!isLoading && eventos.length === 0 && (
        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg">Nenhum evento cadastrado ainda.</div>
      )}

      <div className="space-y-3">
        {eventos.map((evento) => (
          <Card key={evento.id}>
            <CardContent className="p-0">
              <button
                onClick={() => toggleExpandir(evento.id)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <div>
                  <p className="font-bold text-gray-900">{evento.nome}</p>
                  <p className="text-sm text-gray-500">
                    {evento.local} · {new Date(evento.data_inicio).toLocaleDateString('pt-BR')} a {new Date(evento.data_fim).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${evento.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {evento.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleExcluirEvento(evento.id); }}
                    className="text-gray-400 hover:text-red-600 transition-colors p-1"
                    title="Excluir evento"
                  >
                    <Trash2 size={18} />
                  </button>
                  {expandido === evento.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>

              {expandido === evento.id && (
                <div className="border-t border-gray-100 px-6 py-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800">Lotes</h3>
                    <Button
                      variant="outline"
                      onClick={() => setMostrarFormLote(mostrarFormLote === evento.id ? null : evento.id)}
                      className="flex items-center gap-2 text-sm"
                    >
                      {mostrarFormLote === evento.id ? <X size={14} /> : <Plus size={14} />}
                      {mostrarFormLote === evento.id ? 'Cancelar' : 'Novo Lote'}
                    </Button>
                  </div>

                  {mostrarFormLote === evento.id && (
                    <form onSubmit={(e) => handleCriarLote(e, evento.id)} className="space-y-3 bg-gray-50 p-4 rounded-lg">
                      {erroLote && <div className="bg-red-50 text-red-700 p-2 rounded text-sm">{erroLote}</div>}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input label="Nome do lote" value={loteNome} onChange={(e) => setLoteNome(e.target.value)} placeholder="Ex: 1º Lote" />
                        <Input label="Vagas totais" type="number" value={loteVagas} onChange={(e) => setLoteVagas(e.target.value)} />
                        <Input label="Data de início" type="date" value={loteDataInicio} onChange={(e) => setLoteDataInicio(e.target.value)} />
                        <Input label="Data de fim" type="date" value={loteDataFim} onChange={(e) => setLoteDataFim(e.target.value)} />
                        <Input label="Valor base (R$)" type="number" step="0.01" value={loteValorBase} onChange={(e) => setLoteValorBase(e.target.value)} placeholder="1200.00" />
                      </div>
                      <Button type="submit" disabled={salvandoLote}>
                        {salvandoLote ? 'Salvando...' : 'Criar Lote'}
                      </Button>
                    </form>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-700 uppercase">
                        <tr>
                          <th className="px-4 py-2 font-medium">Nome</th>
                          <th className="px-4 py-2 font-medium">Vagas</th>
                          <th className="px-4 py-2 font-medium">Valor base</th>
                          <th className="px-4 py-2 font-medium">Período</th>
                          <th className="px-4 py-2 font-medium text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(lotesPorEvento[evento.id] || []).map((lote) => (
                          <tr key={lote.id}>
                            <td className="px-4 py-2 font-medium">{lote.nome}</td>
                            <td className="px-4 py-2">{lote['vagas_disponíveis']} / {lote.vagas_totais}</td>
                            <td className="px-4 py-2">R$ {parseFloat(lote.valor_base).toFixed(2)}</td>
                            <td className="px-4 py-2">
                              {new Date(lote.data_inicio).toLocaleDateString('pt-BR')} - {new Date(lote.data_fim).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => handleExcluirLote(evento.id, lote.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                title="Excluir lote"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(lotesPorEvento[evento.id] || []).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-gray-500">Nenhum lote cadastrado</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
