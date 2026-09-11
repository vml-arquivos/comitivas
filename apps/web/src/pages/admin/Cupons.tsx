import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, Button, Input } from '@ui/index';
import { Pencil, Plus, X, Trash2 } from 'lucide-react';

interface Evento {
  id: string;
  nome: string;
}

interface Cupom {
  id: string;
  codigo: string;
  desconto_percentual: string | null;
  desconto_fixo: string | null;
  uso_maximo: number | null;
  limite_por_cliente: number | null;
  pacote_id: string | null;
  vendedor_id: string | null;
  campanha: string | null;
  uso_atual: number;
  validade: string | null;
  ativo: boolean;
  valor_minimo?: string | null;
}

export default function Cupons() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [eventoId, setEventoId] = useState<string>('');
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [codigo, setCodigo] = useState('');
  const [tipoDesconto, setTipoDesconto] = useState<'percentual' | 'fixo'>('percentual');
  const [valorDesconto, setValorDesconto] = useState('');
  const [usoMaximo, setUsoMaximo] = useState('');
  const [limiteCliente, setLimiteCliente] = useState('');
  const [pacoteId, setPacoteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [campanha, setCampanha] = useState('');
  const [valorMinimo, setValorMinimo] = useState('');
  const [validade, setValidade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);

  useEffect(() => {
    const fetchEventos = async () => {
      try {
        const [eventosResponse, vendedoresResponse] = await Promise.all([api.get('/eventos'), api.get('/admin/usuarios?tipo=vendedor')]);
        const lista: Evento[] = eventosResponse.data.eventos || [];
        setEventos(lista);
        setVendedores(vendedoresResponse.data.usuarios || []);
        if (lista.length > 0) {
          setEventoId(lista[0].id);
        } else {
          setIsLoading(false);
        }
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar eventos.');
        setIsLoading(false);
      }
    };
    fetchEventos();
  }, []);

  useEffect(() => {
    if (!eventoId) return;

    const fetchCupons = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/cupons/evento/${eventoId}`);
        setCupons(response.data.cupons || []);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar cupons.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchCupons();
  }, [eventoId]);

  const resetForm = () => {
    setCodigo('');
    setTipoDesconto('percentual');
    setValorDesconto('');
    setUsoMaximo('');
    setLimiteCliente('');
    setPacoteId('');
    setVendedorId('');
    setCampanha('');
    setValorMinimo('');
    setValidade('');
    setFormErro(null);
    setEditandoId(null);
  };

  const editar = (cupom: Cupom) => {
    setEditandoId(cupom.id);
    setCodigo(cupom.codigo);
    const percentual = cupom.desconto_percentual != null;
    setTipoDesconto(percentual ? 'percentual' : 'fixo');
    setValorDesconto(String(percentual ? cupom.desconto_percentual : cupom.desconto_fixo || ''));
    setUsoMaximo(cupom.uso_maximo == null ? '' : String(cupom.uso_maximo));
    setLimiteCliente(cupom.limite_por_cliente == null ? '' : String(cupom.limite_por_cliente));
    setPacoteId(cupom.pacote_id || '');
    setVendedorId(cupom.vendedor_id || '');
    setCampanha(cupom.campanha || '');
    setValorMinimo(cupom.valor_minimo || '');
    setValidade(cupom.validade ? new Date(cupom.validade).toISOString().slice(0, 10) : '');
    setMostrarForm(true);
  };

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro(null);

    if (!codigo || !valorDesconto) {
      setFormErro('Código e valor de desconto são obrigatórios.');
      return;
    }

    setSalvando(true);
    try {
      const payload: any = {
        evento_id: eventoId, codigo,
        uso_maximo: usoMaximo ? parseInt(usoMaximo) : null,
        limite_por_cliente: limiteCliente ? parseInt(limiteCliente) : null,
        pacote_id: pacoteId || null, vendedor_id: vendedorId || null,
        campanha: campanha || null,
        valor_minimo: valorMinimo ? parseFloat(valorMinimo) : null,
        validade: validade || null,
        ativo: true,
      };
      if (tipoDesconto === 'percentual') {
        payload.desconto_percentual = parseFloat(valorDesconto);
        payload.desconto_fixo = null;
      } else {
        payload.desconto_fixo = parseFloat(valorDesconto);
        payload.desconto_percentual = null;
      }
      const response = editandoId ? await api.put(`/cupons/${editandoId}`, payload) : await api.post('/cupons/criar', payload);
      setCupons((prev) => editandoId ? prev.map((item) => item.id === editandoId ? response.data.cupom : item) : [...prev, response.data.cupom]);
      resetForm();
      setMostrarForm(false);
    } catch (err: any) {
      setFormErro(err.response?.data?.erro || 'Erro ao criar cupom.');
    } finally {
      setSalvando(false);
    }
  };

  const handleDesativar = async (cupomId: string) => {
    if (!confirm('Desativar este cupom?')) return;
    try {
      await api.delete(`/cupons/${cupomId}`);
      setCupons((prev) =>
        prev.map((c) => (c.id === cupomId ? { ...c, ativo: false } : c))
      );
    } catch (err: any) {
      alert(err.response?.data?.erro || 'Erro ao desativar cupom.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Cupons de Desconto</h1>
        <Button
          onClick={() => {
            if (mostrarForm) resetForm();
            setMostrarForm((v) => !v);
          }}
          className="flex items-center gap-2"
          disabled={!eventoId}
        >
          {mostrarForm ? <X size={16} /> : <Plus size={16} />}
          {mostrarForm ? 'Cancelar' : 'Novo cupom'}
        </Button>
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

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
      )}

      {eventos.length === 0 && !isLoading && !error && (
        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg">
          Crie um evento primeiro para poder cadastrar cupons.
        </div>
      )}

      {mostrarForm && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleCriar} className="space-y-4">
              {formErro && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{formErro}</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Código do cupom"
                  disabled={Boolean(editandoId)}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  placeholder="EX: BARR2026"
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de desconto</label>
                  <select
                    value={tipoDesconto}
                    onChange={(e) => setTipoDesconto(e.target.value as 'percentual' | 'fixo')}
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="percentual">Percentual (%)</option>
                    <option value="fixo">Valor fixo (R$)</option>
                  </select>
                </div>
                <Input
                  label={tipoDesconto === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'}
                  type="number"
                  step="0.01"
                  value={valorDesconto}
                  onChange={(e) => setValorDesconto(e.target.value)}
                  placeholder={tipoDesconto === 'percentual' ? '10' : '100.00'}
                />
                <Input
                  label="Uso máximo (opcional)"
                  type="number"
                  value={usoMaximo}
                  onChange={(e) => setUsoMaximo(e.target.value)}
                  placeholder="Ilimitado"
                />
                <Input
                  label="Validade (opcional)"
                  type="date"
                  value={validade}
                  onChange={(e) => setValidade(e.target.value)}
                />
                <Input label="Limite por cliente" type="number" min="1" value={limiteCliente} onChange={(e) => setLimiteCliente(e.target.value)} placeholder="Ilimitado" />
                <Input label="Campanha (opcional)" value={campanha} onChange={(e) => setCampanha(e.target.value)} placeholder="Ex.: influenciador" />
                <Input label="Valor mínimo (R$)" type="number" min="0" step="0.01" value={valorMinimo} onChange={(e) => setValorMinimo(e.target.value)} placeholder="Sem mínimo" />
                <Input label="ID do pacote (opcional)" value={pacoteId} onChange={(e) => setPacoteId(e.target.value)} placeholder="Escopo por modalidade" />
                <label className="text-sm font-medium text-gray-700">Vendedor (opcional)<select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="mt-1 flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">Qualquer origem</option>{vendedores.map((vendedor) => <option key={vendedor.id} value={vendedor.id}>{vendedor.nome}</option>)}</select></label>
              </div>
              <Button type="submit" disabled={salvando}>
                {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Criar cupom'}
              </Button>
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
                  <th className="px-6 py-4 font-medium">Código</th>
                  <th className="px-6 py-4 font-medium">Desconto</th>
                  <th className="px-6 py-4 font-medium">Uso</th>
                  <th className="px-6 py-4 font-medium">Validade</th>
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
                {!isLoading && cupons.map((cupom) => (
                  <tr key={cupom.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-bold text-gray-900">{cupom.codigo}</td>
                    <td className="px-6 py-4">
                      {cupom.desconto_percentual
                        ? `${parseFloat(cupom.desconto_percentual)}%`
                        : cupom.desconto_fixo
                        ? `R$ ${parseFloat(cupom.desconto_fixo).toFixed(2)}`
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {cupom.uso_atual} / {cupom.uso_maximo ?? '∞'}
                    </td>
                    <td className="px-6 py-4">
                      {cupom.validade ? new Date(cupom.validade).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        cupom.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {cupom.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => editar(cupom)} className="p-1 text-gray-500 transition-colors hover:text-primary" title="Editar ou prorrogar cupom"><Pencil size={18} /></button>
                      {cupom.ativo && (
                        <button
                          onClick={() => handleDesativar(cupom.id)}
                          className="text-gray-500 hover:text-red-600 transition-colors p-1"
                          title="Desativar cupom"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!isLoading && cupons.length === 0 && eventoId && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Nenhum cupom cadastrado para este evento</td>
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
