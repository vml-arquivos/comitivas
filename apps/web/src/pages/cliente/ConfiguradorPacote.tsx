import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { ArrowLeft, ArrowRight, Check, Info, TentTree, Wind, Snowflake, Sparkles, Trash2, UserPlus } from 'lucide-react';
import {
  type ParticipanteCheckout,
  lerIntencaoCheckout,
  lerLeadId,
  lerLeadIntentToken,
  limparIntencaoCheckout,
  lerReferenciaVendedor,
  salvarIntencaoCheckout,
  salvarReferenciaVendedor,
} from '../../utils/checkoutIntent';

type FormaContratacaoPublica = 'onibus_hospedagem' | 'hospedagem' | 'onibus';

interface PacotePublicado {
  id: string;
  nome: string;
  descricao: string;
  valor_total: string;
  modalidade_hospedagem: 'camping' | 'quarto_ventilador' | 'quarto_ar_condicionado';
  forma_contratacao: 'onibus' | 'hospedagem' | 'onibus_hospedagem' | 'livre';
  formas_contratacao?: FormaContratacaoPublica[];
  disponibilidade_por_forma?: Partial<Record<FormaContratacaoPublica, { disponibilidade?: string; vagas_disponiveis?: number; lote_comercial_id?: string | null }>>;
  disponibilidade: 'disponivel' | 'ultimas_vagas' | 'esgotado' | 'aguardando' | string;
  formas_pagamento?: string[];
  boleto_parcelas_maximo?: number | null;
  configuracao_necessaria?: boolean;
  periodos?: PeriodoPublicado[];
  destaque_titulo?: string | null;
  destaque_subtitulo?: string | null;
  destaque_texto?: string | null;
  lote_comercial_id?: string | null;
  lote_comercial_nome?: string | null;
  lote_comercial_valor?: string | number | null;
}

interface PeriodoPublicado {
  id: string;
  nome: string;
  descricao?: string | null;
  data_inicio: string;
  data_fim: string;
  data_embarque?: string | null;
  data_retorno?: string | null;
  disponibilidade?: 'disponivel' | 'ultimas_vagas' | 'esgotado' | 'aguardando' | string | null;
  vagas_disponiveis?: number;
  valor_total?: string | number | null;
  lote_comercial_id?: string | null;
  lote_comercial_nome?: string | null;
  lote_comercial_data_fim?: string | null;
}

const modalidadeMeta: Record<PacotePublicado['modalidade_hospedagem'], { label: string; icon: typeof TentTree; destaque: string }> = {
  camping: { label: 'Camping', icon: TentTree, destaque: 'A energia coletiva da comitiva' },
  quarto_ventilador: { label: 'Quarto com ventilador', icon: Wind, destaque: 'Conforto essencial para descansar' },
  quarto_ar_condicionado: { label: 'Quarto com ar-condicionado', icon: Snowflake, destaque: 'A experiência com máximo conforto' },
};

const formaContratacaoMeta: Record<FormaContratacaoPublica, { label: string; descricao: string }> = {
  onibus_hospedagem: { label: 'Transporte + hospedagem', descricao: 'Contrato completo com hospedagem e transporte rodoviário.' },
  hospedagem: { label: 'Somente hospedagem', descricao: 'Contrato apenas da hospedagem e serviços vinculados ao pacote.' },
  onibus: { label: 'Somente transporte', descricao: 'Contrato apenas do transporte rodoviário de ida e volta.' },
};

function formasPublicas(pacote: PacotePublicado): FormaContratacaoPublica[] {
  if (pacote.modalidade_hospedagem === 'camping') return ['onibus'];
  if (Array.isArray(pacote.formas_contratacao)) return pacote.formas_contratacao.filter((forma): forma is FormaContratacaoPublica => forma in formaContratacaoMeta);
  if (pacote.forma_contratacao in formaContratacaoMeta) return [pacote.forma_contratacao as FormaContratacaoPublica];
  return [];
}

function rotuloPagamento(pacote?: PacotePublicado) {
  if (!pacote) return 'Definido após escolher o pacote';
  const formas = Array.isArray(pacote.formas_pagamento) ? pacote.formas_pagamento : [];
  const partes: string[] = [];
  if (formas.includes('pix')) partes.push('PIX');
  if (formas.includes('boleto')) {
    const parcelas = Number(pacote.boleto_parcelas_maximo || 0);
    partes.push(parcelas > 1 ? `Boleto em até ${parcelas}x` : 'Boleto');
  }
  if (formas.includes('credito')) partes.push('Cartão conforme disponibilidade');
  if (formas.includes('debito')) partes.push('Débito conforme disponibilidade');
  return partes.length ? partes.join(' · ') : 'Condição apresentada no checkout';
}

function formatarMoeda(valor: string | number) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero) : 'Consultar';
}

function formatarPeriodo(data: string) {
  return new Date(data).toLocaleDateString('pt-BR');
}

export default function ConfiguradorPacote() {
  const { loteId } = useParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const pacoteSolicitado = searchParams.get('pacote');
  const periodoSolicitado = searchParams.get('periodo');
  const [pacotes, setPacotes] = useState<PacotePublicado[]>([]);
  const [pacoteId, setPacoteId] = useState<string>('');
  const [periodoId, setPeriodoId] = useState<string>('');
  const [formaContratacao, setFormaContratacao] = useState<FormaContratacaoPublica | ''>('');
  const [participantes, setParticipantes] = useState<ParticipanteCheckout[]>([]);
  const [calculo, setCalculo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState('');

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
        const pacotesResponse = await api.get(`/pacotes/lotes/${loteId}/pacotes`);
        const listaPacotes = pacotesResponse.data.pacotes || [];
        setPacotes(listaPacotes);
        const intencaoSalva = lerIntencaoCheckout();
        const retomando = searchParams.get('retomar') === '1';
        const pacoteSalvoId = intencaoSalva && intencaoSalva.loteId === loteId ? intencaoSalva.pacoteId : undefined;
        const pacoteSalvo = pacoteSalvoId
          ? listaPacotes.find((pacote: PacotePublicado) => pacote.id === pacoteSalvoId && pacote.disponibilidade !== 'esgotado')
          : undefined;
        const formaSalva = intencaoSalva?.formaContratacao as FormaContratacaoPublica | undefined;
        const intencaoValida = Boolean(
          retomando
          && pacoteSalvo
          && formaSalva
          && formasPublicas(pacoteSalvo).includes(formaSalva),
        );

        // A URL pode apontar para um pacote/modalidade de interesse, mas nunca decide
        // automaticamente o escopo jurídico/comercial. Só restauramos uma escolha
        // quando o próprio cliente já a fez antes do login e está retomando o checkout.
        if (intencaoValida && pacoteSalvo && formaSalva) {
          setPacoteId(pacoteSalvo.id);
          setPeriodoId(intencaoSalva?.periodoId || (pacoteSalvo.periodos?.length === 1 ? pacoteSalvo.periodos[0].id : ''));
          setFormaContratacao(formaSalva);
          setParticipantes(intencaoSalva?.participantes || []);
        } else {
          const pacoteDaVitrine = pacoteSolicitado
            ? listaPacotes.find((pacote: PacotePublicado) => pacote.id === pacoteSolicitado && pacote.disponibilidade !== 'esgotado')
            : undefined;
          const periodoDaVitrine = periodoSolicitado && pacoteDaVitrine?.periodos?.some((periodo: PeriodoPublicado) => periodo.id === periodoSolicitado)
            ? periodoSolicitado
            : pacoteDaVitrine?.periodos?.length === 1 ? pacoteDaVitrine.periodos[0].id : '';
          setPacoteId(pacoteDaVitrine?.id || '');
          setPeriodoId(periodoDaVitrine);
          setFormaContratacao('');
          setParticipantes([]);
        }
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Não foi possível carregar as opções do pacote. Tente novamente.');
        setPacotes([]);
      } finally {
        setIsLoading(false);
      }
    };
    carregarConfigurador();
  }, [loteId, pacoteSolicitado, periodoSolicitado]);

  useEffect(() => {
    if (isLoading || !loteId || !formaContratacao) return;
    let cancelado = false;
    api.get(`/pacotes/lotes/${loteId}/pacotes`, { params: { forma_contratacao: formaContratacao, periodo_id: periodoId || undefined } })
      .then((response) => { if (!cancelado) setPacotes(response.data.pacotes || []); })
      .catch(() => undefined);
    return () => { cancelado = true; };
  }, [loteId, formaContratacao, periodoId, isLoading]);

  const pacoteSelecionado = useMemo(() => pacotes.find((pacote) => pacote.id === pacoteId), [pacotes, pacoteId]);
  const pacoteSugerido = useMemo(() => pacoteSolicitado ? pacotes.find((pacote) => pacote.id === pacoteSolicitado) : undefined, [pacotes, pacoteSolicitado]);
  const formasDisponiveis: FormaContratacaoPublica[] = ['onibus_hospedagem', 'hospedagem', 'onibus'];
  const pacotesDoTipo = useMemo(() => {
    if (!formaContratacao) return [];
    const filtrados = pacotes.filter((pacote) => formasPublicas(pacote).includes(formaContratacao));
    // Um link de vitrine serve apenas como preferência visual. Depois de o cliente
    // escolher o tipo de contratação, a mesma modalidade aparece primeiro se existir.
    return [...filtrados].sort((a, b) => {
      const modalidadePreferida = pacoteSugerido?.modalidade_hospedagem;
      if (!modalidadePreferida) return 0;
      return Number(b.modalidade_hospedagem === modalidadePreferida) - Number(a.modalidade_hospedagem === modalidadePreferida);
    });
  }, [pacotes, formaContratacao, pacoteSugerido]);
  const exigeHospedagem = formaContratacao === 'hospedagem' || formaContratacao === 'onibus_hospedagem';
  const periodosDisponiveis = pacoteSelecionado?.periodos || [];
  const exigePeriodo = periodosDisponiveis.length > 0;
  const periodoSelecionado = periodosDisponiveis.find((periodo) => periodo.id === periodoId);
  const loteComercialId = periodoSelecionado?.lote_comercial_id || pacoteSelecionado?.lote_comercial_id || undefined;
  useEffect(() => {
    if (isLoading || !loteId || !formaContratacao || (pacotes.length > 0 && !pacoteId) || (exigePeriodo && !periodoId)) {
      setCalculo(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsCalculating(true);
      try {
        const response = await api.post('/pacotes/calcular', { lote_id: loteId, pacote_id: pacoteId || undefined, periodo_id: periodoId || undefined, lote_comercial_id: loteComercialId, forma_contratacao: formaContratacao, itens: [] });
        setCalculo(response.data);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao calcular o valor do pacote.');
        setCalculo(null);
      } finally {
        setIsCalculating(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [loteId, pacoteId, periodoId, loteComercialId, formaContratacao, pacotes.length, isLoading, exigePeriodo]);

  const selecionarFormaContratacao = (forma: FormaContratacaoPublica) => {
    if (formaContratacao !== forma) { setPacoteId(''); setPeriodoId(''); }
    setFormaContratacao(forma);
    setCalculo(null);
    setError('');
  };

  const selecionarPacote = (id: string) => {
    const selecionado = pacotes.find((pacote) => pacote.id === id);
    if (!formaContratacao || !selecionado || !formasPublicas(selecionado).includes(formaContratacao)) {
      setError('Escolha primeiro o tipo de contratação e depois um pacote compatível.');
      return;
    }
    if (selecionado.disponibilidade === 'esgotado' || selecionado.disponibilidade_por_forma?.[formaContratacao]?.disponibilidade === 'esgotado') {
      setError('Esta forma de contratação está esgotada para o pacote selecionado.');
      return;
    }
    setPacoteId(id);
    setPeriodoId(
      selecionado.periodos?.find((periodo) => periodo.id === periodoSolicitado)?.id
      || (selecionado.periodos?.length === 1 ? selecionado.periodos[0].id : ''),
    );
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

  const adicionarParticipante = () => {
    setParticipantes((atuais) => [...atuais, { nome_completo: '' }]);
  };

  const atualizarParticipante = (indice: number, campo: keyof ParticipanteCheckout, valor: string) => {
    setParticipantes((atuais) => atuais.map((participante, index) => index === indice ? { ...participante, [campo]: valor } : participante));
  };

  const removerParticipante = (indice: number) => {
    setParticipantes((atuais) => atuais.filter((_, index) => index !== indice));
  };

  const handleReservar = async () => {
    if (authLoading) return;
    if (!formaContratacao) {
      setError('Escolha o tipo de contratação para continuar.');
      return;
    }
    if (pacotes.length > 0 && !pacoteId) {
      setError(formaContratacao === 'onibus' ? 'Escolha seu pacote de transporte para continuar.' : 'Escolha sua modalidade de hospedagem para continuar.');
      return;
    }
    if (exigePeriodo && !periodoId) {
      setError('Escolha o período da viagem para continuar.');
      return;
    }
    if (periodoSelecionado?.disponibilidade === 'esgotado' || periodoSelecionado?.disponibilidade === 'aguardando') {
      setError('Este período está esgotado. Escolha outra data para continuar.');
      return;
    }
      if (pacoteSelecionado?.disponibilidade === 'esgotado' || pacoteSelecionado?.disponibilidade === 'aguardando') {
      setError('Esta modalidade está esgotada. Escolha outra opção para continuar.');
      return;
    }
    if (participantes.some((participante) => !participante.nome_completo.trim())) {
      setError('Informe o nome completo de cada pessoa adicionada à comitiva.');
      return;
    }
    if (exigeHospedagem && participantes.some((participante) => !participante.sexo_operacional)) {
      setError('Informe o sexo de cada pessoa para reservar o quarto correto.');
      return;
    }
    if (user) {
      try {
        const perfil = (await api.get('/auth/perfil')).data.usuario;
        const cadastroCompleto = Boolean(
          ['masculino', 'feminino'].includes(String(perfil?.sexo || '').toLowerCase())
          && String(perfil?.cep || '').replace(/\D/g, '').length === 8
          && String(perfil?.logradouro || '').trim()
          && String(perfil?.numero || '').trim()
          && String(perfil?.bairro || '').trim()
          && String(perfil?.cidade || '').trim()
          && String(perfil?.estado || '').trim(),
        );
        if (!cadastroCompleto) {
          const retorno = `/pacote/${loteId}?retomar=1${pacoteId ? `&pacote=${encodeURIComponent(pacoteId)}` : ''}`;
          navigate(`/meus-dados?redirect=${encodeURIComponent(retorno)}`);
          return;
        }
      } catch {
        // O backend repetirá a validação se a consulta de perfil não estiver disponível.
      }
    }
    setError('');
    let leadId = lerLeadId();
    const leadIntentToken = lerLeadIntentToken();
    const intent = {
      loteId: loteId!,
      pacoteId,
      periodoId: periodoId || undefined,
      formaContratacao,
      participantes,
      criadoEm: new Date().toISOString(),
    };
    salvarIntencaoCheckout(intent);

    if (!user) {
      if (leadId && leadIntentToken) {
        api.patch(`/publico/leads/${leadId}/intencao`, {
          lote_id: loteId,
          pacote_id: pacoteId,
          periodo_id: periodoId || undefined,
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
      const response = await api.post('/pacotes/reservar', {
        lote_id: loteId,
        pacote_id: pacoteId || undefined,
        periodo_id: periodoId || undefined,
        lote_comercial_id: loteComercialId,
        forma_contratacao: formaContratacao,
        itens: [],
        participantes,
        lead_id: leadId || undefined,
        lead_intent_token: leadIntentToken || undefined,
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
        <meta name="description" content="Escolha o tipo de contratação, o pacote e confira as condições da sua reserva para Barretos." />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="space-y-6 lg:col-span-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#182D3B]/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => navigate('/eventos')} className="inline-flex items-center gap-2 text-sm font-extrabold text-[#851F32] hover:underline"><ArrowLeft size={16}/>Voltar e comparar pacotes</button>
          <div className="flex items-center gap-2 overflow-x-auto text-[11px] font-black uppercase tracking-[.1em] text-slate-400">
            <span className="rounded-full bg-[#851F32] px-3 py-1.5 text-white">1 · Contrato</span><ArrowRight size={13}/><span>2 · Pacote</span><ArrowRight size={13}/><span>3 · Pessoas</span><ArrowRight size={13}/><span>4 · Checkout</span>
          </div>
        </div>
        <section className="rounded-[1.6rem] bg-[#182D3B] p-5 text-white shadow-[0_18px_50px_rgba(24,45,59,0.18)] sm:rounded-[2rem] sm:p-7">
          <div className="flex items-center gap-3 text-[#E3AAB4]"><Sparkles size={18} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Sua experiência, suas escolhas</span></div>
          <h1 className="font-editorial mt-3 text-2xl font-bold tracking-[-0.025em] sm:text-4xl">Monte seu pacote de viagem</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">Primeiro escolha o que será contratado; depois selecione a modalidade e identifique quem viajará com você.</p>
        </section>

        {error && <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}

        {pacotes.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4"><h2 className="text-xl font-bold text-slate-900">1. O que você quer contratar?</h2><p className="text-sm text-gray-500">Esta escolha define o escopo do contrato. As três opções ficam visíveis; as indisponíveis não podem ser selecionadas.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">
              {formasDisponiveis.map((forma) => {
                const meta = formaContratacaoMeta[forma];
                const selecionado = formaContratacao === forma;
                const indisponivel = !pacotes.some((pacote) => formasPublicas(pacote).includes(forma) && pacote.disponibilidade_por_forma?.[forma]?.disponibilidade !== 'esgotado' && pacote.disponibilidade !== 'esgotado');
                return <button key={forma} type="button" aria-pressed={selecionado} disabled={indisponivel} onClick={() => selecionarFormaContratacao(forma)} className={`relative rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${selecionado ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/20' : 'border-gray-200 bg-white hover:border-primary/40'}`}>
                  {selecionado && <span className="absolute right-3 top-3 rounded-full bg-primary p-1 text-white"><Check size={14} /></span>}
                  <p className="pr-8 text-sm font-black text-slate-900">{meta.label}</p>
                  <p className="mt-2 text-xs leading-5 text-gray-500">{meta.descricao}</p>
                  {indisponivel && <span className="mt-3 inline-block rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Indisponível nesta excursão</span>}
                </button>;
              })}
            </div>
          </section>
        )}

        {pacoteSugerido && !formaContratacao && (
          <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <Info size={18} className="mt-0.5 shrink-0" />
            <p>Você escolheu <strong>{pacoteSugerido.nome}</strong>. Agora selecione somente o tipo de contratação e o período da viagem.</p>
          </div>
        )}

        {formaContratacao && pacotesDoTipo.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ainda não existe uma oferta com preço publicado para <strong>{formaContratacaoMeta[formaContratacao].label}</strong> nesta excursão. Escolha outro tipo ou aguarde a publicação comercial.</div>
        )}

        {formaContratacao && pacotesDoTipo.length > 0 && (
          <section>
            <div className="mb-3"><h2 className="text-xl font-bold text-slate-900">2. {pacoteSolicitado && pacoteSelecionado ? 'Pacote selecionado' : formaContratacao === 'onibus' ? 'Escolha seu pacote de transporte' : 'Escolha sua hospedagem'}</h2><p className="text-sm text-gray-500">{pacoteSolicitado && pacoteSelecionado ? 'O pacote escolhido na vitrine está abaixo. Se quiser, você pode trocar antes de continuar.' : <>Mostramos somente as opções cadastradas para <strong>{formaContratacaoMeta[formaContratacao].label.toLowerCase()}</strong>. O preço exibido é o preço real desse pacote.</>}</p></div>
            {pacoteSolicitado && pacoteSelecionado && pacoteSelecionado.id === pacoteId ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-primary">Sua escolha</p><h3 className="mt-1 text-lg font-bold text-slate-900">{pacoteSelecionado.nome}</h3><p className="mt-1 text-sm text-slate-600">{formatarMoeda(pacoteSelecionado.valor_total)} · {rotuloPagamento(pacoteSelecionado)}</p></div><button type="button" onClick={() => { setPacoteId(''); setPeriodoId(''); setCalculo(null); }} className="rounded-full border border-primary/30 px-4 py-2 text-sm font-bold text-primary hover:bg-white">Trocar pacote</button></div></div>
            ) : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pacotesDoTipo.map((pacote) => {
                const meta = modalidadeMeta[pacote.modalidade_hospedagem];
                const Icon = meta?.icon || TentTree;
                const selecionado = pacote.id === pacoteId;
                const aguardando = pacote.disponibilidade === 'aguardando' || pacote.disponibilidade_por_forma?.[formaContratacao]?.disponibilidade === 'aguardando';
                const esgotado = pacote.disponibilidade === 'esgotado' || aguardando || pacote.disponibilidade_por_forma?.[formaContratacao]?.disponibilidade === 'esgotado';
                return <button key={pacote.id} type="button" aria-pressed={selecionado} disabled={esgotado} onClick={() => selecionarPacote(pacote.id)} className={`relative rounded-2xl border p-4 text-left transition-all sm:p-5 disabled:cursor-not-allowed disabled:opacity-60 ${selecionado ? 'border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20' : 'border-gray-200 bg-white hover:border-primary/40 hover:shadow-md'}`}>
                  {selecionado && <span className="absolute left-3 top-3 rounded-full bg-primary p-1 text-white"><Check size={14} /></span>}
                  {pacote.disponibilidade !== 'disponivel' && <span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-black uppercase ${aguardando ? 'bg-slate-100 text-slate-700' : esgotado ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-800'}`}>{aguardando ? 'Indisponível' : esgotado ? 'Esgotado' : 'Últimas vagas'}</span>}
                  <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-3 text-primary"><Icon size={24} /></div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">{formaContratacao === 'onibus' ? 'Transporte' : meta?.label}</p>
                  <h3 className="mt-1 font-bold text-slate-900">{pacote.nome}</h3>
                  {(pacote.destaque_titulo || pacote.destaque_subtitulo || pacote.destaque_texto) && <div className="mt-3 rounded-xl border border-[#C94F38]/15 bg-[#fff7f3] px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#C94F38]">{pacote.destaque_subtitulo || 'Destaque'}</p>{pacote.destaque_titulo && <p className="mt-1 text-sm font-extrabold text-slate-900">{pacote.destaque_titulo}</p>}{pacote.destaque_texto && <p className="mt-1 text-xs leading-5 text-slate-600">{pacote.destaque_texto}</p>}</div>}
                  <p className="mt-2 min-h-10 text-sm text-gray-500">{pacote.descricao || (formaContratacao === 'onibus' ? 'Transporte rodoviário da excursão.' : meta?.destaque)}</p>
                  <p className="mt-4 text-xl font-bold text-slate-900">{formatarMoeda(pacote.valor_total)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{rotuloPagamento(pacote)}</p>
                </button>;
              })}
            </div>}
            {pacoteSelecionado && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><strong>{formaContratacaoMeta[formaContratacao].label}</strong> · {pacoteSelecionado.nome} selecionado.</div>}
          </section>
        )}

        {pacoteSelecionado && exigePeriodo && <section className="rounded-2xl border border-[#C94F38]/20 bg-white p-5">
          <div className="mb-3"><h2 className="text-xl font-bold text-slate-900">Escolha o período</h2><p className="text-sm text-gray-500">Este pacote possui mais de uma data. Selecione exatamente o final de semana ou intervalo desejado.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{periodosDisponiveis.map((periodo) => { const aguardando = periodo.disponibilidade === 'aguardando'; const esgotado = periodo.disponibilidade === 'esgotado' || aguardando; return <button key={periodo.id} type="button" aria-pressed={periodoId === periodo.id} disabled={esgotado} onClick={() => { setPeriodoId(periodo.id); setCalculo(null); setError(''); }} className={`rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${periodoId === periodo.id ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/20' : 'border-slate-200 hover:border-primary/40'}`}><div className="flex items-start justify-between gap-3"><p className="font-bold text-slate-900">{periodo.nome}</p>{periodo.disponibilidade && <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${aguardando ? 'bg-slate-100 text-slate-700' : esgotado ? 'bg-slate-800 text-white' : periodo.disponibilidade === 'ultimas_vagas' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{aguardando ? 'Indisponível' : esgotado ? 'Esgotado' : periodo.disponibilidade === 'ultimas_vagas' ? 'Últimas vagas' : 'Disponível'}</span>}</div><p className="mt-1 text-sm text-slate-600">{formatarPeriodo(periodo.data_inicio)} a {formatarPeriodo(periodo.data_fim)}</p>{periodo.lote_comercial_nome && <p className="mt-1 text-xs font-semibold text-primary">{periodo.lote_comercial_nome}{periodo.lote_comercial_data_fim ? ` · até ${formatarPeriodo(periodo.lote_comercial_data_fim)}` : ''}</p>}{periodo.valor_total && <p className="mt-1 text-sm font-black text-slate-900">{formatarMoeda(periodo.valor_total)} por pessoa</p>}{periodo.descricao && <p className="mt-2 text-xs leading-5 text-slate-500">{periodo.descricao}</p>}{periodoId === periodo.id && <span className="mt-2 inline-block text-xs font-bold text-primary">Período selecionado</span>}</button>; })}</div>
        </section>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-bold text-slate-900">3. Vai viajar com mais alguém?</h2><p className="text-sm text-gray-500">Adicione as pessoas da sua comitiva. Os dados serão identificados no contrato.</p></div>
            <Button type="button" variant="outline" onClick={adicionarParticipante}><UserPlus size={16} className="mr-2" />Adicionar pessoa</Button>
          </div>
          {participantes.length > 0 && <div className="mt-4 space-y-3">
            {participantes.map((participante, indice) => <div key={indice} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-slate-800">Pessoa {indice + 2}</p><button type="button" onClick={() => removerParticipante(indice)} className="rounded-md p-2 text-red-700 hover:bg-red-50" aria-label={`Remover pessoa ${indice + 2}`}><Trash2 size={16} /></button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Nome completo<input value={participante.nome_completo} onChange={(event) => atualizarParticipante(indice, 'nome_completo', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required /></label>
                <label className="text-xs font-semibold text-slate-600">CPF (opcional)<input value={participante.cpf || ''} onChange={(event) => atualizarParticipante(indice, 'cpf', event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">Data de nascimento<input type="date" value={participante.data_nascimento || ''} onChange={(event) => atualizarParticipante(indice, 'data_nascimento', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">Telefone (opcional)<input value={participante.telefone || ''} onChange={(event) => atualizarParticipante(indice, 'telefone', event.target.value)} inputMode="tel" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">E-mail (opcional)<input type="email" value={participante.email || ''} onChange={(event) => atualizarParticipante(indice, 'email', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                {exigeHospedagem && <label className="text-xs font-semibold text-slate-600">Sexo da pessoa *<select required value={participante.sexo_operacional || ''} onChange={(event) => atualizarParticipante(indice, 'sexo_operacional', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Selecione</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>}
              </div>
            </div>)}
        </div>}
        </section>
      </div>

      <aside className="lg:col-span-1">
        <Card className="sticky top-[104px] overflow-hidden border-[#182D3B]/10 shadow-[0_18px_45px_rgba(24,45,59,0.10)]"><CardHeader className="border-b bg-[#182D3B] text-white"><CardTitle>Resumo da reserva</CardTitle></CardHeader><CardContent className="space-y-4 p-6">
          <div className="flex justify-between gap-4 text-sm"><span className="text-gray-600">Contrato</span><span className="max-w-44 text-right font-semibold text-slate-900">{formaContratacao ? formaContratacaoMeta[formaContratacao].label : 'Escolha o tipo'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Pacote</span><span className="max-w-40 text-right font-medium">{pacoteSelecionado?.nome || (pacotes.length ? 'Escolha uma opção' : 'Pacote base')}</span></div>
          {exigePeriodo && <div className="flex justify-between gap-4 text-sm"><span className="text-gray-600">Período</span><span className="max-w-48 text-right font-medium">{periodosDisponiveis.find((periodo) => periodo.id === periodoId)?.nome || 'Escolha uma data'}</span></div>}
          <div className="flex justify-between text-sm"><span className="text-gray-600">Valor-base</span><span className="font-medium">{formatarMoeda(calculo?.valor_base || 0)}</span></div>
          <div className="flex justify-between gap-4 text-sm"><span className="text-gray-600">Pagamento</span><span className="max-w-48 text-right font-medium text-slate-800">{rotuloPagamento(pacoteSelecionado)}</span></div>
          <div className="border-t pt-4"><div className="flex items-center justify-between"><span className="text-lg font-bold">Total</span><span className="text-2xl font-bold text-primary">{isCalculating ? '...' : formatarMoeda(calculo?.valor_total || 0)}</span></div></div>
          <Button className="mt-3 w-full" size="lg" onClick={handleReservar} isLoading={isReserving} disabled={isCalculating || !formaContratacao || (pacotes.length > 0 && !pacoteId) || pacoteSelecionado?.disponibilidade === 'esgotado'}>{user ? 'Continuar para checkout' : 'Continuar'}</Button>
          <div className="flex gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-700"><Info size={16} className="shrink-0" /><p>Na próxima etapa você entra ou cria sua conta. Sua escolha ficará salva para continuar sem recomeçar.</p></div>
        </CardContent></Card>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#182D3B]/10 bg-white/95 p-3 shadow-[0_-12px_34px_rgba(24,45,59,.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-500">{formaContratacao ? `${formaContratacaoMeta[formaContratacao].label} · ${pacoteSelecionado?.nome || 'escolha o pacote'}` : 'Escolha o tipo de contratação'}</p>
            <p className="text-lg font-black text-[#182D3B]">{isCalculating ? 'Calculando…' : formatarMoeda(calculo?.valor_total || pacoteSelecionado?.valor_total || 0)}</p>
          </div>
          <Button onClick={handleReservar} isLoading={isReserving} disabled={isCalculating || !formaContratacao || (pacotes.length > 0 && !pacoteId) || pacoteSelecionado?.disponibilidade === 'esgotado'}>{user ? 'Continuar' : 'Continuar'} <ArrowRight size={16}/></Button>
        </div>
      </div>
    </div>
  );
}
