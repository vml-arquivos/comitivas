import { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, Button, Input } from '@ui/index';
import { Plus, X, ChevronDown, ChevronUp, Trash2, PackagePlus, MapPin, CalendarDays, ImagePlus } from 'lucide-react';

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

interface Pacote {
  id: string;
  lote_id: string;
  nome: string;
  descricao: string;
  valor_total: string;
  modalidade_hospedagem: 'camping' | 'quarto_ventilador' | 'quarto_ar_condicionado';
  disponibilidade: 'disponivel' | 'ultimas_vagas' | 'esgotado';
  ativo: boolean;
}

interface FotoEvento {
  id: string;
  url_foto: string;
  legenda?: string | null;
  ordem: number;
}

const modalidades: Record<Pacote['modalidade_hospedagem'], { titulo: string; descricao: string }> = {
  camping: { titulo: 'Camping', descricao: 'Vivência coletiva na estrutura de camping da excursão.' },
  quarto_ventilador: { titulo: 'Quarto com ventilador', descricao: 'Hospedagem em quarto com ventilador.' },
  quarto_ar_condicionado: { titulo: 'Quarto com ar-condicionado', descricao: 'Hospedagem em quarto com ar-condicionado.' },
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function EventosAdmin() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarFormEvento, setMostrarFormEvento] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [lotesPorEvento, setLotesPorEvento] = useState<Record<string, Lote[]>>({});
  const [pacotesPorLote, setPacotesPorLote] = useState<Record<string, Pacote[]>>({});
  const [fotosPorEvento, setFotosPorEvento] = useState<Record<string, FotoEvento[]>>({});
  const [mostrarFormLote, setMostrarFormLote] = useState<string | null>(null);
  const [mostrarFormPacote, setMostrarFormPacote] = useState<string | null>(null);

  const [eventoForm, setEventoForm] = useState({ nome: '', descricao: '', dataInicio: '', dataFim: '', local: '' });
  const [loteForm, setLoteForm] = useState({ nome: '', vagas: '', dataInicio: '', dataFim: '', valorBase: '' });
  const [pacoteForm, setPacoteForm] = useState({
    nome: '',
    descricao: '',
    valorTotal: '',
    modalidade: 'quarto_ventilador' as Pacote['modalidade_hospedagem'],
    disponibilidade: 'disponivel' as Pacote['disponibilidade'],
  });
  const [kitForm, setKitForm] = useState({
    camping: { valor: '1900', disponibilidade: 'disponivel' as Pacote['disponibilidade'] },
    quarto_ventilador: { valor: '2200', disponibilidade: 'disponivel' as Pacote['disponibilidade'] },
    quarto_ar_condicionado: { valor: '2600', disponibilidade: 'disponivel' as Pacote['disponibilidade'] },
  });
  const [fotoForm, setFotoForm] = useState({ url: '', legenda: '' });
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const fetchEventos = async () => {
    try {
      setError(null);
      const response = await api.get('/eventos');
      setEventos(response.data.eventos || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar eventos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchEventos(); }, []);

  const carregarLotes = async (eventoId: string) => {
    const response = await api.get(`/lotes/evento/${eventoId}`);
    setLotesPorEvento((prev) => ({ ...prev, [eventoId]: response.data.lotes || [] }));
  };

  const carregarPacotes = async (loteId: string) => {
    const response = await api.get(`/pacotes/lotes/${loteId}/pacotes`);
    setPacotesPorLote((prev) => ({ ...prev, [loteId]: response.data.pacotes || [] }));
  };

  const carregarFotos = async (eventoId: string) => {
    const response = await api.get(`/eventos/${eventoId}/fotos`);
    setFotosPorEvento((prev) => ({ ...prev, [eventoId]: response.data.fotos || [] }));
  };

  const toggleExpandir = async (eventoId: string) => {
    if (expandido === eventoId) {
      setExpandido(null);
      return;
    }
    setExpandido(eventoId);
    try {
      await Promise.all([carregarLotes(eventoId), carregarFotos(eventoId)]);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar lotes do evento.');
    }
  };

  const handleAdicionarFoto = async (e: React.FormEvent, eventoId: string) => {
    e.preventDefault();
    setErroForm(null);
    if (!fotoForm.url.trim()) {
      setErroForm('Informe o caminho ou a URL real da foto.');
      return;
    }
    setSalvando(true);
    try {
      await api.post(`/eventos/${eventoId}/fotos`, {
        url_foto: fotoForm.url.trim(),
        legenda: fotoForm.legenda.trim() || undefined,
      });
      await carregarFotos(eventoId);
      setFotoForm({ url: '', legenda: '' });
    } catch (err: any) {
      setErroForm(err.response?.data?.erro || 'Erro ao vincular foto.');
    } finally {
      setSalvando(false);
    }
  };

  const removerFoto = async (eventoId: string, fotoId: string) => {
    if (!window.confirm('Remover esta foto do álbum do evento? O arquivo original não será apagado.')) return;
    try {
      await api.delete(`/eventos/${eventoId}/fotos/${fotoId}`);
      await carregarFotos(eventoId);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao remover foto.');
    }
  };

  const handleCriarEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroForm(null);
    if (!eventoForm.nome || !eventoForm.local || !eventoForm.dataInicio || !eventoForm.dataFim) {
      setErroForm('Nome, local e período são obrigatórios.');
      return;
    }
    setSalvando(true);
    try {
      const response = await api.post('/eventos', {
        nome: eventoForm.nome,
        descricao: eventoForm.descricao,
        local: eventoForm.local,
        data_inicio: new Date(eventoForm.dataInicio).toISOString(),
        data_fim: new Date(eventoForm.dataFim).toISOString(),
      });
      setEventos((prev) => [response.data.evento, ...prev]);
      setEventoForm({ nome: '', descricao: '', dataInicio: '', dataFim: '', local: '' });
      setMostrarFormEvento(false);
    } catch (err: any) {
      setErroForm(err.response?.data?.erro || 'Erro ao criar evento.');
    } finally {
      setSalvando(false);
    }
  };

  const handleCriarLote = async (e: React.FormEvent, eventoId: string) => {
    e.preventDefault();
    setErroForm(null);
    if (!loteForm.nome || !loteForm.vagas || !loteForm.dataInicio || !loteForm.dataFim || !loteForm.valorBase) {
      setErroForm('Preencha todos os campos do lote.');
      return;
    }
    setSalvando(true);
    try {
      await api.post('/lotes', {
        evento_id: eventoId,
        nome: loteForm.nome,
        vagas_totais: Number(loteForm.vagas),
        vagas_disponiveis: Number(loteForm.vagas),
        data_inicio: new Date(loteForm.dataInicio).toISOString(),
        data_fim: new Date(loteForm.dataFim).toISOString(),
        valor_base: Number(loteForm.valorBase),
      });
      await carregarLotes(eventoId);
      setLoteForm({ nome: '', vagas: '', dataInicio: '', dataFim: '', valorBase: '' });
      setMostrarFormLote(null);
    } catch (err: any) {
      setErroForm(err.response?.data?.erro || 'Erro ao criar lote.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirFormPacote = async (loteId: string) => {
    setErroForm(null);
    setMostrarFormPacote(mostrarFormPacote === loteId ? null : loteId);
    if (!pacotesPorLote[loteId]) {
      try { await carregarPacotes(loteId); } catch (err: any) { setErroForm(err.response?.data?.erro || 'Erro ao carregar pacotes.'); }
    }
  };

  const handleCriarPacote = async (e: React.FormEvent, loteId: string) => {
    e.preventDefault();
    setErroForm(null);
    if (!pacoteForm.nome || !pacoteForm.valorTotal || !pacoteForm.modalidade) {
      setErroForm('Nome, valor e modalidade são obrigatórios.');
      return;
    }
    setSalvando(true);
    try {
      await api.post('/pacotes', {
        lote_id: loteId,
        nome: pacoteForm.nome,
        descricao: pacoteForm.descricao || modalidades[pacoteForm.modalidade].descricao,
        valor_total: Number(pacoteForm.valorTotal),
        itens_selecionados: [],
        modalidade_hospedagem: pacoteForm.modalidade,
        disponibilidade: pacoteForm.disponibilidade,
      });
      await carregarPacotes(loteId);
      setPacoteForm({ nome: '', descricao: '', valorTotal: '', modalidade: 'quarto_ventilador', disponibilidade: 'disponivel' });
      setMostrarFormPacote(null);
    } catch (err: any) {
      setErroForm(err.response?.data?.erro || 'Erro ao publicar pacote.');
    } finally {
      setSalvando(false);
    }
  };

  const handleSincronizarModalidades = async (loteId: string) => {
    setErroForm(null);
    if (Object.values(kitForm).some((item) => !item.valor || Number(item.valor) <= 0)) {
      setErroForm('Informe os três valores antes de sincronizar as modalidades.');
      return;
    }

    setSalvando(true);
    try {
      const existentes = pacotesPorLote[loteId] || [];
      for (const modalidade of Object.keys(kitForm) as Pacote['modalidade_hospedagem'][]) {
        const dados = kitForm[modalidade];
        const existente = existentes.find((pacote) => pacote.modalidade_hospedagem === modalidade);
        const payload = {
          lote_id: loteId,
          nome: modalidades[modalidade].titulo,
          descricao: modalidades[modalidade].descricao,
          valor_total: Number(dados.valor),
          itens_selecionados: [],
          modalidade_hospedagem: modalidade,
          disponibilidade: dados.disponibilidade,
          ativo: true,
        };
        if (existente) {
          await api.put(`/pacotes/${existente.id}`, payload);
        } else {
          await api.post('/pacotes', payload);
        }
      }
      await carregarPacotes(loteId);
    } catch (err: any) {
      setErroForm(err.response?.data?.erro || 'Erro ao sincronizar as três modalidades.');
    } finally {
      setSalvando(false);
    }
  };

  const despublicarPacote = async (loteId: string, pacoteId: string) => {
    if (!window.confirm('Despublicar este pacote? Reservas existentes continuarão preservadas.')) return;
    try {
      await api.delete(`/pacotes/${pacoteId}`);
      await carregarPacotes(loteId);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao despublicar pacote.');
    }
  };

  const excluirEvento = async (eventoId: string) => {
    if (!window.confirm('Excluir este evento? A ação só é permitida sem lotes vinculados.')) return;
    try {
      await api.delete(`/eventos/${eventoId}`);
      setEventos((prev) => prev.filter((evento) => evento.id !== eventoId));
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao excluir evento.');
    }
  };

  const excluirLote = async (eventoId: string, loteId: string) => {
    if (!window.confirm('Excluir este lote?')) return;
    try {
      await api.delete(`/lotes/${loteId}`);
      await carregarLotes(eventoId);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao excluir lote.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-primary p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Central de publicação</p>
            <h1 className="mt-1 text-3xl font-bold">Excursões, lotes e experiências</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-200">Crie a excursão, publique cada modalidade de hospedagem e disponibilize a oferta diretamente no site público.</p>
          </div>
          <Button onClick={() => { setErroForm(null); setMostrarFormEvento((v) => !v); }} className="bg-white text-slate-950 hover:bg-slate-100">
            {mostrarFormEvento ? <X size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}
            {mostrarFormEvento ? 'Cancelar' : 'Nova excursão'}
          </Button>
        </div>
      </section>

      {error && <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}

      {mostrarFormEvento && (
        <Card className="border-primary/20 shadow-lg">
          <CardContent className="p-6">
            <form onSubmit={handleCriarEvento} className="space-y-4">
              <h2 className="text-lg font-bold">Publicar nova excursão</h2>
              {erroForm && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{erroForm}</div>}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input label="Nome da excursão" value={eventoForm.nome} onChange={(e) => setEventoForm({ ...eventoForm, nome: e.target.value })} placeholder="Ex.: Excursão das Comitivas — Barretos 2026" />
                <Input label="Destino / local" value={eventoForm.local} onChange={(e) => setEventoForm({ ...eventoForm, local: e.target.value })} placeholder="Barretos — SP" />
                <Input label="Início" type="date" value={eventoForm.dataInicio} onChange={(e) => setEventoForm({ ...eventoForm, dataInicio: e.target.value })} />
                <Input label="Fim" type="date" value={eventoForm.dataFim} onChange={(e) => setEventoForm({ ...eventoForm, dataFim: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Descrição de venda</label>
                <textarea value={eventoForm.descricao} onChange={(e) => setEventoForm({ ...eventoForm, descricao: e.target.value })} rows={4} className="w-full rounded-md border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Apresente a experiência, os benefícios e a história da excursão." />
              </div>
              <Button type="submit" disabled={salvando}>{salvando ? 'Publicando...' : 'Publicar excursão'}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-gray-500">Carregando excursões...</p>}
      {!isLoading && eventos.length === 0 && <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">Nenhuma excursão publicada. Crie a primeira oferta premium acima.</div>}

      <div className="space-y-4">
        {eventos.map((evento) => (
          <Card key={evento.id} className="overflow-hidden border-gray-200 shadow-sm">
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                <button onClick={() => toggleExpandir(evento.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary"><CalendarDays size={22} /></div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-gray-900">{evento.nome}</h2>
                    <p className="mt-1 flex items-center gap-1 text-sm text-gray-500"><MapPin size={14} /> {evento.local} · {new Date(evento.data_inicio).toLocaleDateString('pt-BR')} a {new Date(evento.data_fim).toLocaleDateString('pt-BR')}</p>
                  </div>
                  {expandido === evento.id ? <ChevronUp className="ml-auto" size={20} /> : <ChevronDown className="ml-auto" size={20} />}
                </button>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${evento.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{evento.ativo ? 'Publicado' : 'Rascunho'}</span>
                  <button onClick={() => excluirEvento(evento.id)} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir evento"><Trash2 size={17} /></button>
                </div>
              </div>

              {expandido === evento.id && (
                <div className="border-t border-gray-100 bg-slate-50 p-6">
                  {evento.descricao && <p className="mb-5 text-sm leading-6 text-gray-600">{evento.descricao}</p>}
                  <div className="mb-4 flex items-center justify-between">
                    <div><h3 className="font-bold text-gray-900">Lotes e modalidades</h3><p className="text-xs text-gray-500">Cada pacote publicado aparece para seleção no fluxo de reservas.</p></div>
                    <Button variant="outline" onClick={() => { setErroForm(null); setMostrarFormLote(mostrarFormLote === evento.id ? null : evento.id); }}>
                      {mostrarFormLote === evento.id ? <X size={15} className="mr-2" /> : <Plus size={15} className="mr-2" />}{mostrarFormLote === evento.id ? 'Cancelar' : 'Novo lote'}
                    </Button>
                  </div>

                  {mostrarFormLote === evento.id && (
                    <form onSubmit={(e) => handleCriarLote(e, evento.id)} className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      {erroForm && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{erroForm}</div>}
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                        <Input label="Nome" value={loteForm.nome} onChange={(e) => setLoteForm({ ...loteForm, nome: e.target.value })} placeholder="1º lote" />
                        <Input label="Vagas" type="number" value={loteForm.vagas} onChange={(e) => setLoteForm({ ...loteForm, vagas: e.target.value })} />
                        <Input label="Início" type="date" value={loteForm.dataInicio} onChange={(e) => setLoteForm({ ...loteForm, dataInicio: e.target.value })} />
                        <Input label="Fim" type="date" value={loteForm.dataFim} onChange={(e) => setLoteForm({ ...loteForm, dataFim: e.target.value })} />
                        <Input label="Valor-base" type="number" step="0.01" value={loteForm.valorBase} onChange={(e) => setLoteForm({ ...loteForm, valorBase: e.target.value })} />
                      </div>
                      <Button type="submit" disabled={salvando} className="mt-4">{salvando ? 'Salvando...' : 'Criar lote'}</Button>
                    </form>
                  )}

                  <div className="space-y-4">
                    {(lotesPorEvento[evento.id] || []).map((lote) => (
                      <div key={lote.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="flex items-center gap-2"><h4 className="font-bold text-gray-900">{lote.nome}</h4><span className="text-xs text-gray-500">{lote['vagas_disponíveis']}/{lote.vagas_totais} vagas</span></div>
                            <p className="mt-1 text-sm text-gray-500">Valor-base: {moeda.format(Number(lote.valor_base))} · {new Date(lote.data_inicio).toLocaleDateString('pt-BR')} a {new Date(lote.data_fim).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => abrirFormPacote(lote.id)}><PackagePlus size={15} className="mr-2" />{mostrarFormPacote === lote.id ? 'Fechar pacotes' : 'Gerir pacotes'}</Button>
                            <button onClick={() => excluirLote(evento.id, lote.id)} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir lote"><Trash2 size={17} /></button>
                          </div>
                        </div>

                        {mostrarFormPacote === lote.id && (
                          <div className="mt-4 border-t border-gray-100 pt-4">
                            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h4 className="font-bold text-secondary">Sincronizar as 3 modalidades</h4>
                                  <p className="text-xs text-slate-600">Cria ou atualiza Camping, Ventilador e Ar-condicionado sobre o mesmo lote.</p>
                                </div>
                                <Button type="button" onClick={() => handleSincronizarModalidades(lote.id)} disabled={salvando}>{salvando ? 'Sincronizando...' : 'Criar/atualizar as 3'}</Button>
                              </div>
                              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                                {(Object.keys(kitForm) as Pacote['modalidade_hospedagem'][]).map((modalidade) => (
                                  <div key={modalidade} className="rounded-lg border border-white bg-white p-3 shadow-sm">
                                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">{modalidades[modalidade].titulo}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <Input label="Valor interno" type="number" step="0.01" value={kitForm[modalidade].valor} onChange={(e) => setKitForm({ ...kitForm, [modalidade]: { ...kitForm[modalidade], valor: e.target.value } })} />
                                      <div>
                                        <label className="mb-1 block text-sm font-medium text-gray-700">Disponibilidade</label>
                                        <select value={kitForm[modalidade].disponibilidade} onChange={(e) => setKitForm({ ...kitForm, [modalidade]: { ...kitForm[modalidade], disponibilidade: e.target.value as Pacote['disponibilidade'] } })} className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                          <option value="disponivel">Disponível</option>
                                          <option value="ultimas_vagas">Últimas vagas</option>
                                          <option value="esgotado">Esgotado</option>
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <form onSubmit={(e) => handleCriarPacote(e, lote.id)} className="rounded-lg bg-slate-50 p-4">
                              {erroForm && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{erroForm}</div>}
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                                <Input label="Nome do pacote" value={pacoteForm.nome} onChange={(e) => setPacoteForm({ ...pacoteForm, nome: e.target.value })} placeholder="Ex.: Conforto Ventilador" />
                                <Input label="Valor final (R$)" type="number" step="0.01" value={pacoteForm.valorTotal} onChange={(e) => setPacoteForm({ ...pacoteForm, valorTotal: e.target.value })} />
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">Modalidade</label>
                                  <select value={pacoteForm.modalidade} onChange={(e) => setPacoteForm({ ...pacoteForm, modalidade: e.target.value as Pacote['modalidade_hospedagem'] })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                    <option value="camping">Camping</option><option value="quarto_ventilador">Quarto com ventilador</option><option value="quarto_ar_condicionado">Quarto com ar-condicionado</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">Disponibilidade</label>
                                  <select value={pacoteForm.disponibilidade} onChange={(e) => setPacoteForm({ ...pacoteForm, disponibilidade: e.target.value as Pacote['disponibilidade'] })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                    <option value="disponivel">Disponível</option><option value="ultimas_vagas">Últimas vagas</option><option value="esgotado">Esgotado</option>
                                  </select>
                                </div>
                                <div className="flex items-end"><Button type="submit" disabled={salvando} className="w-full">{salvando ? 'Publicando...' : 'Publicar pacote'}</Button></div>
                              </div>
                              <textarea value={pacoteForm.descricao} onChange={(e) => setPacoteForm({ ...pacoteForm, descricao: e.target.value })} rows={2} className="mt-3 w-full rounded-md border border-gray-300 p-2 text-sm" placeholder="Descrição comercial desta modalidade (opcional)." />
                            </form>
                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                              {(pacotesPorLote[lote.id] || []).map((pacote) => (
                                <article key={pacote.id} className="rounded-lg border border-gray-200 bg-white p-4">
                                  <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-gray-900">{pacote.nome}</p><p className="text-xs font-medium text-primary">{modalidades[pacote.modalidade_hospedagem]?.titulo || pacote.modalidade_hospedagem}</p><span className={`mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-bold uppercase ${pacote.disponibilidade === 'esgotado' ? 'bg-slate-800 text-white' : pacote.disponibilidade === 'ultimas_vagas' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{pacote.disponibilidade === 'esgotado' ? 'Esgotado' : pacote.disponibilidade === 'ultimas_vagas' ? 'Últimas vagas' : 'Disponível'}</span></div><button onClick={() => despublicarPacote(lote.id, pacote.id)} className="text-gray-400 hover:text-red-600" title="Despublicar"><Trash2 size={16} /></button></div>
                                  <p className="mt-2 text-sm text-gray-500">{pacote.descricao}</p><p className="mt-3 text-lg font-bold text-slate-900">{moeda.format(Number(pacote.valor_total))}</p>
                                </article>
                              ))}
                              {(pacotesPorLote[lote.id] || []).length === 0 && <p className="col-span-full py-4 text-center text-sm text-gray-500">Nenhum pacote publicado neste lote. Crie as modalidades Camping, Ventilador e Ar-condicionado.</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {(lotesPorEvento[evento.id] || []).length === 0 && <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">Nenhum lote cadastrado nesta excursão.</p>}
                  </div>

                  <section className="mt-8 border-t border-gray-200 pt-6">
                    <div className="mb-4">
                      <h3 className="flex items-center gap-2 font-bold text-gray-900"><ImagePlus size={18} className="text-primary" /> Galeria deste evento</h3>
                      <p className="mt-1 text-xs text-gray-500">Vincule fotos reais já publicadas em <code>/images/</code> ou em uma URL HTTPS. Elas aparecem automaticamente na História e na Galeria pública.</p>
                    </div>
                    <form onSubmit={(e) => handleAdicionarFoto(e, evento.id)} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      {erroForm && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{erroForm}</div>}
                      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto] md:items-end">
                        <Input label="Caminho ou URL da foto" value={fotoForm.url} onChange={(e) => setFotoForm({ ...fotoForm, url: e.target.value })} placeholder="/images/gallery/nome-da-foto.jpg" />
                        <Input label="Legenda acessível" value={fotoForm.legenda} onChange={(e) => setFotoForm({ ...fotoForm, legenda: e.target.value })} placeholder="Ex.: Arena de Barretos, edição 2025" />
                        <Button type="submit" disabled={salvando}>{salvando ? 'Vinculando...' : 'Vincular foto'}</Button>
                      </div>
                    </form>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {(fotosPorEvento[evento.id] || []).map((foto) => (
                        <article key={foto.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white">
                          <div className="relative aspect-video bg-slate-100">
                            <img src={foto.url_foto} alt={foto.legenda || `Foto de ${evento.nome}`} className="h-full w-full object-cover" loading="lazy" />
                            <button type="button" onClick={() => removerFoto(evento.id, foto.id)} className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100 focus:opacity-100" title="Remover vínculo"><Trash2 size={14} /></button>
                          </div>
                          <p className="line-clamp-2 p-3 text-xs text-gray-600">{foto.legenda || 'Sem legenda cadastrada'}</p>
                        </article>
                      ))}
                      {(fotosPorEvento[evento.id] || []).length === 0 && <p className="col-span-full rounded-lg border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">Nenhuma foto vinculada a este evento.</p>}
                    </div>
                  </section>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
