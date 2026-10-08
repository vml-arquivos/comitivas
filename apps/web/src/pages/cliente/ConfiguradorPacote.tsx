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

function menorPrecoPacote(pacote?: PacotePublicado) {
  if (!pacote) return 0;
  const valoresPeriodo = (pacote.periodos || [])
    .filter((periodo) => !['esgotado', 'aguardando'].includes(String(periodo.disponibilidade)))
    .map((periodo) => Number(periodo.valor_total))
    .filter((valor) => Number.isFinite(valor) && valor > 0);
  if (valoresPeriodo.length) return Math.min(...valoresPeriodo);
  const valor = Number(pacote.lote_comercial_valor || pacote.valor_total || 0);
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

function parcelamentoPacote(pacote?: PacotePublicado, valor?: number) {
  const total = Number(valor || menorPrecoPacote(pacote));
  const parcelas = Math.max(1, Number(pacote?.boleto_parcelas_maximo || 1));
  if (!Number.isFinite(total) || total <= 0 || parcelas <= 1) return null;
  return { parcelas, valor: total / parcelas };
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
  const [transporteProprio, setTransporteProprio] = useState(false);
  const [participantes, setParticipantes] = useState<ParticipanteCheckout[]>([]);
  const [calculo, setCalculo] = useState<any>(null);
  const [cotacoesForma, setCotacoesForma] = useState<Partial<Record<FormaContratacaoPublica, any>>>({});
  const [isCalculatingOptions, setIsCalculatingOptions] = useState(false);
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

        // A escolha pública começa pelo produto. Ao voltar do login/cadastro,
        // restauramos pacote, período e pessoas mesmo que o cliente ainda não tenha
        // decidido o escopo de serviços. Transporte/hospedagem é decidido somente
        // na etapa final, imediatamente antes da reserva/checkout.
        if (retomando && pacoteSalvo) {
          setPacoteId(pacoteSalvo.id);
          setPeriodoId(intencaoSalva?.periodoId || (pacoteSalvo.periodos?.length === 1 ? pacoteSalvo.periodos[0].id : ''));
          const formaValida = formaSalva && formasPublicas(pacoteSalvo).includes(formaSalva) ? formaSalva : '';
          setFormaContratacao(formaValida);
          setTransporteProprio(formaValida === 'hospedagem');
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
          setTransporteProprio(false);
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

  const pacoteSelecionado = useMemo(() => pacotes.find((pacote) => pacote.id === pacoteId), [pacotes, pacoteId]);
  const formasDisponiveis = useMemo<FormaContratacaoPublica[]>(() => pacoteSelecionado ? formasPublicas(pacoteSelecionado) : [], [pacoteSelecionado]);
  const periodosDisponiveis = pacoteSelecionado?.periodos || [];
  const exigePeriodo = periodosDisponiveis.length > 0;
  const periodoSelecionado = periodosDisponiveis.find((periodo) => periodo.id === periodoId);
  const exigeHospedagem = pacoteSelecionado?.modalidade_hospedagem !== 'camping' && (formaContratacao === 'hospedagem' || formaContratacao === 'onibus_hospedagem');
  const selecaoProdutoCompleta = Boolean(pacoteSelecionado && (!exigePeriodo || periodoId));

  const valorInicialPacote = useMemo(() => {
    if (!pacoteSelecionado) return 0;
    const valoresPeriodos = periodosDisponiveis
      .filter((periodo) => !['esgotado', 'aguardando'].includes(String(periodo.disponibilidade)))
      .map((periodo) => Number(periodo.valor_total))
      .filter((valor) => Number.isFinite(valor) && valor > 0);
    if (valoresPeriodos.length) return Math.min(...valoresPeriodos);
    const valorPacote = Number(pacoteSelecionado.lote_comercial_valor || pacoteSelecionado.valor_total || 0);
    return Number.isFinite(valorPacote) ? valorPacote : 0;
  }, [pacoteSelecionado, periodosDisponiveis]);

  // Depois que pacote/período e conta estão definidos, simulamos cada forma de
  // contratação no backend. Assim o cliente compara valores reais sem o frontend
  // inventar desconto, preço promocional ou disponibilidade.
  useEffect(() => {
    if (!user || !loteId || !pacoteSelecionado || (exigePeriodo && !periodoId)) {
      setCotacoesForma({});
      return;
    }
    let cancelado = false;
    setIsCalculatingOptions(true);
    const carregar = async () => {
      const resultados = await Promise.all(formasPublicas(pacoteSelecionado).map(async (forma) => {
        try {
          const response = await api.post('/pacotes/calcular', {
            lote_id: loteId,
            pacote_id: pacoteSelecionado.id,
            periodo_id: periodoId || undefined,
            forma_contratacao: forma,
            transporte_proprio: forma === 'hospedagem',
            itens: [],
          });
          return [forma, response.data] as const;
        } catch (err: any) {
          return [forma, { erro: err.response?.data?.erro || 'Indisponível' }] as const;
        }
      }));
      if (!cancelado) setCotacoesForma(Object.fromEntries(resultados) as Partial<Record<FormaContratacaoPublica, any>>);
      if (!cancelado) setIsCalculatingOptions(false);
    };
    void carregar();
    return () => { cancelado = true; };
  }, [user, loteId, pacoteSelecionado?.id, periodoId, exigePeriodo]);

  useEffect(() => {
    if (!formaContratacao) {
      setCalculo(null);
      return;
    }
    const cotacao = cotacoesForma[formaContratacao];
    if (cotacao && !cotacao.erro) setCalculo(cotacao);
    else setCalculo(null);
  }, [formaContratacao, cotacoesForma]);

  const selecionarFormaContratacao = (forma: FormaContratacaoPublica) => {
    if (!pacoteSelecionado || !formasPublicas(pacoteSelecionado).includes(forma)) return;
    const cotacao = cotacoesForma[forma];
    if (cotacao?.erro) {
      setError(cotacao.erro);
      return;
    }
    setFormaContratacao(forma);
    setTransporteProprio(forma === 'hospedagem');
    setCalculo(cotacao || null);
    setError('');
  };

  const selecionarPacote = (id: string) => {
    const selecionado = pacotes.find((pacote) => pacote.id === id);
    if (!selecionado) return;
    if (selecionado.disponibilidade === 'esgotado') {
      setError('Este pacote está esgotado. Escolha outra opção.');
      return;
    }
    setPacoteId(id);
    setFormaContratacao('');
    setTransporteProprio(false);
    setCotacoesForma({});
    setCalculo(null);
    setPeriodoId(
      selecionado.periodos?.find((periodo) => periodo.id === periodoSolicitado)?.id
      || (selecionado.periodos?.length === 1 ? selecionado.periodos[0].id : ''),
    );
    setError('');
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
    if (pacotes.length > 0 && !pacoteId) {
      setError('Escolha seu pacote para continuar.');
      return;
    }
    if (exigePeriodo && !periodoId) {
      setError('Escolha o período da viagem para continuar.');
      return;
    }
    if (periodoSelecionado?.disponibilidade === 'esgotado' || periodoSelecionado?.disponibilidade === 'aguardando') {
      setError('Este período não está disponível. Escolha outra data para continuar.');
      return;
    }
    if (pacoteSelecionado?.disponibilidade === 'esgotado' || pacoteSelecionado?.disponibilidade === 'aguardando') {
      setError('Este pacote não está disponível. Escolha outra opção para continuar.');
      return;
    }
    if (participantes.some((participante) => !participante.nome_completo.trim())) {
      setError('Informe o nome completo de cada pessoa adicionada à comitiva.');
      return;
    }

    setError('');
    let leadId = lerLeadId();
    const leadIntentToken = lerLeadIntentToken();
    const intent = {
      loteId: loteId!,
      pacoteId,
      periodoId: periodoId || undefined,
      formaContratacao: formaContratacao || undefined,
      transporteProprio: formaContratacao ? transporteProprio : undefined,
      participantes,
      criadoEm: new Date().toISOString(),
    };
    salvarIntencaoCheckout(intent);

    // A conta vem antes da decisão final de serviços. O visitante escolhe pacote,
    // período e pessoas sem ruído; depois do login/cadastro ele volta para esta
    // mesma tela e decide transporte/hospedagem com preço real de cada opção.
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

    if (!formaContratacao) {
      setError('Escolha como deseja contratar: completo, somente hospedagem ou somente transporte.');
      return;
    }
    const cotacaoEscolhida = cotacoesForma[formaContratacao];
    if (!cotacaoEscolhida || cotacaoEscolhida.erro) {
      setError(cotacaoEscolhida?.erro || 'Aguarde a atualização do valor desta opção e tente novamente.');
      return;
    }
    if (exigeHospedagem && participantes.some((participante) => !participante.sexo_operacional)) {
      setError('Informe o sexo de cada pessoa para reservar o quarto correto.');
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
        lote_comercial_id: cotacaoEscolhida.lote_comercial_id || undefined,
        forma_contratacao: formaContratacao,
        transporte_proprio: transporteProprio,
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

  if (isLoading) return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-[#182D3B]/60 sm:px-6 lg:px-8">Carregando pacotes...</div>;

  const cotacaoCompleta = cotacoesForma.onibus_hospedagem && !cotacoesForma.onibus_hospedagem.erro ? Number(cotacoesForma.onibus_hospedagem.valor_total || 0) : 0;
  const valorResumo = formaContratacao && calculo ? Number(calculo.valor_total || 0) : valorInicialPacote;
  const parcelamentoResumo = parcelamentoPacote(pacoteSelecionado, valorResumo);
  const podeAvancarProduto = Boolean(pacoteSelecionado && (!exigePeriodo || periodoId));
  const podeFinalizar = Boolean(user && formaContratacao && calculo && !calculo.erro);

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-7 pb-28 sm:px-6 sm:py-12 lg:grid-cols-3 lg:gap-8 lg:px-8 lg:pb-14">
      <Helmet>
        <title>Escolha seu pacote | Excursão das Comitivas</title>
        <meta name="description" content="Escolha seu pacote, o fim de semana e finalize a contratação da Excursão das Comitivas." />
        <meta name="robots" content="noindex,follow" />
      </Helmet>

      <div className="space-y-6 lg:col-span-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#182D3B]/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => navigate('/eventos')} className="inline-flex items-center gap-2 text-sm font-extrabold text-[#851F32] hover:underline"><ArrowLeft size={16}/>Voltar aos pacotes</button>
          <div className="flex items-center gap-2 overflow-x-auto text-[10px] font-black uppercase tracking-[.08em] text-slate-400">
            <span className="rounded-full bg-[#851F32] px-3 py-1.5 text-white">1 · Pacote</span><ArrowRight size={12}/><span>2 · Período</span><ArrowRight size={12}/><span>3 · Pessoas</span><ArrowRight size={12}/><span>4 · Serviços</span>
          </div>
        </div>

        <section className="rounded-[1.6rem] bg-[#182D3B] p-5 text-white shadow-[0_18px_50px_rgba(24,45,59,0.16)] sm:p-7">
          <div className="flex items-center gap-2 text-[#E3AAB4]"><Sparkles size={17}/><span className="text-[11px] font-bold uppercase tracking-[0.16em]">Sua viagem</span></div>
          <h1 className="font-editorial mt-2 text-3xl font-bold tracking-[-0.025em] sm:text-4xl">Escolha seu pacote</h1>
          <p className="mt-2 text-sm text-white/70">Pacote, fim de semana e pessoas. Os serviços finais são definidos antes do contrato.</p>
        </section>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#851F32]">1 · Pacote</p><h2 className="mt-1 text-xl font-bold text-slate-900">Onde você quer ficar?</h2></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pacotes.map((pacote) => {
              const meta = modalidadeMeta[pacote.modalidade_hospedagem];
              const Icon = meta?.icon || TentTree;
              const selecionado = pacote.id === pacoteId;
              const aguardando = pacote.disponibilidade === 'aguardando';
              const esgotado = pacote.disponibilidade === 'esgotado' || aguardando;
              const preco = menorPrecoPacote(pacote);
              const parcelamento = parcelamentoPacote(pacote, preco);
              return <button key={pacote.id} type="button" aria-pressed={selecionado} disabled={esgotado} onClick={() => selecionarPacote(pacote.id)} className={`relative min-h-[245px] rounded-2xl border p-5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${selecionado ? 'border-[#851F32] bg-[#851F32]/[0.035] shadow-lg ring-2 ring-[#851F32]/15' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[#851F32]/35 hover:shadow-md'}`}>
                {selecionado && <span className="absolute right-3 top-3 rounded-full bg-[#851F32] p-1 text-white"><Check size={14}/></span>}
                {esgotado && <span className="absolute right-3 top-3 rounded-full bg-slate-800 px-2 py-1 text-[9px] font-black uppercase text-white">{aguardando ? 'Em breve' : 'Esgotado'}</span>}
                <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-3 text-[#851F32]"><Icon size={24}/></div>
                <p className="text-[10px] font-black uppercase tracking-[.12em] text-[#851F32]">{meta?.label || 'Pacote'}</p>
                <h3 className="mt-1 text-lg font-extrabold text-slate-900">{pacote.nome}</h3>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{pacote.descricao || meta?.destaque}</p>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">A partir de</p>
                  {parcelamento ? <><div className="mt-1 flex items-end gap-1.5"><span className="pb-1 text-xs font-bold text-slate-500">{parcelamento.parcelas}x de</span><strong className="font-editorial text-3xl leading-none text-[#182D3B]">{formatarMoeda(parcelamento.valor)}</strong></div><p className="mt-1 text-[11px] text-slate-500">Total {formatarMoeda(preco)} por pessoa</p></> : <strong className="font-editorial mt-1 block text-3xl leading-none text-[#182D3B]">{formatarMoeda(preco)}</strong>}
                </div>
              </button>;
            })}
          </div>
          {pacotes.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">Nenhum pacote disponível neste momento.</div>}
        </section>

        {pacoteSelecionado && exigePeriodo && <section className="rounded-2xl border border-[#182D3B]/10 bg-white p-5">
          <div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#851F32]">2 · Período</p><h2 className="mt-1 text-xl font-bold text-slate-900">Escolha o fim de semana</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">{periodosDisponiveis.map((periodo) => {
            const aguardando = periodo.disponibilidade === 'aguardando';
            const esgotado = periodo.disponibilidade === 'esgotado' || aguardando;
            return <button key={periodo.id} type="button" aria-pressed={periodoId === periodo.id} disabled={esgotado} onClick={() => { setPeriodoId(periodo.id); setFormaContratacao(''); setCotacoesForma({}); setCalculo(null); setError(''); }} className={`relative rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-55 ${periodoId === periodo.id ? 'border-[#851F32] bg-[#851F32]/[0.035] ring-2 ring-[#851F32]/15' : 'border-slate-200 hover:border-[#851F32]/35'}`}>
              <div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-900">{periodo.nome}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${esgotado ? 'bg-slate-100 text-slate-600' : periodo.disponibilidade === 'ultimas_vagas' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{esgotado ? (aguardando ? 'Em breve' : 'Esgotado') : periodo.disponibilidade === 'ultimas_vagas' ? 'Últimas vagas' : 'Disponível'}</span></div>
              <p className="mt-2 text-sm text-slate-600">{formatarPeriodo(periodo.data_inicio)} a {formatarPeriodo(periodo.data_fim)}</p>
              {periodo.valor_total && <p className="mt-2 text-xs font-bold text-[#851F32]">A partir de {formatarMoeda(periodo.valor_total)}</p>}
            </button>;
          })}</div>
        </section>}

        {pacoteSelecionado && (!exigePeriodo || periodoId) && <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#851F32]">3 · Pessoas</p><h2 className="mt-1 text-xl font-bold text-slate-900">Quem vai com você?</h2></div>
            <Button type="button" variant="outline" onClick={adicionarParticipante}><UserPlus size={16} className="mr-2"/>Adicionar pessoa</Button>
          </div>
          {participantes.length > 0 && <div className="mt-4 space-y-3">{participantes.map((participante, indice) => <div key={indice} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-slate-800">Pessoa {indice + 2}</p><button type="button" onClick={() => removerParticipante(indice)} className="rounded-md p-2 text-red-700 hover:bg-red-50" aria-label={`Remover pessoa ${indice + 2}`}><Trash2 size={16}/></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Nome completo<input value={participante.nome_completo} onChange={(event) => atualizarParticipante(indice, 'nome_completo', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required/></label>
              <label className="text-xs font-semibold text-slate-600">CPF (opcional)<input value={participante.cpf || ''} onChange={(event) => atualizarParticipante(indice, 'cpf', event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
              <label className="text-xs font-semibold text-slate-600">Nascimento<input type="date" value={participante.data_nascimento || ''} onChange={(event) => atualizarParticipante(indice, 'data_nascimento', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
              {user && exigeHospedagem && <label className="text-xs font-semibold text-slate-600">Sexo para alocação *<select required value={participante.sexo_operacional || ''} onChange={(event) => atualizarParticipante(indice, 'sexo_operacional', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Selecione</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>}
            </div>
          </div>)}</div>}
          <p className="mt-3 text-xs text-slate-500">Você + {participantes.length} {participantes.length === 1 ? 'acompanhante' : 'acompanhantes'}.</p>
        </section>}

        {podeAvancarProduto && !user && <section className="rounded-2xl border border-[#851F32]/15 bg-[#fff8f6] p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
          <div><h2 className="font-bold text-[#182D3B]">Pacote escolhido.</h2><p className="mt-1 text-sm text-slate-600">Entre ou crie sua conta para escolher os serviços e finalizar.</p></div>
          <Button className="mt-4 w-full sm:mt-0 sm:w-auto" onClick={handleReservar}>Entrar e continuar <ArrowRight size={16} className="ml-2"/></Button>
        </section>}

        {podeAvancarProduto && user && <section className="rounded-2xl border border-[#851F32]/20 bg-white p-5">
          <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#851F32]">4 · Serviços</p><h2 className="mt-1 text-xl font-bold text-slate-900">Como você quer viajar?</h2><p className="mt-1 text-sm text-slate-500">Escolha agora. O valor abaixo será levado para o contrato e pagamento.</p></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {formasDisponiveis.map((forma) => {
              const meta = formaContratacaoMeta[forma];
              const selecionado = formaContratacao === forma;
              const cotacao = cotacoesForma[forma];
              const indisponivel = Boolean(cotacao?.erro);
              const valor = Number(cotacao?.valor_total || 0);
              const economia = cotacaoCompleta > 0 && valor > 0 && valor < cotacaoCompleta ? cotacaoCompleta - valor : 0;
              return <button key={forma} type="button" disabled={indisponivel || isCalculatingOptions} aria-pressed={selecionado} onClick={() => selecionarFormaContratacao(forma)} className={`relative rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${selecionado ? 'border-[#851F32] bg-[#851F32]/[0.04] shadow-md ring-2 ring-[#851F32]/15' : 'border-slate-200 hover:border-[#851F32]/35'}`}>
                {selecionado && <span className="absolute right-3 top-3 rounded-full bg-[#851F32] p-1 text-white"><Check size={13}/></span>}
                <strong className="block pr-7 text-sm text-slate-900">{meta.label}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-500">{forma === 'onibus_hospedagem' ? 'Viagem completa' : forma === 'hospedagem' ? 'Você vai por conta própria' : 'Sem hospedagem'}</p>
                <div className="mt-4 border-t border-slate-100 pt-3">{isCalculatingOptions && !cotacao ? <span className="text-xs text-slate-400">Calculando...</span> : indisponivel ? <span className="text-xs font-bold text-slate-500">Indisponível</span> : <><strong className="font-editorial text-2xl text-[#182D3B]">{formatarMoeda(valor)}</strong>{economia > 0 && <span className="mt-1 block text-[10px] font-black uppercase text-emerald-700">Economize {formatarMoeda(economia)}</span>}</>}</div>
              </button>;
            })}
          </div>
          <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><Info size={15} className="mt-0.5 shrink-0 text-[#851F32]"/><p>Cupons promocionais válidos podem ser aplicados no checkout.</p></div>
        </section>}
      </div>

      <aside className="lg:col-span-1">
        <Card className="sticky top-[104px] overflow-hidden border-[#182D3B]/10 shadow-[0_18px_45px_rgba(24,45,59,0.10)]"><CardHeader className="border-b bg-[#182D3B] text-white"><CardTitle>Resumo</CardTitle></CardHeader><CardContent className="space-y-4 p-6">
          <div className="flex justify-between gap-4 text-sm"><span className="text-gray-500">Pacote</span><strong className="max-w-48 text-right text-slate-900">{pacoteSelecionado?.nome || 'Escolha seu pacote'}</strong></div>
          {pacoteSelecionado && exigePeriodo && <div className="flex justify-between gap-4 text-sm"><span className="text-gray-500">Período</span><strong className="max-w-48 text-right text-slate-900">{periodoSelecionado?.nome || 'Escolha o período'}</strong></div>}
          {pacoteSelecionado && <div className="flex justify-between gap-4 text-sm"><span className="text-gray-500">Pessoas</span><strong className="text-slate-900">{participantes.length + 1}</strong></div>}
          {user && <div className="flex justify-between gap-4 text-sm"><span className="text-gray-500">Serviços</span><strong className="max-w-48 text-right text-slate-900">{formaContratacao ? formaContratacaoMeta[formaContratacao].label : 'Escolha no passo 4'}</strong></div>}
          <div className="border-t pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{formaContratacao ? 'Total contratado' : 'A partir de'}</p>
            {parcelamentoResumo && !formaContratacao ? <><div className="mt-1 flex items-end gap-1.5"><span className="pb-1 text-xs font-bold text-slate-500">{parcelamentoResumo.parcelas}x de</span><strong className="font-editorial text-3xl leading-none text-[#851F32]">{formatarMoeda(parcelamentoResumo.valor)}</strong></div><p className="mt-1 text-xs text-slate-500">Total {formatarMoeda(valorResumo)}</p></> : <strong className="font-editorial mt-1 block text-3xl text-[#851F32]">{isCalculating ? '...' : formatarMoeda(valorResumo)}</strong>}
          </div>
          {!user ? <Button className="w-full" size="lg" onClick={handleReservar} disabled={!podeAvancarProduto || authLoading}>Entrar e continuar</Button> : !formaContratacao ? <Button className="w-full" size="lg" disabled>Escolha os serviços</Button> : <Button className="w-full" size="lg" onClick={handleReservar} isLoading={isReserving} disabled={!podeFinalizar}>Continuar para contrato e pagamento</Button>}
          <p className="text-center text-[11px] leading-5 text-slate-500">Preço e serviços são confirmados antes da assinatura.</p>
        </CardContent></Card>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#182D3B]/10 bg-white/95 p-3 shadow-[0_-12px_34px_rgba(24,45,59,.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-500">{pacoteSelecionado?.nome || 'Escolha seu pacote'}</p><p className="text-lg font-black text-[#182D3B]">{formaContratacao ? formatarMoeda(valorResumo) : valorResumo > 0 ? `A partir de ${formatarMoeda(valorResumo)}` : 'Consultar'}</p></div>
          {!user ? <Button onClick={handleReservar} disabled={!podeAvancarProduto || authLoading}>Continuar <ArrowRight size={16} className="ml-1"/></Button> : <Button onClick={handleReservar} isLoading={isReserving} disabled={!podeFinalizar}>Finalizar <ArrowRight size={16} className="ml-1"/></Button>}
        </div>
      </div>
    </div>
  );

}
