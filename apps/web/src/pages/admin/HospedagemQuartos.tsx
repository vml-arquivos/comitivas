import { useEffect, useMemo, useState } from 'react';
import { BedDouble, MoveRight, Plus, RefreshCw, Trash2, UserMinus } from 'lucide-react';
import { Button, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';
import { AdminModal } from '../../components/admin/AdminModal';
import { iniciaisPessoa } from '../../utils/nome';

type GeneroQuarto = 'feminino' | 'masculino';
type EstruturaQuarto = 'ar_condicionado' | 'ventilador' | 'sem_climatizacao' | 'outro';
type LinhaQuartos = { id: string; quantidade: string; capacidade: string; genero: GeneroQuarto; estrutura: EstruturaQuarto };

const vazio = { nome: '', genero: 'feminino' as GeneroQuarto, capacidade: '4', estrutura: 'ar_condicionado' as EstruturaQuarto, pacote_id: '', observacoes: '' };
const novaChave = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const novaLinha = (): LinhaQuartos => ({ id: novaChave(), quantidade: '1', capacidade: '4', genero: 'feminino', estrutura: 'ar_condicionado' });
const novoLote = () => ({ titulo: '', pacote_id: '', observacoes: '', chave_idempotencia: novaChave(), configuracoes: [novaLinha()] });

const estruturaLabel: Record<EstruturaQuarto, string> = {
  ar_condicionado: 'Ar-condicionado',
  ventilador: 'Ventilador',
  sem_climatizacao: 'Sem climatização',
  outro: 'Outro',
};

function resumoQuarto(nome: string) {
  const partes = String(nome || '').split('·').map((parte) => parte.trim()).filter(Boolean);
  const ultimo = partes[partes.length - 1] || '';
  const numero = ultimo.match(/(?:quarto\s*)?[FM]?0*(\d+)$/i)?.[1];
  return {
    numero: numero ? `Quarto ${Number(numero)}` : String(nome || 'Quarto'),
    conjunto: partes.length > 1 ? partes[0] : '',
    estrutura: partes.length > 2 ? partes[1] : '',
  };
}

export default function HospedagemQuartos() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [pacotes, setPacotes] = useState<any[]>([]);
  const [loteId, setLoteId] = useState('');
  const [mapa, setMapa] = useState<any | null>(null);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form, setForm] = useState(vazio);
  const [loteForm, setLoteForm] = useState(novoLote);
  const [reservaId, setReservaId] = useState('');
  const [quartoId, setQuartoId] = useState('');
  const [movendo, setMovendo] = useState<any | null>(null);
  const [hospedeDetalhe, setHospedeDetalhe] = useState<any | null>(null);
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
      const respostas = await Promise.all(lista.map((evento: any) => api.get(`/lotes/evento/${evento.id}`)));
      const lotesLista = respostas.flatMap((resposta) => resposta.data.lotes || []);
      setLotes(lotesLista);
      const atual = lotesLista.some((lote: any) => lote.id === loteId) ? loteId : lotesLista[0]?.id || '';
      setLoteId(atual);
      await carregarMapa(atual);
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível carregar a hospedagem.');
    }
  };

  useEffect(() => { void carregar(); }, []);

  const loteComEvento = useMemo(() => lotes.map((lote) => ({
    ...lote,
    evento_nome: eventos.find((evento) => evento.id === lote.evento_id)?.nome || 'Excursão',
  })), [lotes, eventos]);

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
    setLoteForm(novoLote());
    setModal(true);
  };

  const abrirEdicao = (quarto: any) => {
    setEditando(quarto);
    setForm({ nome: quarto.nome, genero: quarto.genero, capacidade: String(quarto.capacidade), estrutura: quarto.estrutura || 'outro', pacote_id: quarto.pacote_id || '', observacoes: quarto.observacoes || '' });
    setModal(true);
  };

  const salvarQuarto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loteId) return;
    setSalvando(true);
    setErro('');
    setMensagem('');
    try {
      if (editando) {
        await api.patch(`/hospedagem/lotes/${loteId}/quartos/${editando.id}`, { ...form, capacidade: Number(form.capacidade) });
        setMensagem('Quarto atualizado.');
      } else {
        const response = await api.post(`/hospedagem/lotes/${loteId}/quartos/lote`, {
          ...loteForm,
          configuracoes: loteForm.configuracoes.map((item) => ({ ...item, quantidade: Number(item.quantidade), capacidade: Number(item.capacidade) })),
        });
        setMensagem(response.data.reutilizado ? 'Este conjunto já havia sido criado.' : `${response.data.quantidade} quarto(s) criado(s) automaticamente.`);
      }
      await carregarMapa();
      setModal(false);
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível salvar os quartos.');
    } finally {
      setSalvando(false);
    }
  };

  const atualizarLinha = (id: string, campo: keyof Omit<LinhaQuartos, 'id'>, valor: string) => {
    setLoteForm((atual) => ({
      ...atual,
      configuracoes: atual.configuracoes.map((item) => item.id === id ? { ...item, [campo]: valor } : item),
    }));
  };

  const alocarOuMover = async () => {
    if (!quartoId || (!movendo && !reservaId)) return;
    const ok = await executar(() => movendo
      ? api.post(`/hospedagem/alocacoes/${movendo.id}/mover`, { quarto_id: quartoId })
      : api.post(`/hospedagem/quartos/${quartoId}/alocacoes`, { reserva_id: reservaId }), movendo ? 'Hóspede remanejado.' : 'Hóspede alocado.');
    if (ok) {
      setMovendo(null);
      setReservaId('');
      setQuartoId('');
    }
  };

  const iniciarRemanejamento = (alocacao: any) => {
    setMovendo(alocacao);
    setHospedeDetalhe(null);
    setReservaId('');
    setQuartoId('');
    requestAnimationFrame(() => document.getElementById('controle-hospedagem')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  return <div className="admin-page">
    <div className="admin-page-header">
      <div>
        <p className="admin-eyebrow">Operação da hospedagem</p>
        <h1 className="admin-title">Quartos e hóspedes</h1>
        <p className="admin-subtitle">Crie conjuntos de quartos e controle vagas, ocupantes e remanejamentos.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={abrirNovo} disabled={!loteId}><Plus size={16} className="mr-2" />Cadastrar quartos</Button>
        <Button variant="outline" onClick={() => void carregar()}><RefreshCw size={16} className="mr-2" />Atualizar</Button>
      </div>
    </div>

    {erro && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
    {mensagem && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{mensagem}</div>}

    <section className="admin-card p-5">
      <label className="block text-sm font-medium">Viagem e período
        <select className="admin-field mt-1" value={loteId} onChange={(event) => { setLoteId(event.target.value); void carregarMapa(event.target.value); }}>
          <option value="">Selecione</option>
          {loteComEvento.map((lote) => <option key={lote.id} value={lote.id}>{lote.evento_nome} · {lote.nome}</option>)}
        </select>
      </label>
    </section>

    {mapa && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Quartos', mapa.resumo.quartos],
          ['Vagas', mapa.resumo.capacidade],
          ['Ocupadas', mapa.resumo.ocupadas],
          ['Livres', mapa.resumo.livres],
          ['Feminino / masculino', `${mapa.resumo.femininas} / ${mapa.resumo.masculinas}`],
        ].map(([rotulo, valor]) => <div key={String(rotulo)} className="admin-metric-card">
          <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500">{rotulo}</p>
          <p className="mt-1 text-2xl font-semibold text-[#073F50]">{valor}</p>
        </div>)}
      </div>

      <section id="controle-hospedagem" className="admin-card grid scroll-mt-24 gap-3 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <div>
          <label className="text-sm font-medium">{movendo ? `Remanejar ${movendo.cliente_nome}` : 'Hóspede sem quarto'}</label>
          {movendo
            ? <p className="admin-field mt-1 flex items-center">Quarto atual: {movendo.quarto_nome} · vaga {movendo.numero_vaga}</p>
            : <select className="admin-field mt-1" value={reservaId} onChange={(event) => setReservaId(event.target.value)}>
              <option value="">Selecione</option>
              {mapa.reservas_disponiveis.map((reserva: any) => <option key={reserva.id} value={reserva.id}>{reserva.cliente_nome} · {reserva.pacote_nome || 'sem modalidade'}</option>)}
            </select>}
        </div>
        <label className="text-sm font-medium">Quarto de destino
          <select className="admin-field mt-1" value={quartoId} onChange={(event) => setQuartoId(event.target.value)}>
            <option value="">Selecione</option>
            {mapa.quartos.filter((quarto: any) => quarto.livres > 0 && quarto.id !== movendo?.quarto_id).map((quarto: any) => <option key={quarto.id} value={quarto.id}>{quarto.nome} · {quarto.genero} · {quarto.livres} livre(s)</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <Button disabled={salvando || !quartoId || (!movendo && !reservaId)} onClick={() => void alocarOuMover()}>{movendo ? 'Confirmar mudança' : 'Alocar'}</Button>
          {movendo && <Button variant="outline" onClick={() => { setMovendo(null); setQuartoId(''); }}>Cancelar</Button>}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {mapa.quartos.map((quarto: any) => {
          const alocacoes = mapa.alocacoes.filter((item: any) => item.quarto_id === quarto.id);
          const resumo = resumoQuarto(quarto.nome);
          const lotado = Number(quarto.livres) === 0;
          return <article key={quarto.id} className="admin-card overflow-visible">
            <header className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <BedDouble size={18} className="shrink-0 text-[#DF6248]" />
                  <h2 className="truncate text-base font-semibold text-[#073F50]" title={quarto.nome}>{resumo.numero}</h2>
                  <span className={`admin-status ${quarto.genero === 'feminino' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}>{quarto.genero}</span>
                  <span className={`admin-status ${lotado ? 'bg-slate-100 text-slate-700' : Number(quarto.ocupadas) > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{lotado ? 'Lotado' : Number(quarto.ocupadas) > 0 ? 'Parcial' : 'Disponível'}</span>
                </div>
                {resumo.conjunto && <p className="mt-1 truncate text-xs text-slate-500">{resumo.conjunto}{resumo.estrutura ? ` · ${resumo.estrutura}` : ''}</p>}
                <p className="mt-1 text-xs text-slate-500">{quarto.ocupadas}/{quarto.capacidade} ocupadas · {quarto.pacote_nome || 'Todos os pacotes'}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" className="px-3" onClick={() => abrirEdicao(quarto)}>Editar</Button>
                <Button variant="outline" className="text-red-700" aria-label={`Excluir ${quarto.nome}`} onClick={() => { if (confirm('Excluir este quarto?')) void executar(() => api.delete(`/hospedagem/quartos/${quarto.id}`), 'Quarto excluído da operação.'); }}><Trash2 size={15} /></Button>
              </div>
            </header>
            <div className="p-4">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {Array.from({ length: Number(quarto.capacidade) }, (_, indice) => {
                  const numero = indice + 1;
                  const ocupante = alocacoes.find((item: any) => Number(item.numero_vaga) === numero);
                  return <div key={numero} className="group relative">
                    <button
                      type="button"
                      disabled={!ocupante}
                      title={ocupante ? `${ocupante.cliente_nome} · vaga ${numero}` : `Vaga ${numero} livre`}
                      aria-label={ocupante ? `Vaga ${numero}, ${ocupante.cliente_nome}` : `Vaga ${numero} livre`}
                      onClick={() => ocupante && setHospedeDetalhe(ocupante)}
                      className={`flex min-h-14 w-full flex-col items-center justify-center rounded-xl border px-2 py-1.5 transition ${ocupante ? 'border-[#DF6248]/35 bg-[#fff0eb] text-[#a53b28] hover:border-[#DF6248]' : 'cursor-default border-dashed border-emerald-200 bg-emerald-50/60 text-emerald-700'}`}
                    >
                      <span className="text-base font-semibold">{ocupante ? iniciaisPessoa(ocupante.cliente_nome) : numero}</span>
                      <span className="mt-0.5 text-[10px] font-medium">{ocupante ? `Vaga ${numero}` : 'Livre'}</span>
                    </button>
                    {ocupante && <span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+.4rem)] left-1/2 z-30 hidden w-max max-w-56 -translate-x-1/2 rounded-lg bg-[#073F50] px-3 py-2 text-center text-xs font-medium text-white shadow-lg group-hover:block group-focus-within:block">{ocupante.cliente_nome}<br /><span className="font-normal text-white/70">Vaga {numero}</span></span>}
                  </div>;
                })}
              </div>
            </div>
          </article>;
        })}
      </div>
      <p className="text-sm text-slate-600"><strong>Local da hospedagem:</strong> {mapa.local_hospedagem || mapa.lote?.local_hospedagem || 'Não informado'}</p>
    </>}

    <AdminModal aberto={modal} titulo={editando ? 'Editar quarto' : 'Cadastrar quartos'} descricao={editando ? 'Atualize este quarto sem alterar os demais.' : 'Crie vários quartos de uma vez. Use “Incluir mais” para combinar capacidades, grupos e estruturas.'} fechar={() => setModal(false)} largura="ampla">
      <form onSubmit={salvarQuarto} className="space-y-5">
        {editando ? <>
          <Input required label="Nome / identificação" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">Grupo
              <select className="admin-field mt-1" value={form.genero} onChange={(event) => setForm({ ...form, genero: event.target.value as GeneroQuarto })}><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select>
            </label>
            <Input required label="Quantidade de vagas" type="number" min="1" max="30" value={form.capacidade} onChange={(event) => setForm({ ...form, capacidade: event.target.value })} />
            <label className="text-sm font-medium">Estrutura
              <select className="admin-field mt-1" value={form.estrutura} onChange={(event) => setForm({ ...form, estrutura: event.target.value as EstruturaQuarto })}>{Object.entries(estruturaLabel).map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}</select>
            </label>
          </div>
          <label className="text-sm font-medium">Pacote específico (opcional)
            <select className="admin-field mt-1" value={form.pacote_id} onChange={(event) => setForm({ ...form, pacote_id: event.target.value })}><option value="">Todos os pacotes do período</option>{pacotes.map((pacote) => <option key={pacote.id} value={pacote.id}>{pacote.nome}</option>)}</select>
          </label>
          <label className="text-sm font-medium">Observações<textarea className="admin-field mt-1 min-h-24" value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} /></label>
        </> : <>
          <div className="grid gap-4 md:grid-cols-[1.25fr_.75fr]">
            <Input required minLength={3} maxLength={72} label="Título do conjunto" placeholder="Ex.: 1º fim de semana" value={loteForm.titulo} onChange={(event) => setLoteForm({ ...loteForm, titulo: event.target.value })} />
            <label className="text-sm font-medium">Pacote específico (opcional)
              <select className="admin-field mt-1" value={loteForm.pacote_id} onChange={(event) => setLoteForm({ ...loteForm, pacote_id: event.target.value })}><option value="">Todos os pacotes do período</option>{pacotes.map((pacote) => <option key={pacote.id} value={pacote.id}>{pacote.nome}</option>)}</select>
            </label>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-[#073F50]">Configurações</h3><p className="text-xs text-slate-500">Cada linha gera automaticamente a quantidade informada.</p></div><Button type="button" variant="outline" onClick={() => setLoteForm((atual) => ({ ...atual, configuracoes: [...atual.configuracoes, novaLinha()] }))}><Plus size={15} className="mr-1" />Incluir mais quartos</Button></div>
            {loteForm.configuracoes.map((linha, indice) => <div key={linha.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.2fr_auto] lg:items-end">
              <Input required label="Quantidade de quartos" type="number" min="1" max="50" value={linha.quantidade} onChange={(event) => atualizarLinha(linha.id, 'quantidade', event.target.value)} />
              <Input required label="Vagas por quarto" type="number" min="1" max="30" value={linha.capacidade} onChange={(event) => atualizarLinha(linha.id, 'capacidade', event.target.value)} />
              <label className="text-sm font-medium">Grupo
                <select className="admin-field mt-1" value={linha.genero} onChange={(event) => atualizarLinha(linha.id, 'genero', event.target.value)}><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select>
              </label>
              <label className="text-sm font-medium">Estrutura
                <select className="admin-field mt-1" value={linha.estrutura} onChange={(event) => atualizarLinha(linha.id, 'estrutura', event.target.value)}>{Object.entries(estruturaLabel).map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}</select>
              </label>
              <Button type="button" variant="outline" className="text-red-700" aria-label={`Remover configuração ${indice + 1}`} disabled={loteForm.configuracoes.length === 1} onClick={() => setLoteForm((atual) => ({ ...atual, configuracoes: atual.configuracoes.filter((item) => item.id !== linha.id) }))}><Trash2 size={15} /></Button>
            </div>)}
          </div>
          <label className="text-sm font-medium">Observações para o conjunto (opcional)<textarea className="admin-field mt-1 min-h-20" value={loteForm.observacoes} onChange={(event) => setLoteForm({ ...loteForm, observacoes: event.target.value })} /></label>
        </>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal(false)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : editando ? 'Salvar quarto' : 'Criar quartos'}</Button></div>
      </form>
    </AdminModal>

    <AdminModal aberto={Boolean(hospedeDetalhe)} titulo={hospedeDetalhe?.cliente_nome || 'Hóspede'} descricao={hospedeDetalhe ? `${hospedeDetalhe.quarto_nome} · vaga ${hospedeDetalhe.numero_vaga}` : undefined} fechar={() => setHospedeDetalhe(null)}>
      {hospedeDetalhe && <div className="space-y-4">
        <div className="flex items-center gap-4 rounded-2xl bg-[#fff0eb] p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DF6248] text-base font-semibold text-white">{iniciaisPessoa(hospedeDetalhe.cliente_nome)}</span>
          <div className="min-w-0"><p className="font-semibold text-[#073F50]">{hospedeDetalhe.cliente_nome}</p><p className="truncate text-sm text-slate-500">{hospedeDetalhe.cliente_email}</p><p className="mt-1 text-xs text-slate-500">{hospedeDetalhe.pacote_nome || 'Pacote não informado'}</p></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => iniciarRemanejamento(hospedeDetalhe)}><MoveRight size={15} className="mr-1" />Remanejar</Button>
          <Button variant="outline" className="text-red-700" onClick={() => { if (confirm('Liberar esta vaga mantendo o histórico?')) void executar(() => api.delete(`/hospedagem/alocacoes/${hospedeDetalhe.id}`, { data: { motivo: 'Liberação pelo mapa de quartos' } }), 'Vaga liberada.').then((ok) => ok && setHospedeDetalhe(null)); }}><UserMinus size={15} className="mr-1" />Liberar vaga</Button>
        </div>
      </div>}
    </AdminModal>
  </div>;
}
