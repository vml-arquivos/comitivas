import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronUp, Info, Sparkles, TentTree, Wind, Snowflake } from 'lucide-react';
import {
  lerIntencaoCheckout,
  lerLeadId,
  lerLeadIntentToken,
  limparIntencaoCheckout,
  lerReferenciaVendedor,
  salvarIntencaoCheckout,
  salvarReferenciaVendedor,
} from '../../utils/checkoutIntent';
import { emModoAplicativo } from '../../utils/pwaInstall';

interface PacotePublicado {
  id: string;
  nome: string;
  descricao: string;
  valor_total: string;
  modalidade_hospedagem: 'camping' | 'quarto_ventilador' | 'quarto_ar_condicionado';
  disponibilidade: 'disponivel' | 'ultimas_vagas' | 'esgotado';
}

const modalidadeMeta: Record<PacotePublicado['modalidade_hospedagem'], { label: string; icon: typeof TentTree; destaque: string }> = {
  camping: { label: 'Camping', icon: TentTree, destaque: 'Vivência coletiva na estrutura da excursão' },
  quarto_ventilador: { label: 'Quarto com ventilador', icon: Wind, destaque: 'Conforto essencial para descansar' },
  quarto_ar_condicionado: { label: 'Quarto com ar-condicionado', icon: Snowflake, destaque: 'Hospedagem em quarto com ar-condicionado' },
};

function formatarMoeda(valor: string | number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

export default function ConfiguradorPacote() {
  const { loteId } = useParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const pacoteSolicitado = searchParams.get('pacote');
  const [itensDisponiveis, setItensDisponiveis] = useState<any[]>([]);
  const [pacotes, setPacotes] = useState<PacotePublicado[]>([]);
  const [pacoteId, setPacoteId] = useState<string>('');
  const [itensSelecionados, setItensSelecionados] = useState<Record<string, number>>({});
  const [cupomCodigo, setCupomCodigo] = useState('');
  const [calculo, setCalculo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState('');
  const [mostrarOutrosPacotes, setMostrarOutrosPacotes] = useState(false);
  const modoApp = emModoAplicativo();

  useEffect(() => {
    const referencia = searchParams.get('ref');
    if (referencia) salvarReferenciaVendedor(referencia);
  }, [searchParams]);

  useEffect(() => {
    const carregarConfigurador = async () => {
      if (!loteId) {
        setError('Lote não informado.');
        setIsLoading(false);
        return;
      }
      try {
        const [itensResponse, pacotesResponse] = await Promise.all([
          api.get(`/pacotes/lotes/${loteId}/itens`),
          api.get(`/pacotes/lotes/${loteId}/pacotes`),
        ]);
        const listaPacotes = pacotesResponse.data.pacotes || [];
        setItensDisponiveis(itensResponse.data.itens || []);
        setPacotes(listaPacotes);
        const intencaoSalva = lerIntencaoCheckout();
        const pacoteDaUrl = pacoteSolicitado
          ? listaPacotes.find((pacote: PacotePublicado) => pacote.id === pacoteSolicitado && pacote.disponibilidade !== 'esgotado')
          : undefined;
        const pacoteSalvoId = intencaoSalva && intencaoSalva.loteId === loteId ? intencaoSalva.pacoteId : undefined;
        const pacoteSalvoValido = pacoteSalvoId
          ? listaPacotes.some((pacote: PacotePublicado) => pacote.id === pacoteSalvoId && pacote.disponibilidade !== 'esgotado')
          : false;

        if (pacoteDaUrl) {
          setPacoteId(pacoteDaUrl.id);
          setMostrarOutrosPacotes(false);
          if (intencaoSalva && intencaoSalva.loteId === loteId && intencaoSalva.pacoteId === pacoteDaUrl.id) {
            setItensSelecionados(intencaoSalva.itensSelecionados || {});
          }
        } else if (pacoteSalvoValido && pacoteSalvoId) {
          setPacoteId(pacoteSalvoId);
          setMostrarOutrosPacotes(false);
          setItensSelecionados(intencaoSalva?.itensSelecionados || {});
        } else if (listaPacotes.length === 1 && listaPacotes[0].disponibilidade !== 'esgotado') {
          setPacoteId(listaPacotes[0].id);
          setMostrarOutrosPacotes(false);
        } else {
          setMostrarOutrosPacotes(true);
        }
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Não foi possível carregar as opções do pacote. Tente novamente.');
        setItensDisponiveis([]);
        setPacotes([]);
      } finally {
        setIsLoading(false);
      }
    };
    void carregarConfigurador();
  }, [loteId, pacoteSolicitado]);

  const pacoteSelecionado = useMemo(() => pacotes.find((pacote) => pacote.id === pacoteId), [pacotes, pacoteId]);
  const outrosPacotes = useMemo(() => pacotes.filter((pacote) => pacote.id !== pacoteId), [pacotes, pacoteId]);

  useEffect(() => {
    if (!pacoteId && pacotes.length > 0) setMostrarOutrosPacotes(true);
  }, [pacoteId, pacotes.length]);

  useEffect(() => {
    if (isLoading || !loteId || (pacotes.length > 0 && !pacoteId)) {
      setCalculo(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsCalculating(true);
      try {
        const itensPayload = Object.entries(itensSelecionados)
          .filter(([, quantidade]) => quantidade > 0)
          .map(([id, quantidade]) => ({ id, quantidade }));
        const response = await api.post('/pacotes/calcular', {
          lote_id: loteId,
          pacote_id: pacoteId || undefined,
          itens: itensPayload,
          cupom_codigo: cupomCodigo.trim() || undefined,
        });
        setCalculo(response.data);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao calcular o valor do pacote.');
        setCalculo(null);
      } finally {
        setIsCalculating(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [itensSelecionados, loteId, pacoteId, pacotes.length, cupomCodigo, isLoading]);

  const gruposItens = useMemo(() => itensDisponiveis.reduce<Record<string, any[]>>((grupos, item) => {
    const grupo = item.tipo || 'Outros';
    (grupos[grupo] ||= []).push(item);
    return grupos;
  }, {}), [itensDisponiveis]);

  const alterarQuantidade = (item: any, valor: number) => {
    const minimo = Number(item.min_quantity ?? 0);
    const maximo = Number(item.max_quantity ?? 99);
    const passo = Math.max(1, Number(item.step ?? 1));
    const quantidade = Math.min(maximo, Math.max(minimo, valor));
    setItensSelecionados((prev) => ({ ...prev, [item.id]: quantidade > 0 ? Math.round(quantidade / passo) * passo : 0 }));
  };

  const selecionarPacote = (id: string) => {
    setPacoteId(id);
    setMostrarOutrosPacotes(false);
    const leadId = lerLeadId();
    const leadIntentToken = lerLeadIntentToken();
    if (leadId && leadIntentToken && loteId) {
      api.patch(`/publico/leads/${leadId}/intencao`, {
        lote_id: loteId,
        pacote_id: id,
        status: 'interessado',
        lead_intent_token: leadIntentToken,
      }).catch(() => undefined);
    }
  };

  const handleReservar = async () => {
    if (authLoading) return;
    if (pacotes.length > 0 && !pacoteId) {
      setError('Escolha sua hospedagem para continuar.');
      return;
    }
    if (pacoteSelecionado?.disponibilidade === 'esgotado') {
      setError('Esta opção está esgotada. Escolha outro pacote para continuar.');
      return;
    }
    setError('');
    let leadId = lerLeadId();
    const leadIntentToken = lerLeadIntentToken();
    const intent = {
      loteId: loteId!,
      pacoteId,
      itensSelecionados,
      criadoEm: new Date().toISOString(),
    };
    salvarIntencaoCheckout(intent);

    if (!user) {
      if (leadId && leadIntentToken) {
        api.patch(`/publico/leads/${leadId}/intencao`, {
          lote_id: loteId,
          pacote_id: pacoteId,
          status: 'checkout_iniciado',
          lead_intent_token: leadIntentToken,
        }).catch(() => undefined);
      }
      const referencia = searchParams.get('ref') || lerReferenciaVendedor();
      const retorno = `/pacote/${loteId}?retomar=1${pacoteId ? `&pacote=${encodeURIComponent(pacoteId)}` : ''}${referencia ? `&ref=${encodeURIComponent(referencia)}` : ''}`;
      navigate(`/login?redirect=${encodeURIComponent(retorno)}`);
      return;
    }

    setIsReserving(true);
    try {
      const referencia = searchParams.get('ref') || lerReferenciaVendedor();
      if (!leadId && referencia) {
        const origem = await api.post('/jornada/registrar-origem', { codigo_origem: referencia });
        leadId = origem.data.lead_id || undefined;
      }
      const itensPayload = Object.entries(itensSelecionados)
        .filter(([, quantidade]) => quantidade > 0)
        .map(([id, quantidade]) => ({ id, quantidade }));
      const response = await api.post('/pacotes/reservar', {
        lote_id: loteId,
        pacote_id: pacoteId || undefined,
        itens: itensPayload,
        cupom_codigo: cupomCodigo.trim() || undefined,
        lead_id: leadId || undefined,
      });
      limparIntencaoCheckout();
      navigate(`/checkout/${response.data.reserva_id}`);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao criar reserva. Tente novamente.');
    } finally {
      setIsReserving(false);
    }
  };

  const renderPacoteCard = (pacote: PacotePublicado, destaqueSelecionado = false) => {
    const meta = modalidadeMeta[pacote.modalidade_hospedagem];
    const Icon = meta?.icon || TentTree;
    const selecionado = pacote.id === pacoteId;
    const esgotado = pacote.disponibilidade === 'esgotado';
    const classeStatus = esgotado
      ? 'bg-slate-800 text-white'
      : pacote.disponibilidade === 'ultimas_vagas'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-100 text-emerald-800';
    const labelStatus = esgotado ? 'Esgotado' : pacote.disponibilidade === 'ultimas_vagas' ? 'Últimas vagas' : 'Disponível';

    return (
      <button
        key={pacote.id}
        type="button"
        aria-pressed={selecionado}
        disabled={esgotado}
        onClick={() => selecionarPacote(pacote.id)}
        className={`relative text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${destaqueSelecionado
          ? 'w-full rounded-[1.7rem] border border-[#851F32]/22 bg-white p-5 shadow-[0_18px_45px_rgba(24,45,59,0.10)] ring-1 ring-[#851F32]/10 sm:p-6'
          : 'w-[84vw] max-w-[320px] shrink-0 snap-start rounded-2xl border border-gray-200 bg-white p-4 hover:border-primary/40 hover:shadow-md sm:w-auto sm:max-w-none sm:p-5'} ${selecionado && !destaqueSelecionado ? 'border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20' : ''}`}
      >
        {selecionado && !destaqueSelecionado && <span className="absolute left-3 top-3 rounded-full bg-primary p-1 text-white"><Check size={14} /></span>}
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-3 text-primary"><Icon size={24} /></div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${classeStatus}`}>{labelStatus}</span>
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-primary">{meta?.label}</p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">{pacote.nome}</h3>
        <p className={`mt-2 text-sm text-gray-500 ${destaqueSelecionado ? '' : 'min-h-10'}`}>{pacote.descricao || meta?.destaque}</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <p className="text-2xl font-bold text-slate-900">{formatarMoeda(pacote.valor_total)}</p>
          {!destaqueSelecionado && !esgotado && <span className="text-xs font-semibold text-primary">Toque para escolher</span>}
        </div>
      </button>
    );
  };

  if (isLoading) return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-[#182D3B]/60 sm:px-6 lg:px-8">Preparando sua experiência...</div>;

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 pb-28 sm:px-6 sm:py-10 lg:grid-cols-3 lg:gap-8 lg:px-8 lg:pb-14">
      <Helmet>
        <title>Monte seu pacote | Excursão das Comitivas</title>
        <meta name="description" content="Escolha a modalidade de hospedagem e confira as condições da sua reserva para Barretos." />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="space-y-6 lg:col-span-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#182D3B]/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => navigate('/eventos')} className="inline-flex items-center gap-2 text-sm font-extrabold text-[#851F32] hover:underline"><ArrowLeft size={16} />Voltar para excursões</button>
          <div className="flex items-center gap-2 overflow-x-auto text-[11px] font-black uppercase tracking-[.1em] text-slate-400">
            <span className="rounded-full bg-[#851F32] px-3 py-1.5 text-white">1 · Pacote</span><ArrowRight size={13} /><span>2 · Adicionais</span><ArrowRight size={13} /><span>3 · Checkout</span>
          </div>
        </div>

        <section className="rounded-[1.6rem] bg-[#182D3B] p-5 text-white shadow-[0_18px_50px_rgba(24,45,59,0.18)] sm:rounded-[2rem] sm:p-7">
          <div className="flex items-center gap-3 text-[#E3AAB4]"><Sparkles size={18} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Sua experiência</span></div>
          <h1 className="font-editorial mt-3 text-2xl font-bold tracking-[-0.025em] sm:text-4xl">Monte seu pacote</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">Escolha a hospedagem, adicione extras se quiser e siga para o checkout.</p>
        </section>

        {error && <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}

        {pacotes.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Escolha sua hospedagem</h2>
                <p className="text-sm text-gray-500">Selecione um pacote para continuar.</p>
              </div>
              {pacoteSelecionado && outrosPacotes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMostrarOutrosPacotes((valor) => !valor)}
                  className="inline-flex items-center gap-2 self-start rounded-full border border-[#182D3B]/12 bg-white px-4 py-2 text-sm font-bold text-[#182D3B] transition hover:border-[#851F32]/30 hover:text-[#851F32]"
                >
                  {mostrarOutrosPacotes ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {mostrarOutrosPacotes ? 'Ocultar outros pacotes' : 'Ver outros pacotes'}
                </button>
              )}
            </div>

            {pacoteSelecionado ? (
              <div className="space-y-3">
                {renderPacoteCard(pacoteSelecionado, true)}
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /><p><strong>{pacoteSelecionado.nome}</strong> selecionado. Você pode seguir direto para o checkout ou abrir outros pacotes para comparar.</p></div>
              </div>
            ) : (
              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
                {pacotes.map((pacote) => renderPacoteCard(pacote))}
              </div>
            )}

            {pacoteSelecionado && mostrarOutrosPacotes && outrosPacotes.length > 0 && (
              <div>
                <p className="mb-3 text-sm font-semibold text-slate-500">Outros pacotes</p>
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
                  {outrosPacotes.map((pacote) => renderPacoteCard(pacote))}
                </div>
              </div>
            )}
          </section>
        )}

        <section>
          <div className="mb-3"><h2 className="text-xl font-bold text-slate-900">Adicionais</h2><p className="text-sm text-gray-500">Inclua apenas o que deseja na sua reserva.</p></div>
          <div className="space-y-6">
            {Object.entries(gruposItens).map(([grupo, itens]) => <div key={grupo}>
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-primary">{grupo}</h3>
              <div className="space-y-3">{itens.map((item) => {
                const quantidade = Number(itensSelecionados[item.id] || 0);
                const minimo = Number(item.min_quantity ?? 0);
                const maximo = Number(item.max_quantity ?? 99);
                const obrigatorio = minimo > 0;
                return <Card key={item.id} className={`transition-all ${quantidade > 0 ? 'border-primary ring-1 ring-primary' : 'hover:border-gray-300'}`}>
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4"><div className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${quantidade > 0 ? 'border-primary bg-primary text-white' : 'border-gray-300'}`}>{quantidade > 0 && <Check size={14} />}</div><div><h3 className="font-semibold text-gray-900">{item.nome}{obrigatorio && <span className="ml-2 text-xs font-bold uppercase text-primary">Obrigatório</span>}</h3><p className="text-sm text-gray-500">{item.descricao || 'Adicional disponível para este lote.'}</p><p className="mt-1 text-xs text-slate-500">{formatarMoeda(item.valor)} por unidade{maximo < 99 ? ` · máximo ${maximo}` : ''}</p></div></div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end"><span className="text-sm font-semibold text-slate-900">{formatarMoeda(Number(item.valor) * quantidade)}</span><div className="flex items-center gap-2 rounded-lg border border-slate-200 p-1"><button type="button" onClick={() => alterarQuantidade(item, quantidade - 1)} disabled={quantidade <= minimo} className="h-8 w-8 rounded-md text-lg font-bold hover:bg-slate-100 disabled:opacity-40" aria-label={`Reduzir ${item.nome}`}>−</button><span className="w-7 text-center text-sm font-bold" aria-live="polite">{quantidade}</span><button type="button" onClick={() => alterarQuantidade(item, quantidade + 1)} disabled={quantidade >= maximo} className="h-8 w-8 rounded-md text-lg font-bold hover:bg-slate-100 disabled:opacity-40" aria-label={`Adicionar ${item.nome}`}>+</button></div></div>
                  </CardContent>
                </Card>;
              })}</div>
            </div>)}
            {itensDisponiveis.length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">Não há adicionais disponíveis para este lote.</p>}
          </div>
        </section>
      </div>

      <aside className="lg:col-span-1">
        <Card className={`overflow-hidden border-[#182D3B]/10 shadow-[0_18px_45px_rgba(24,45,59,0.10)] ${modoApp ? 'lg:sticky lg:top-[88px]' : 'lg:sticky lg:top-[104px]'}`}><CardHeader className="border-b bg-[#182D3B] text-white"><CardTitle>Resumo da reserva</CardTitle></CardHeader><CardContent className="space-y-4 p-6">
          <div className="flex justify-between text-sm"><span className="text-gray-600">Hospedagem</span><span className="max-w-40 text-right font-medium">{pacoteSelecionado?.nome || (pacotes.length ? 'Escolha uma opção' : 'Pacote base')}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Valor-base</span><span className="font-medium">{formatarMoeda(calculo?.valor_base || 0)}</span></div>
          {Object.entries(itensSelecionados).some(([, qtd]) => qtd > 0) && <div className="space-y-2 border-t pt-4"><p className="text-xs font-bold uppercase text-gray-500">Adicionais</p>{Object.entries(itensSelecionados).filter(([, qtd]) => qtd > 0).map(([id, qtd]) => { const item = itensDisponiveis.find((i) => i.id === id); return item ? <div key={id} className="flex justify-between text-sm"><span className="text-gray-600">{item.nome}</span><span>{formatarMoeda(Number(item.valor) * qtd)}</span></div> : null; })}</div>}
          <div className="border-t pt-4"><div className="flex items-center justify-between"><span className="text-lg font-bold">Total</span><span className="text-2xl font-bold text-primary">{isCalculating ? '...' : formatarMoeda(calculo?.valor_total || 0)}</span></div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Prévia do contrato</p><p className="mt-2 text-sm leading-relaxed text-slate-700">Serão registrados: <strong>{pacoteSelecionado?.nome || 'pacote base'}</strong>{Object.entries(itensSelecionados).filter(([, qtd]) => qtd > 0).length ? ` e ${Object.entries(itensSelecionados).filter(([, qtd]) => qtd > 0).length} adicional(is)` : ''}, com o total calculado pelo servidor.</p></div>
          <label className="block text-sm font-semibold text-slate-700">Cupom de desconto (opcional)<input value={cupomCodigo} onChange={(event) => setCupomCodigo(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 50))} placeholder="Digite seu cupom" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono uppercase" /></label>
          <Button className="mt-3 w-full" size="lg" onClick={handleReservar} isLoading={isReserving || authLoading} disabled={authLoading || isCalculating || (pacotes.length > 0 && !pacoteId) || pacoteSelecionado?.disponibilidade === 'esgotado'}>{user ? 'Continuar para checkout' : 'Entrar para continuar'}</Button>
          <div className="flex gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-700"><Info size={16} className="shrink-0" /><p>{user ? 'Os valores são calculados no servidor. Seu contrato refletirá exatamente as escolhas confirmadas.' : 'Você fará login na próxima etapa. Sua escolha ficará salva para continuar sem recomeçar.'}</p></div>
        </CardContent></Card>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#182D3B]/10 bg-white/95 p-3 shadow-[0_-12px_34px_rgba(24,45,59,.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-500">{pacoteSelecionado?.nome || 'Escolha um pacote'}</p>
            <p className="text-lg font-black text-[#182D3B]">{isCalculating ? 'Calculando…' : formatarMoeda(calculo?.valor_total || pacoteSelecionado?.valor_total || 0)}</p>
          </div>
          <Button onClick={handleReservar} isLoading={isReserving || authLoading} disabled={authLoading || isCalculating || (pacotes.length > 0 && !pacoteId) || pacoteSelecionado?.disponibilidade === 'esgotado'}>{user ? 'Continuar' : 'Entrar para continuar'} <ArrowRight size={16} /></Button>
        </div>
      </div>
    </div>
  );
}
