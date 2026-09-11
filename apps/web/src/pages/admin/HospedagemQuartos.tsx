import { useEffect, useMemo, useState } from 'react';
import { BedDouble, Building2, Layers3, MapPin, MoveRight, Plus, RefreshCw, Trash2, UserMinus } from 'lucide-react';
import { Button, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';
import { AdminModal } from '../../components/admin/AdminModal';

type Genero = 'feminino' | 'masculino';
type Climatizacao = 'ar_condicionado' | 'ventilador' | 'sem_climatizacao';

type ConfiguracaoLote = {
  quantidade: string;
  genero: Genero;
  capacidade: string;
  climatizacao: Climatizacao;
  pacote_id: string;
  observacoes: string;
};

type FormQuarto = {
  nome: string;
  local_hospedagem: string;
  genero: Genero;
  capacidade: string;
  pacote_id: string;
  observacoes: string;
};

const vazio: FormQuarto = {
  nome: '',
  local_hospedagem: '',
  genero: 'feminino',
  capacidade: '4',
  pacote_id: '',
  observacoes: '',
};

const novaConfiguracao = (): ConfiguracaoLote => ({
  quantidade: '1',
  genero: 'feminino',
  capacidade: '4',
  climatizacao: 'ar_condicionado',
  pacote_id: '',
  observacoes: '',
});

function climaDoQuarto(observacoes?: string | null) {
  const linha = String(observacoes || '').split('\n').find((item) => item.toLowerCase().startsWith('climatização:'));
  return linha?.split(':').slice(1).join(':').trim() || '';
}

function nomeLocal(valor?: string | null) {
  return String(valor || '').trim() || 'Local não informado';
}

export default function HospedagemQuartos() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [pacotes, setPacotes] = useState<any[]>([]);
  const [loteId, setLoteId] = useState('');
  const [mapa, setMapa] = useState<any | null>(null);
  const [modal, setModal] = useState(false);
  const [modalLote, setModalLote] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form, setForm] = useState<FormQuarto>(vazio);
  const [tituloLote, setTituloLote] = useState('');
  const [localHospedagem, setLocalHospedagem] = useState('');
  const [configuracoes, setConfiguracoes] = useState<ConfiguracaoLote[]>([novaConfiguracao()]);
  const [reservaId, setReservaId] = useState('');
  const [quartoId, setQuartoId] = useState('');
  const [movendo, setMovendo] = useState<any | null>(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregarMapa = async (id = loteId) => {
    if (!id) return setMapa(null);
    const [mapaRes, pacotesRes] = await Promise.all([
      api.get(`/hospedagem/lotes/${id}`),
      api.get(`/pacotes/lotes/${id}/pacotes`),
    ]);
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
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível carregar a hospedagem.');
    }
  };

  useEffect(() => { void carregar(); }, []);

  const loteComEvento = useMemo(
    () => lotes.map((lote) => ({ ...lote, evento_nome: eventos.find((e) => e.id === lote.evento_id)?.nome || 'Excursão' })),
    [lotes, eventos],
  );

  const totalNovosQuartos = useMemo(
    () => configuracoes.reduce((total, item) => total + Math.max(0, Number(item.quantidade) || 0), 0),
    [configuracoes],
  );

  const totalNovasVagas = useMemo(
    () => configuracoes.reduce((total, item) => total + (Math.max(0, Number(item.quantidade) || 0) * Math.max(0, Number(item.capacidade) || 0)), 0),
    [configuracoes],
  );

  const quartosPorLocal = useMemo(() => {
    const grupos = new Map<string, any[]>();
    for (const quarto of mapa?.quartos || []) {
      const local = nomeLocal(quarto.local_hospedagem);
      grupos.set(local, [...(grupos.get(local) || []), quarto]);
    }
    return Array.from(grupos.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [mapa?.quartos]);

  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    setSalvando(true);
    setErro('');
    setMensagem('');
    try {
      await acao();
      setMensagem(sucesso);
      await carregarMapa();
      return true;
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível concluir a ação.');
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const abrirNovo = () => {
    setEditando(null);
    setForm(vazio);
    setModal(true);
  };

  const abrirLote = () => {
    setTituloLote('');
    setLocalHospedagem('');
    setConfiguracoes([novaConfiguracao()]);
    setModalLote(true);
  };

  const abrirEdicao = (quarto: any) => {
    setEditando(quarto);
    setForm({
      nome: quarto.nome,
      local_hospedagem: quarto.local_hospedagem || '',
      genero: quarto.genero,
      capacidade: String(quarto.capacidade),
      pacote_id: quarto.pacote_id || '',
      observacoes: quarto.observacoes || '',
    });
    setModal(true);
  };

  const salvarQuarto = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { ...form, capacidade: Number(form.capacidade) };
    const ok = await executar(
      () => editando
        ? api.patch(`/hospedagem/lotes/${loteId}/quartos/${editando.id}`, payload)
        : api.post(`/hospedagem/lotes/${loteId}/quartos`, payload),
      editando ? 'Quarto atualizado.' : 'Quarto criado.',
    );
    if (ok) setModal(false);
  };

  const atualizarConfiguracao = (indice: number, campo: keyof ConfiguracaoLote, valor: string) => {
    setConfiguracoes((atual) => atual.map((item, i) => i === indice ? { ...item, [campo]: valor } : item));
  };

  const salvarLote = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      titulo: tituloLote,
      local_hospedagem: localHospedagem,
      configuracoes: configuracoes.map((item) => ({
        ...item,
        quantidade: Number(item.quantidade),
        capacidade: Number(item.capacidade),
      })),
    };
    const ok = await executar(
      () => api.post(`/hospedagem/lotes/${loteId}/quartos/lote`, payload),
      `${totalNovosQuartos} quarto(s) criado(s), com ${totalNovasVagas} vaga(s).`,
    );
    if (ok) setModalLote(false);
  };

  const alocarOuMover = async () => {
    if (!quartoId || (!movendo && !reservaId)) return;
    const ok = await executar(
      () => movendo
        ? api.post(`/hospedagem/alocacoes/${movendo.id}/mover`, { quarto_id: quartoId })
        : api.post(`/hospedagem/quartos/${quartoId}/alocacoes`, { reserva_id: reservaId }),
      movendo ? 'Hóspede remanejado.' : 'Hóspede alocado.',
    );
    if (ok) {
      setMovendo(null);
      setReservaId('');
      setQuartoId('');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Operação da hospedagem</p>
          <h1 className="admin-title">Quartos e hóspedes</h1>
          <p className="admin-subtitle">Organize os locais de hospedagem, quartos, vagas e hóspedes da excursão.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={abrirLote} disabled={!loteId}><Layers3 size={16} className="mr-2" />Quartos em lote</Button>
          <Button variant="outline" onClick={abrirNovo} disabled={!loteId}><Plus size={16} className="mr-2" />Quarto avulso</Button>
          <Button variant="outline" onClick={() => void carregar()}><RefreshCw size={16} className="mr-2" />Atualizar</Button>
        </div>
      </div>

      {erro && <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">{mensagem}</div>}

      <section className="admin-card p-5">
        <label className="block text-sm font-medium">Viagem e período
          <select className="admin-field mt-1" value={loteId} onChange={(e) => { setLoteId(e.target.value); void carregarMapa(e.target.value); }}>
            <option value="">Selecione</option>
            {loteComEvento.map((l) => <option key={l.id} value={l.id}>{l.evento_nome} · {l.nome}</option>)}
          </select>
        </label>
      </section>

      {mapa && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Locais', mapa.resumo.locais ?? 0],
            ['Quartos', mapa.resumo.quartos],
            ['Vagas', mapa.resumo.capacidade],
            ['Ocupadas', mapa.resumo.ocupadas],
            ['Livres', mapa.resumo.livres],
            ['Feminino / masculino', `${mapa.resumo.femininas} / ${mapa.resumo.masculinas}`],
          ].map(([rotulo, valor]) => (
            <div key={String(rotulo)} className="admin-metric-card">
              <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500">{rotulo}</p>
              <p className="mt-1 text-2xl font-semibold text-[#073F50]">{valor}</p>
            </div>
          ))}
        </div>

        <section className="admin-card grid gap-3 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div>
            <label className="text-sm font-medium">{movendo ? `Remanejar ${movendo.cliente_nome}` : 'Hóspede sem quarto'}</label>
            {movendo ? (
              <p className="admin-field mt-1 flex items-center">Atual: {movendo.local_hospedagem ? `${movendo.local_hospedagem} · ` : ''}{movendo.quarto_nome} · vaga {movendo.numero_vaga}</p>
            ) : (
              <select className="admin-field mt-1" value={reservaId} onChange={(e) => setReservaId(e.target.value)}>
                <option value="">Selecione</option>
                {mapa.reservas_disponiveis.map((r: any) => <option key={r.id} value={r.id}>{r.cliente_nome} · {r.pacote_nome || 'sem modalidade'}</option>)}
              </select>
            )}
          </div>
          <label className="text-sm font-medium">Quarto de destino
            <select className="admin-field mt-1" value={quartoId} onChange={(e) => setQuartoId(e.target.value)}>
              <option value="">Selecione</option>
              {mapa.quartos
                .filter((q: any) => q.livres > 0 && q.id !== movendo?.quarto_id)
                .map((q: any) => <option key={q.id} value={q.id}>{nomeLocal(q.local_hospedagem)} · {q.nome} · {q.livres} livre(s)</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <Button disabled={salvando || !quartoId || (!movendo && !reservaId)} onClick={() => void alocarOuMover()}>{movendo ? 'Confirmar mudança' : 'Alocar'}</Button>
            {movendo && <Button variant="outline" onClick={() => { setMovendo(null); setQuartoId(''); }}>Cancelar</Button>}
          </div>
        </section>

        {quartosPorLocal.length === 0 ? (
          <section className="admin-card p-8 text-center text-sm text-slate-500">Nenhum quarto cadastrado neste período.</section>
        ) : (
          <div className="space-y-5">
            {quartosPorLocal.map(([local, quartos]) => (
              <section key={local} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#073F50] text-white"><Building2 size={18} /></span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.08em] text-slate-500">Local de hospedagem</p>
                    <h2 className="text-lg font-bold text-[#073F50]">{local}</h2>
                  </div>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {quartos.map((q: any) => (
                    <article key={q.id} className="admin-card overflow-hidden">
                      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <BedDouble size={19} className="text-[#DF6248]" />
                            <h3 className="text-base font-semibold text-[#073F50] sm:text-lg">{q.nome}</h3>
                            <span className={`admin-status ${q.genero === 'feminino' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}>{q.genero}</span>
                            {climaDoQuarto(q.observacoes) && <span className="admin-status bg-amber-50 text-amber-800">{climaDoQuarto(q.observacoes)}</span>}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{q.ocupadas}/{q.capacidade} ocupadas · {q.pacote_nome || 'Todos os pacotes'}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="outline" onClick={() => abrirEdicao(q)}>Editar</Button>
                          <Button variant="outline" className="text-red-700" onClick={() => { if (confirm('Excluir este quarto?')) void executar(() => api.delete(`/hospedagem/quartos/${q.id}`), 'Quarto excluído da operação.'); }}><Trash2 size={15} /></Button>
                        </div>
                      </header>
                      <div className="divide-y divide-slate-100">
                        {mapa.alocacoes.filter((a: any) => a.quarto_id === q.id).map((a: any) => (
                          <div key={a.id} className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff0eb] text-sm font-semibold text-[#b8442e]">{a.numero_vaga}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{a.cliente_nome}</p>
                              <p className="truncate text-xs text-slate-500">{a.pacote_nome || a.cliente_email}</p>
                            </div>
                            <Button variant="outline" onClick={() => { setMovendo(a); setReservaId(''); setQuartoId(''); }}><MoveRight size={15} className="mr-1" />Remanejar</Button>
                            <Button variant="outline" aria-label="Liberar vaga" onClick={() => { if (confirm('Liberar esta vaga mantendo o histórico?')) void executar(() => api.delete(`/hospedagem/alocacoes/${a.id}`, { data: { motivo: 'Liberação pelo mapa de quartos' } }), 'Vaga liberada.'); }}><UserMinus size={15} /></Button>
                          </div>
                        ))}
                        {Number(q.ocupadas) === 0 && <p className="p-5 text-sm text-slate-500">Nenhum hóspede alocado.</p>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </>}

      <AdminModal aberto={modalLote} titulo="Quartos em lote" descricao="Defina o local, o nome e as quantidades." fechar={() => setModalLote(false)} largura="ampla">
        <form onSubmit={salvarLote} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input required label="Nome / identificação" placeholder="Ex.: Primeiro final de semana" value={tituloLote} onChange={(e) => setTituloLote(e.target.value)} />
            <Input required label="Local da hospedagem" placeholder="Ex.: Chácara Santa Rita" value={localHospedagem} onChange={(e) => setLocalHospedagem(e.target.value)} />
          </div>

          <div className="space-y-3">
            {configuracoes.map((item, indice) => (
              <section key={indice} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">Grupo {indice + 1}</p>
                  </div>
                  {configuracoes.length > 1 && (
                    <button type="button" className="rounded-lg p-2 text-red-700 hover:bg-red-50" aria-label="Remover este grupo de quartos" onClick={() => setConfiguracoes((atual) => atual.filter((_, i) => i !== indice))}>
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Input required label="Quantidade de quartos" type="number" min="1" max="50" value={item.quantidade} onChange={(e) => atualizarConfiguracao(indice, 'quantidade', e.target.value)} />
                  <Input required label="Vagas por quarto" type="number" min="1" max="30" value={item.capacidade} onChange={(e) => atualizarConfiguracao(indice, 'capacidade', e.target.value)} />
                  <label className="text-sm font-medium">Grupo
                    <select className="admin-field mt-1" value={item.genero} onChange={(e) => atualizarConfiguracao(indice, 'genero', e.target.value)}>
                      <option value="feminino">Feminino</option>
                      <option value="masculino">Masculino</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">Climatização
                    <select className="admin-field mt-1" value={item.climatizacao} onChange={(e) => atualizarConfiguracao(indice, 'climatizacao', e.target.value)}>
                      <option value="ar_condicionado">Ar-condicionado</option>
                      <option value="ventilador">Ventilador</option>
                      <option value="sem_climatizacao">Sem climatização</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <label className="text-sm font-medium">Pacote específico (opcional)
                    <select className="admin-field mt-1" value={item.pacote_id} onChange={(e) => atualizarConfiguracao(indice, 'pacote_id', e.target.value)}>
                      <option value="">Todos os pacotes do período</option>
                      {pacotes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </label>
                  <Input label="Observação (opcional)" value={item.observacoes} onChange={(e) => atualizarConfiguracao(indice, 'observacoes', e.target.value)} />
                </div>
              </section>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={() => setConfiguracoes((atual) => [...atual, novaConfiguracao()])}><Plus size={16} className="mr-2" />Incluir mais quartos</Button>

          <div className="flex flex-col gap-2 rounded-xl border border-[#073F50]/10 bg-[#f4f8f9] px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2"><MapPin size={18} className="text-[#073F50]" /><span><strong>{localHospedagem || 'Local'}</strong></span></div>
            <span><strong>{totalNovosQuartos}</strong> quarto(s) · <strong>{totalNovasVagas}</strong> vaga(s)</span>
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-slate-200 bg-[#fffdfa]/98 px-4 pb-1 pt-3 shadow-[0_-10px_24px_rgba(255,253,250,.96)] backdrop-blur sm:-mx-7 sm:px-7">
            <Button type="button" variant="outline" onClick={() => setModalLote(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando || !tituloLote.trim() || !localHospedagem.trim() || totalNovosQuartos < 1}>{salvando ? 'Criando...' : 'Criar quartos'}</Button>
          </div>
        </form>
      </AdminModal>

      <AdminModal aberto={modal} titulo={editando ? 'Editar quarto' : 'Novo quarto'} descricao="Cadastre ou ajuste uma unidade de hospedagem." fechar={() => setModal(false)}>
        <form onSubmit={salvarQuarto} className="space-y-4">
          <Input required label="Nome / número" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <Input label="Local da hospedagem" placeholder="Ex.: Chácara Santa Rita" value={form.local_hospedagem} onChange={(e) => setForm({ ...form, local_hospedagem: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Grupo
              <select className="admin-field mt-1" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value as Genero })}>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
              </select>
            </label>
            <Input required label="Quantidade de vagas" type="number" min="1" max="30" value={form.capacidade} onChange={(e) => setForm({ ...form, capacidade: e.target.value })} />
          </div>
          <label className="text-sm font-medium">Pacote específico (opcional)
            <select className="admin-field mt-1" value={form.pacote_id} onChange={(e) => setForm({ ...form, pacote_id: e.target.value })}>
              <option value="">Todos os pacotes do período</option>
              {pacotes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Observações
            <textarea className="admin-field mt-1 min-h-24" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar quarto'}</Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
