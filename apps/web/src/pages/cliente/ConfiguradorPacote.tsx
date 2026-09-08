import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Info, TentTree, Wind, Snowflake, Sparkles } from 'lucide-react';
import {
  lerIntencaoCheckout,
  lerLeadId,
  lerLeadIntentToken,
  limparIntencaoCheckout,
  salvarIntencaoCheckout,
} from '../../utils/checkoutIntent';

interface PacotePublicado {
  id: string;
  nome: string;
  descricao: string;
  valor_total: string;
  modalidade_hospedagem: 'camping' | 'quarto_ventilador' | 'quarto_ar_condicionado';
  disponibilidade: 'disponivel' | 'ultimas_vagas' | 'esgotado';
}

const modalidadeMeta: Record<PacotePublicado['modalidade_hospedagem'], { label: string; icon: typeof TentTree; destaque: string }> = {
  camping: { label: 'Camping', icon: TentTree, destaque: 'A energia coletiva da comitiva' },
  quarto_ventilador: { label: 'Quarto com ventilador', icon: Wind, destaque: 'Conforto essencial para descansar' },
  quarto_ar_condicionado: { label: 'Quarto com ar-condicionado', icon: Snowflake, destaque: 'A experiência com máximo conforto' },
};

function formatarMoeda(valor: string | number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

export default function ConfiguradorPacote() {
  const { loteId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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
          if (intencaoSalva && intencaoSalva.loteId === loteId && intencaoSalva.pacoteId === pacoteDaUrl.id) {
            setItensSelecionados(intencaoSalva.itensSelecionados || {});
          }
        } else if (pacoteSalvoValido && pacoteSalvoId) {
          setPacoteId(pacoteSalvoId);
          setItensSelecionados(intencaoSalva?.itensSelecionados || {});
        } else if (listaPacotes.length === 1 && listaPacotes[0].disponibilidade !== 'esgotado') {
          setPacoteId(listaPacotes[0].id);
        }
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Não foi possível carregar as opções do pacote. Tente novamente.');
        setItensDisponiveis([]);
        setPacotes([]);
      } finally {
        setIsLoading(false);
      }
    };
    carregarConfigurador();
  }, [loteId, pacoteSolicitado]);

  const pacoteSelecionado = useMemo(() => pacotes.find((pacote) => pacote.id === pacoteId), [pacotes, pacoteId]);

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
        const response = await api.post('/pacotes/calcular', { lote_id: loteId, pacote_id: pacoteId || undefined, itens: itensPayload, cupom_codigo: cupomCodigo.trim() || undefined });
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
    if (pacotes.length > 0 && !pacoteId) {
      setError('Escolha sua modalidade de hospedagem para continuar.');
      return;
    }
    if (pacoteSelecionado?.disponibilidade === 'esgotado') {
      setError('Esta modalidade está esgotada. Escolha outra opção para continuar.');
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
      const retorno = `/pacote/${loteId}?retomar=1${pacoteId ? `&pacote=${encodeURIComponent(pacoteId)}` : ''}${searchParams.get('ref') ? `&ref=${encodeURIComponent(searchParams.get('ref')!)}` : ''}`;
      navigate(`/cadastro?redirect=${encodeURIComponent(retorno)}`);
      return;
    }

    setIsReserving(true);
    try {
      if (!leadId && searchParams.get('ref')) {
        const origem = await api.post('/jornada/registrar-origem', { codigo_origem: searchParams.get('ref') });
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

  if (isLoading) return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-[#182D3B]/60 sm:px-6 lg:px-8">Preparando sua experiência...</div>;

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-7 pb-28 sm:px-6 sm:py-12 lg:grid-cols-3 lg:gap-8 lg:px-8 lg:pb-14">
      <Helmet>
        <title>Monte seu pacote | Excursão das Comitivas</title>
        <meta name="description" content="Escolha a modalidade de hospedagem e confira as condições da sua reserva para Barretos." />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="space-y-6 lg:col-span-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#182D3B]/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => navigate('/eventos')} className="inline-flex items-center gap-2 text-sm font-extrabold text-[#851F32] hover:underline"><ArrowLeft size={16}/>Voltar e comparar pacotes</button>
          <div className="flex items-center gap-2 overflow-x-auto text-[11px] font-black uppercase tracking-[.1em] text-slate-400">
            <span className="rounded-full bg-[#851F32] px-3 py-1.5 text-white">1 · Pacote</span><ArrowRight size={13}/><span>2 · Adicionais</span><ArrowRight size={13}/><span>3 · Checkout</span>
          </div>
        </div>
        <section className="rounded-[1.6rem] bg-[#182D3B] p-5 text-white shadow-[0_18px_50px_rgba(24,45,59,0.18)] sm:rounded-[2rem] sm:p-7">
          <div className="flex items-center gap-3 text-[#E3AAB4]"><Sparkles size={18} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Sua experiência, suas escolhas</span></div>
          <h1 className="font-editorial mt-3 text-2xl font-bold tracking-[-0.025em] sm:text-4xl">Monte seu pacote de viagem</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">Defina a hospedagem e complemente a sua reserva. O valor e o contrato serão gerados com base exatamente nas escolhas confirmadas.</p>
        </section>

        {error && <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}

        {pacotes.length > 0 && (
          <section>
            <div className="mb-3"><h2 className="text-xl font-bold text-slate-900">Escolha sua hospedagem</h2><p className="text-sm text-gray-500">A modalidade selecionada será registrada na sua reserva e no contrato.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pacotes.map((pacote) => {
                const meta = modalidadeMeta[pacote.modalidade_hospedagem];
                const Icon = meta?.icon || TentTree;
                const selecionado = pacote.id === pacoteId;
                const esgotado = pacote.disponibilidade === 'esgotado';
                return <button key={pacote.id} type="button" aria-pressed={selecionado} disabled={esgotado} onClick={() => selecionarPacote(pacote.id)} className={`relative rounded-2xl border p-4 text-left transition-all sm:p-5 disabled:cursor-not-allowed disabled:opacity-60 ${selecionado ? 'border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20' : 'border-gray-200 bg-white hover:border-primary/40 hover:shadow-md'}`}>
                  {selecionado && <span className="absolute left-3 top-3 rounded-full bg-primary p-1 text-white"><Check size={14} /></span>}
                  {pacote.disponibilidade !== 'disponivel' && <span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-black uppercase ${esgotado ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-800'}`}>{esgotado ? 'Esgotado' : 'Últimas vagas'}</span>}
                  <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-3 text-primary"><Icon size={24} /></div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">{meta?.label}</p>
                  <h3 className="mt-1 font-bold text-slate-900">{pacote.nome}</h3>
                  <p className="mt-2 min-h-10 text-sm text-gray-500">{pacote.descricao || meta?.destaque}</p>
                  <p className="mt-4 text-xl font-bold text-slate-900">{formatarMoeda(pacote.valor_total)}</p>
                </button>;
              })}
            </div>
            {pacoteSelecionado && <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0"/><p><strong>{pacoteSelecionado.nome}</strong> selecionado. Você pode adicionar extras abaixo ou seguir direto para o checkout.</p></div>}
          </section>
        )}

        <section>
          <div className="mb-3"><h2 className="text-xl font-bold text-slate-900">Personalize com adicionais</h2><p className="text-sm text-gray-500">Selecione apenas o que deseja incluir na experiência.</p></div>
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
        <Card className="sticky top-[104px] overflow-hidden border-[#182D3B]/10 shadow-[0_18px_45px_rgba(24,45,59,0.10)]"><CardHeader className="border-b bg-[#182D3B] text-white"><CardTitle>Resumo da reserva</CardTitle></CardHeader><CardContent className="space-y-4 p-6">
          <div className="flex justify-between text-sm"><span className="text-gray-600">Hospedagem</span><span className="max-w-40 text-right font-medium">{pacoteSelecionado?.nome || (pacotes.length ? 'Escolha uma opção' : 'Pacote base')}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Valor-base</span><span className="font-medium">{formatarMoeda(calculo?.valor_base || 0)}</span></div>
          {Object.entries(itensSelecionados).some(([, qtd]) => qtd > 0) && <div className="space-y-2 border-t pt-4"><p className="text-xs font-bold uppercase text-gray-500">Adicionais</p>{Object.entries(itensSelecionados).filter(([, qtd]) => qtd > 0).map(([id, qtd]) => { const item = itensDisponiveis.find((i) => i.id === id); return item ? <div key={id} className="flex justify-between text-sm"><span className="text-gray-600">{item.nome}</span><span>{formatarMoeda(Number(item.valor) * qtd)}</span></div> : null; })}</div>}
          <div className="border-t pt-4"><div className="flex items-center justify-between"><span className="text-lg font-bold">Total</span><span className="text-2xl font-bold text-primary">{isCalculating ? '...' : formatarMoeda(calculo?.valor_total || 0)}</span></div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Prévia do contrato</p><p className="mt-2 text-sm leading-relaxed text-slate-700">Serão registrados: <strong>{pacoteSelecionado?.nome || 'pacote base'}</strong>{Object.entries(itensSelecionados).filter(([, qtd]) => qtd > 0).length ? ` e ${Object.entries(itensSelecionados).filter(([, qtd]) => qtd > 0).length} adicional(is)` : ''}, com o total calculado pelo servidor.</p></div>
          <label className="block text-sm font-semibold text-slate-700">Cupom de desconto (opcional)<input value={cupomCodigo} onChange={(event) => setCupomCodigo(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 50))} placeholder="Digite seu cupom" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono uppercase" /></label>
          <Button className="mt-3 w-full" size="lg" onClick={handleReservar} isLoading={isReserving} disabled={isCalculating || (pacotes.length > 0 && !pacoteId) || pacoteSelecionado?.disponibilidade === 'esgotado'}>{user ? 'Continuar para checkout' : 'Continuar com esta escolha'}</Button>
          <div className="flex gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-700"><Info size={16} className="shrink-0" /><p>{user ? 'Os valores são calculados no servidor. Seu contrato refletirá exatamente as escolhas confirmadas.' : 'Você só precisará criar sua conta na próxima etapa. Sua escolha ficará salva para continuar sem recomeçar.'}</p></div>
        </CardContent></Card>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#182D3B]/10 bg-white/95 p-3 shadow-[0_-12px_34px_rgba(24,45,59,.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-500">{pacoteSelecionado?.nome || 'Escolha um pacote'}</p>
            <p className="text-lg font-black text-[#182D3B]">{isCalculating ? 'Calculando…' : formatarMoeda(calculo?.valor_total || pacoteSelecionado?.valor_total || 0)}</p>
          </div>
          <Button onClick={handleReservar} isLoading={isReserving} disabled={isCalculating || (pacotes.length > 0 && !pacoteId) || pacoteSelecionado?.disponibilidade === 'esgotado'}>Continuar <ArrowRight size={16}/></Button>
        </div>
      </div>
    </div>
  );
}
