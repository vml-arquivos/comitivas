import { useEffect, useMemo, useState } from 'react';
import { BedDouble, MoveRight, Plus, RefreshCw, Trash2, UserMinus } from 'lucide-react';
import { Button, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';
import { AdminModal } from '../../components/admin/AdminModal';

const vazio = { nome: '', genero: 'feminino', capacidade: '4', pacote_id: '', observacoes: '' };

export default function HospedagemQuartos() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [pacotes, setPacotes] = useState<any[]>([]);
  const [loteId, setLoteId] = useState('');
  const [mapa, setMapa] = useState<any | null>(null);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form, setForm] = useState(vazio);
  const [reservaId, setReservaId] = useState('');
  const [quartoId, setQuartoId] = useState('');
  const [movendo, setMovendo] = useState<any | null>(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregarMapa = async (id = loteId) => {
    if (!id) return setMapa(null);
    const [mapaRes, pacotesRes] = await Promise.all([api.get(`/hospedagem/lotes/${id}`), api.get(`/pacotes/lotes/${id}/pacotes`)]);
    setMapa(mapaRes.data);
    setPacotes(pacotesRes.data.pacotes || []);
  };
  const carregar = async () => {
    setErro('');
    try {
      const eventosRes = await api.get('/eventos');
      const lista = eventosRes.data.eventos || [];
      setEventos(lista);
      const respostas = await Promise.all(lista.map((e: any) => api.get(`/lotes/evento/${e.id}`)));
      const lotesLista = respostas.flatMap((r) => r.data.lotes || []);
      setLotes(lotesLista);
      const atual = lotesLista.some((l: any) => l.id === loteId) ? loteId : lotesLista[0]?.id || '';
      setLoteId(atual);
      await carregarMapa(atual);
    } catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível carregar a hospedagem.'); }
  };
  useEffect(() => { void carregar(); }, []);

  const loteComEvento = useMemo(() => lotes.map((lote) => ({ ...lote, evento_nome: eventos.find((e) => e.id === lote.evento_id)?.nome || 'Excursão' })), [lotes, eventos]);
  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    setSalvando(true); setErro(''); setMensagem('');
    try { await acao(); setMensagem(sucesso); await carregarMapa(); return true; }
    catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível concluir a ação.'); return false; }
    finally { setSalvando(false); }
  };
  const abrirNovo = () => { setEditando(null); setForm(vazio); setModal(true); };
  const abrirEdicao = (q: any) => { setEditando(q); setForm({ nome: q.nome, genero: q.genero, capacidade: String(q.capacidade), pacote_id: q.pacote_id || '', observacoes: q.observacoes || '' }); setModal(true); };
  const salvarQuarto = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await executar(() => editando
      ? api.patch(`/hospedagem/lotes/${loteId}/quartos/${editando.id}`, { ...form, capacidade: Number(form.capacidade) })
      : api.post(`/hospedagem/lotes/${loteId}/quartos`, { ...form, capacidade: Number(form.capacidade) }), editando ? 'Quarto atualizado.' : 'Quarto criado.');
    if (ok) setModal(false);
  };
  const alocarOuMover = async () => {
    if (!quartoId || (!movendo && !reservaId)) return;
    const ok = await executar(() => movendo
      ? api.post(`/hospedagem/alocacoes/${movendo.id}/mover`, { quarto_id: quartoId })
      : api.post(`/hospedagem/quartos/${quartoId}/alocacoes`, { reserva_id: reservaId }), movendo ? 'Hóspede remanejado.' : 'Hóspede alocado.');
    if (ok) { setMovendo(null); setReservaId(''); setQuartoId(''); }
  };

  return <div className="admin-page">
    <div className="admin-page-header"><div><p className="admin-eyebrow">Operação da hospedagem</p><h1 className="admin-title">Quartos e hóspedes</h1><p className="admin-subtitle">Organize quartos masculinos e femininos, capacidade, ocupantes e remanejamentos.</p></div><div className="flex gap-2"><Button onClick={abrirNovo} disabled={!loteId}><Plus size={16} className="mr-2" />Novo quarto</Button><Button variant="outline" onClick={() => void carregar()}><RefreshCw size={16} className="mr-2" />Atualizar</Button></div></div>
    {erro && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{erro}</div>}{mensagem && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{mensagem}</div>}
    <section className="admin-card p-5"><label className="block text-sm font-medium">Viagem e período<select className="admin-field mt-1" value={loteId} onChange={(e) => { setLoteId(e.target.value); void carregarMapa(e.target.value); }}><option value="">Selecione</option>{loteComEvento.map((l) => <option key={l.id} value={l.id}>{l.evento_nome} · {l.nome}</option>)}</select></label></section>
    {mapa && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[['Quartos', mapa.resumo.quartos], ['Vagas', mapa.resumo.capacidade], ['Ocupadas', mapa.resumo.ocupadas], ['Livres', mapa.resumo.livres], ['Feminino / masculino', `${mapa.resumo.femininas} / ${mapa.resumo.masculinas}`]].map(([r, v]) => <div key={String(r)} className="admin-metric-card"><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500">{r}</p><p className="mt-1 text-2xl font-semibold text-[#073F50]">{v}</p></div>)}</div>
      <section className="admin-card grid gap-3 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <div><label className="text-sm font-medium">{movendo ? `Remanejar ${movendo.cliente_nome}` : 'Hóspede sem quarto'}</label>{movendo ? <p className="admin-field mt-1 flex items-center">Quarto atual: {movendo.quarto_nome} · vaga {movendo.numero_vaga}</p> : <select className="admin-field mt-1" value={reservaId} onChange={(e) => setReservaId(e.target.value)}><option value="">Selecione</option>{mapa.reservas_disponiveis.map((r: any) => <option key={r.id} value={r.id}>{r.cliente_nome} · {r.pacote_nome || 'sem modalidade'}</option>)}</select>}</div>
        <label className="text-sm font-medium">Quarto de destino<select className="admin-field mt-1" value={quartoId} onChange={(e) => setQuartoId(e.target.value)}><option value="">Selecione</option>{mapa.quartos.filter((q: any) => q.livres > 0 && q.id !== movendo?.quarto_id).map((q: any) => <option key={q.id} value={q.id}>{q.nome} · {q.genero} · {q.livres} livre(s)</option>)}</select></label>
        <div className="flex gap-2"><Button disabled={salvando || !quartoId || (!movendo && !reservaId)} onClick={() => void alocarOuMover()}>{movendo ? 'Confirmar mudança' : 'Alocar'}</Button>{movendo && <Button variant="outline" onClick={() => { setMovendo(null); setQuartoId(''); }}>Cancelar</Button>}</div>
      </section>
      <div className="grid gap-4 xl:grid-cols-2">{mapa.quartos.map((q: any) => <article key={q.id} className="admin-card overflow-hidden"><header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5"><div><div className="flex items-center gap-2"><BedDouble size={19} className="text-[#DF6248]" /><h2 className="text-lg font-semibold text-[#073F50]">{q.nome}</h2><span className={`admin-status ${q.genero === 'feminino' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}>{q.genero}</span></div><p className="mt-1 text-sm text-slate-500">{q.ocupadas}/{q.capacidade} ocupadas · {q.pacote_nome || 'Todos os pacotes'}</p></div><div className="flex gap-1"><Button variant="outline" onClick={() => abrirEdicao(q)}>Editar</Button><Button variant="outline" className="text-red-700" onClick={() => { if (confirm('Excluir este quarto?')) void executar(() => api.delete(`/hospedagem/quartos/${q.id}`), 'Quarto excluído da operação.'); }}><Trash2 size={15} /></Button></div></header><div className="divide-y divide-slate-100">{mapa.alocacoes.filter((a: any) => a.quarto_id === q.id).map((a: any) => <div key={a.id} className="flex items-center gap-3 p-4"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff0eb] text-sm font-semibold text-[#b8442e]">{a.numero_vaga}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.cliente_nome}</p><p className="truncate text-xs text-slate-500">{a.pacote_nome || a.cliente_email}</p></div><Button variant="outline" onClick={() => { setMovendo(a); setReservaId(''); setQuartoId(''); }}><MoveRight size={15} className="mr-1" />Remanejar</Button><Button variant="outline" aria-label="Liberar vaga" onClick={() => { if (confirm('Liberar esta vaga mantendo o histórico?')) void executar(() => api.delete(`/hospedagem/alocacoes/${a.id}`, { data: { motivo: 'Liberação pelo mapa de quartos' } }), 'Vaga liberada.'); }}><UserMinus size={15} /></Button></div>)}{Number(q.ocupadas) === 0 && <p className="p-5 text-sm text-slate-500">Nenhum hóspede alocado.</p>}</div></article>)}</div>
    </>}
    <AdminModal aberto={modal} titulo={editando ? 'Editar quarto' : 'Novo quarto'} descricao="A capacidade controla automaticamente as vagas disponíveis." fechar={() => setModal(false)}><form onSubmit={salvarQuarto} className="space-y-4"><Input required label="Nome / número" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Grupo<select className="admin-field mt-1" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })}><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label><Input required label="Quantidade de vagas" type="number" min="1" max="30" value={form.capacidade} onChange={(e) => setForm({ ...form, capacidade: e.target.value })} /></div><label className="text-sm font-medium">Pacote específico (opcional)<select className="admin-field mt-1" value={form.pacote_id} onChange={(e) => setForm({ ...form, pacote_id: e.target.value })}><option value="">Todos os pacotes do período</option>{pacotes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><label className="text-sm font-medium">Observações<textarea className="admin-field mt-1 min-h-24" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal(false)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar quarto'}</Button></div></form></AdminModal>
  </div>;
}
