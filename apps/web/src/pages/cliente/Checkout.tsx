import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { AlertCircle, Download, Eye, FileCheck2, FileText, Landmark, Mail, QrCode, ShieldCheck, Smartphone, Tent, Wind, Snowflake, RefreshCw } from 'lucide-react';

type MetodoPagamento = 'pix' | 'boleto';
type CanalOtp = 'email' | 'whatsapp';

const MODALIDADES: Record<string, { titulo: string; descricao: string; Icone: typeof Tent }> = {
  camping: {
    titulo: 'Camping',
    descricao: 'Área de camping da excursão',
    Icone: Tent,
  },
  quarto_ventilador: {
    titulo: 'Quarto com ventilador compartilhado',
    descricao: 'Quarto compartilhado com ventilador',
    Icone: Wind,
  },
  quarto_ar_condicionado: {
    titulo: 'Quarto com climatizador compartilhado',
    descricao: 'Quarto compartilhado com climatizador',
    Icone: Snowflake,
  },
};

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(valor) ? valor : 0);
}
function formatarData(valor?: string | null) {
  if (!valor) return 'Não informado';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? 'Não informado'
    : new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(data);
}
function chavePersistente(reservaId?: string) {
  if (!reservaId || typeof window === 'undefined') return '';
  const nome = `comitivas:payment-idempotency:${reservaId}`;
  const atual = window.localStorage.getItem(nome);
  if (atual) return atual;
  const nova = window.crypto?.randomUUID?.() || `${reservaId}-${Date.now()}`;
  window.localStorage.setItem(nome, nova);
  return nova;
}

export default function Checkout() {
  const { reservaId } = useParams();
  const navigate = useNavigate();
  const [reserva, setReserva] = useState<any>(null);
  const [estado, setEstado] = useState<any>(null);
  const [contratoHtml, setContratoHtml] = useState('');
  const [documento, setDocumento] = useState<any>(null);
  const [pagamento, setPagamento] = useState<any>(null);
  const [pagamentoData, setPagamentoData] = useState<any>(null);
  const [simulacao, setSimulacao] = useState<any>(null);
  const [aceiteContrato, setAceiteContrato] = useState(false);
  const [aceiteRegras, setAceiteRegras] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>('pix');
  const [quantidadeParcelas, setQuantidadeParcelas] = useState(1);
  const [canalOtp, setCanalOtp] = useState<CanalOtp>('email');
  const [codigo, setCodigo] = useState('');
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [consentiuGeo, setConsentiuGeo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const carregarDados = async (silencioso = false) => {
    if (!reservaId) return;
    if (!silencioso) setIsLoading(true);
    try {
      const [reservaResponse, estadoResponse] = await Promise.all([api.get(`/pacotes/reservas/${reservaId}`), api.get(`/contratos/estado/${reservaId}`)]);
      const reservaAtual = reservaResponse.data;
      const estadoAtual = estadoResponse.data;
      setReserva(reservaAtual);
      setEstado(estadoAtual);
      setDocumento(estadoAtual.contrato);
      setPagamento(estadoAtual.pagamento);
      const formasCheckout = Array.isArray(reservaAtual.formas_pagamento_checkout) ? reservaAtual.formas_pagamento_checkout : ['pix', 'boleto'];
      if (reservaAtual.forma_pagamento === 'pix' || reservaAtual.forma_pagamento === 'boleto') {
        setMetodoPagamento(reservaAtual.forma_pagamento);
      } else if (reservaAtual.boleto_modo === 'manual' && !reservaAtual.gateway_automatico_disponivel && formasCheckout.includes('boleto')) {
        // O projeto pode iniciar vendas sem credenciais Cora: nesse cenário o
        // boleto manual é a modalidade comercial disponível e deve vir
        // selecionada por padrão, sem conduzir o cliente para uma cobrança
        // automática que ainda não está habilitada.
        setMetodoPagamento('boleto');
      } else if (formasCheckout.includes('pix')) {
        setMetodoPagamento('pix');
      } else if (formasCheckout.includes('boleto')) {
        setMetodoPagamento('boleto');
      }
      setQuantidadeParcelas(Number(reservaAtual.quantidade_parcelas) || 1);
      if (estadoAtual.contrato && estadoAtual.contrato.status !== 'invalidado') {
        const htmlResponse = await api.get(`/contratos/visualizar/${reservaId}`, { responseType: 'text' });
        setContratoHtml(String(htmlResponse.data));
      }
    } catch (err: any) {
      if (!silencioso) setError(err.response?.data?.erro || 'Erro ao carregar sua reserva.');
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [reservaId]);

  const parcelasBoletoMaximas = Math.max(1, Number(reserva?.parcelas_boleto_maximas) || 1);
  const formasCheckout: string[] = Array.isArray(reserva?.formas_pagamento_checkout) ? reserva.formas_pagamento_checkout : ['pix', 'boleto'];
  const percentualDescontoPix = Number(reserva?.pix_desconto_percentual) || 5;
  const pixDisponivel = formasCheckout.includes('pix') && (Boolean(reserva?.gateway_automatico_disponivel) || reserva?.forma_pagamento === 'pix');
  const boletoDisponivel = formasCheckout.includes('boleto') && Number(reserva?.parcelas_boleto_maximas) > 0;
  const contratoValidado = documento?.status === 'validado' || ['contrato_validado', 'aguardando_aprovacao_boleto', 'boletos_em_preparacao', 'boletos_enviados', 'aguardando_pagamento', 'pagamento_parcial', 'primeira_parcela_confirmada', 'quitado'].includes(String(estado?.checkout_estado));
  const pagamentoEmAndamento = Boolean(pagamento || pagamentoData || ['aguardando_aprovacao_boleto', 'boletos_em_preparacao', 'boletos_enviados', 'aguardando_pagamento', 'pagamento_parcial', 'primeira_parcela_confirmada', 'quitado'].includes(String(estado?.checkout_estado)));
  useEffect(() => {
    if (metodoPagamento === 'pix') setQuantidadeParcelas(1);
    else setQuantidadeParcelas((atual) => Math.min(Math.max(atual, 1), parcelasBoletoMaximas));
  }, [metodoPagamento, parcelasBoletoMaximas]);

  useEffect(() => {
    if (!reservaId || !reserva || reserva.forma_pagamento || contratoValidado) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.post(`/pacotes/reservas/${reservaId}/simular-pagamento`, {
          metodo_pagamento: metodoPagamento,
          quantidade_parcelas: metodoPagamento === 'pix' ? 1 : quantidadeParcelas,
        });
        setSimulacao(response.data);
        setError('');
      } catch (err: any) {
        setSimulacao(null);
        setError(err.response?.data?.erro || 'Esta condição de pagamento não está disponível.');
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [reservaId, reserva, metodoPagamento, quantidadeParcelas, contratoValidado]);

  const resumo = useMemo(() => {
    const valorAposCupom = Math.max(0, Number(simulacao?.condicao_pagamento?.valor_base ?? (Number(reserva?.valor_total || 0) + Number(reserva?.desconto_pagamento || 0))));
    const descontoCupom = Math.max(0, Number(reserva?.desconto_cupom ?? reserva?.desconto_aplicado ?? 0));
    const base = valorAposCupom + descontoCupom;
    // Após a preparação do contrato, valor_total já é o total final congelado
    // pelo servidor e desconto_pagamento já está incluído nele. Reaplicar o
    // percentual aqui fazia a UI mostrar menos que o valor cobrado pela Cora.
    const contratoCongelado = Boolean(reserva?.forma_pagamento && reserva?.desconto_pagamento !== undefined);
    const descontoCalculado = metodoPagamento === 'pix' ? (valorAposCupom * percentualDescontoPix) / 100 : 0;
    const desconto = Number(simulacao?.condicao_pagamento?.desconto_pagamento ?? (contratoCongelado ? reserva?.desconto_pagamento || 0 : descontoCalculado));
    const total = Number(simulacao?.condicao_pagamento?.valor_total ?? (contratoCongelado ? reserva?.valor_total : valorAposCupom - desconto));
    const quantidade = metodoPagamento === 'pix' ? 1 : quantidadeParcelas;
    return {
      base,
      valorAposCupom,
      cupom: descontoCupom,
      desconto,
      taxa: Number(simulacao?.condicao_pagamento?.taxa_pagamento || 0),
      juros: Number(simulacao?.condicao_pagamento?.juros_pagamento || 0),
      total,
      quantidade,
      parcela: Number(simulacao?.condicao_pagamento?.valor_parcela ?? total / quantidade),
    };
  }, [reserva?.valor_total, reserva?.desconto_pagamento, reserva?.desconto_aplicado, reserva?.desconto_cupom, metodoPagamento, quantidadeParcelas, percentualDescontoPix, simulacao]);

  const prepararContrato = async () => {
    if (!reservaId) return;
    setIsProcessing(true);
    setError('');
    try {
      const response = await api.post(`/contratos/aceitar/${reservaId}`, {
        metodo_pagamento: metodoPagamento,
        quantidade_parcelas: resumo.quantidade,
      });
      setDocumento(response.data.documento);
      const html = await api.get(`/contratos/visualizar/${reservaId}`, {
        responseType: 'text',
      });
      setContratoHtml(String(html.data));
      await carregarDados(true);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Não foi possível preparar o contrato.');
    } finally {
      setIsProcessing(false);
    }
  };

  const solicitarOtp = async () => {
    if (!aceiteContrato || !aceiteRegras) {
      setError('Marque os dois aceites após ler o contrato e as regras.');
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      const response = await api.post(`/contratos/otp/solicitar/${reservaId}`, {
        contrato_id: documento?.id,
        canal: canalOtp,
      });
      setOtpEnviado(true);
      if (response.data?.destinatario) setError(`Código enviado para ${response.data.destinatario}.`);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Não foi possível enviar o código.');
    } finally {
      setIsProcessing(false);
    }
  };

  const finalizarAssinatura = async () => {
    if (!codigo) {
      setError('Informe o código recebido.');
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      const geolocalizacao = consentiuGeo
        ? await new Promise<any>((resolve) => {
            if (!navigator.geolocation) {
              resolve({ consentida: true });
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                resolve({
                  consentida: true,
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  precisao_metros: pos.coords.accuracy,
                }),
              () => resolve({ consentida: true }),
              { timeout: 5000, maximumAge: 60000 }
            );
          })
        : { consentida: false };
      await api.post(`/contratos/otp/confirmar/${reservaId}`, {
        codigo,
        aceite_contrato: aceiteContrato,
        aceite_regras: aceiteRegras,
        userAgent: navigator.userAgent,
        idioma: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        geolocalizacao,
      });
      setCodigo('');
      setOtpEnviado(false);
      await carregarDados(true);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Não foi possível concluir a assinatura.');
    } finally {
      setIsProcessing(false);
    }
  };

  const criarCobranca = async () => {
    if (!reservaId) return;
    setIsProcessing(true);
    setError('');
    try {
      const response = await api.post('/pagamentos/criar', {
        reserva_id: reservaId,
        metodo: metodoPagamento,
        idempotency_key: chavePersistente(reservaId),
      });
      setPagamentoData(response.data);
      setPagamento(response.data);
      await carregarDados(true);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Não foi possível criar a cobrança. O contrato continua validado e você pode tentar novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-slate-600">Carregando detalhes da reserva...</div>;
  const modalidade = reserva?.modalidade_hospedagem ? MODALIDADES[reserva.modalidade_hospedagem] : null;
  const contratante = reserva?.contratante;
  const dadosIncompletos = contratante ? ['nome', 'email', 'cpf', 'data_nascimento', 'endereco', 'telefone'].filter((campo) => !contratante[campo]) : [];

  return (
    <div className="checkout-shell mx-auto max-w-6xl space-y-6 bg-[#fffdf9] pb-12">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#DF6248]">Excursão das Comitivas</p>
        <h1 className="mt-2 text-3xl font-black text-[#073F50] sm:text-4xl">Finalizar reserva</h1>
        <p className="mt-2 text-gray-600">Confira as escolhas, leia o contrato oficial e valide sua contratação com segurança.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center text-xs font-bold sm:text-sm">
        {[
          ['1', 'Dados'],
          ['2', 'Pagamento'],
          ['3', 'Contrato'],
        ].map(([numero, rotulo], indice) => (
          <div key={numero} className={`rounded-xl px-2 py-3 ${indice === 0 ? 'bg-[#fff0eb] text-[#c94f38]' : 'text-slate-500'}`}>
            <span className="mr-1 inline-grid h-5 w-5 place-items-center rounded-full bg-current/10">{numero}</span>
            {rotulo}
          </div>
        ))}
      </div>
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-[#DF6248]/15 bg-[#fff3ee]">
          <CardTitle className="flex items-center gap-2 text-[#073F50]">
            <FileText size={20} className="text-[#DF6248]" />
            Resumo da reserva
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {modalidade ? (
            <div className="flex items-center gap-4 rounded-xl border border-red-100 bg-red-50/50 p-4">
              <modalidade.Icone size={34} className="shrink-0 text-primary" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Hospedagem escolhida</p>
                <p className="text-lg font-bold text-secondary">{modalidade.titulo}</p>
                <p className="text-sm text-gray-600">{reserva?.pacote_nome || modalidade.descricao}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-800">A modalidade desta reserva não foi localizada.</p>
          )}
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gray-500">Evento</dt>
              <dd className="font-semibold">{reserva?.evento_nome || 'Excursão das Comitivas'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Período</dt>
              <dd className="font-semibold">
                {formatarData(reserva?.data_inicio)} a {formatarData(reserva?.data_fim)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Reserva</dt>
              <dd className="break-all font-semibold">{reservaId}</dd>
            </div>
          </dl>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            <RefreshCw size={15} /> {estado?.checkout_estado || reserva?.status || 'checkout'} · hold de vaga protegido durante o checkout
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b bg-gray-50">
          <CardTitle>Dados que constarão no contrato</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Nome</dt>
              <dd className="font-semibold">{contratante?.nome || 'Não informado'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">CPF</dt>
              <dd className="font-semibold">{contratante?.cpf || 'Não informado'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Nascimento</dt>
              <dd className="font-semibold">{formatarData(contratante?.data_nascimento)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Telefone / e-mail</dt>
              <dd className="font-semibold">
                {contratante?.telefone || 'Não informado'} • {contratante?.email || 'Não informado'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Endereço</dt>
              <dd className="font-semibold">{contratante?.endereco || 'Não informado'}</dd>
            </div>
          </dl>
          {dadosIncompletos.length > 0 && (
            <Link to={`/meus-dados?redirect=${encodeURIComponent(`/checkout/${reservaId}`)}`} className="mt-5 inline-block rounded-lg bg-amber-900 px-4 py-2 text-sm font-bold text-white">
              Completar dados essenciais
            </Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b bg-gray-50">
          <CardTitle>Condição de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" disabled={!pixDisponivel || Boolean(reserva?.forma_pagamento) || contratoValidado} onClick={() => setMetodoPagamento('pix')} className={`rounded-xl border p-5 text-left transition ${!pixDisponivel ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60' : metodoPagamento === 'pix' ? 'border-primary bg-red-50 ring-2 ring-primary/20' : 'border-gray-200'}`}>
              <QrCode className="text-primary" />
              <strong className="mt-3 block">PIX à vista</strong>
              <span className={`mt-1 block text-sm ${pixDisponivel ? 'text-green-700' : 'text-gray-500'}`}>{pixDisponivel ? `${percentualDescontoPix}% de desconto` : 'Disponível após ativação do gateway pelo DEV'}</span>
            </button>
            <button type="button" disabled={!boletoDisponivel || Boolean(reserva?.forma_pagamento) || contratoValidado} onClick={() => setMetodoPagamento('boleto')} className={`rounded-xl border p-5 text-left transition ${!boletoDisponivel ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60' : metodoPagamento === 'boleto' ? 'border-primary bg-red-50 ring-2 ring-primary/20' : 'border-gray-200'}`}>
              <Landmark className="text-primary" />
              <strong className="mt-3 block">Boleto bancário</strong>
              <span className="mt-1 block text-sm text-gray-600">{!boletoDisponivel ? 'Prazo de pagamento encerrado' : parcelasBoletoMaximas <= 1 ? 'À vista' : `Até ${parcelasBoletoMaximas}x sem juros`}</span>
            </button>
          </div>
          {reserva?.cartao_indisponivel_motivo && <p className="text-xs text-gray-500">Cartão: {reserva.cartao_indisponivel_motivo}</p>}
          {metodoPagamento === 'boleto' && boletoDisponivel && (
            <label className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4 text-sm">
              <span>
                <strong className="block text-secondary">Parcelas do boleto bancário</strong>
                <span className="text-gray-600">
                  Quitação integral até {formatarData(reserva?.data_limite_efetiva)}. {reserva?.boleto_modo === 'manual' ? 'Os PDFs serão preparados e enviados pela administração após a validação do contrato e aprovação do cadastro.' : ''}
                </span>
              </span>
              <select disabled={contratoValidado} value={quantidadeParcelas} onChange={(event) => setQuantidadeParcelas(Number(event.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold">
                {Array.from({ length: parcelasBoletoMaximas }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}x de {formatarMoeda(resumo.total / (index + 1))}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="space-y-2 rounded-xl border border-red-100 bg-red-50/40 p-5 text-sm">
            <div className="flex justify-between">
              <span>Valor da composição</span>
              <strong>{formatarMoeda(resumo.base)}</strong>
            </div>
            {resumo.cupom > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Cupom{reserva?.cupom_codigo ? ` ${reserva.cupom_codigo}` : ''}</span>
                <strong>-{formatarMoeda(resumo.cupom)}</strong>
              </div>
            )}
            {resumo.desconto > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Desconto PIX</span>
                <strong>-{formatarMoeda(resumo.desconto)}</strong>
              </div>
            )}
            {resumo.taxa > 0 && (
              <div className="flex justify-between">
                <span>Taxas</span>
                <strong>{formatarMoeda(resumo.taxa)}</strong>
              </div>
            )}
            {resumo.juros > 0 && (
              <div className="flex justify-between">
                <span>Juros</span>
                <strong>{formatarMoeda(resumo.juros)}</strong>
              </div>
            )}
            <div className="flex justify-between border-t border-red-100 pt-3 text-lg font-black text-secondary">
              <span>Total contratado</span>
              <strong>{formatarMoeda(resumo.total)}</strong>
            </div>
            {resumo.quantidade > 1 && (
              <p className="text-right text-xs text-gray-600">
                {resumo.quantidade} parcelas de {formatarMoeda(resumo.parcela)}
              </p>
            )}
            {Array.isArray(simulacao?.vencimentos) && simulacao.vencimentos.length > 0 && <p className="text-right text-xs text-gray-600">Vencimentos: {simulacao.vencimentos.map(formatarData).join(' · ')}</p>}
          </div>
        </CardContent>
      </Card>

      {!contratoValidado && !contratoHtml ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <FileCheck2 className="mt-1 shrink-0 text-primary" />
              <div>
                <h2 className="text-xl font-bold text-secondary">Contrato oficial 2026</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">O sistema gera uma versão individual com seus dados, hospedagem, serviços, transporte quando contratado, valores e regras oficiais. Nenhuma cobrança será criada antes da validação eletrônica.</p>
                <Button className="mt-5" onClick={prepararContrato} isLoading={isProcessing} disabled={!modalidade || dadosIncompletos.length > 0 || (!reserva?.forma_pagamento && !simulacao)}>
                  Ler contrato completo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : !contratoValidado ? (
        <Card>
          <CardHeader className="border-b bg-gray-50">
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="text-primary" />
              Leitura integral e assinatura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <iframe title="Contrato oficial da reserva" srcDoc={contratoHtml} className="h-[520px] w-full rounded-xl border border-gray-200 bg-white" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">Versão {documento?.versao || 'atual'} · Esta minuta reproduz o conteúdo que será assinado. O documento final terá hash SHA-256 e certificado de validação.</p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a href={`/api/contratos/download/${encodeURIComponent(reservaId || '')}?inline=1&contrato_id=${encodeURIComponent(documento?.id || '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700 hover:border-primary hover:text-primary">
                  <Eye size={15} /> Abrir minuta
                </a>
                <a href={`/api/contratos/download/${encodeURIComponent(reservaId || '')}?contrato_id=${encodeURIComponent(documento?.id || '')}`} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700 hover:border-primary hover:text-primary">
                  <Download size={15} /> Baixar minuta
                </a>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <input type="checkbox" checked={aceiteContrato} onChange={(event) => setAceiteContrato(event.target.checked)} className="mt-1 h-5 w-5 text-primary" />
              <span className="text-sm">
                <strong className="block text-gray-900">Li e concordo com o Contrato</strong>
                Confirmo que visualizei o documento integral da minha reserva.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <input type="checkbox" checked={aceiteRegras} onChange={(event) => setAceiteRegras(event.target.checked)} className="mt-1 h-5 w-5 text-primary" />
              <span className="text-sm">
                <strong className="block text-gray-900">Li e concordo com as Regras de Convivência</strong>
                Aceito a versão oficial 2026.1 apresentada no{' '}
                <Link to="/regras" target="_blank" className="font-bold text-primary underline">
                  cartaz e texto acessível
                </Link>
                .
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <input type="checkbox" checked={consentiuGeo} onChange={(event) => setConsentiuGeo(event.target.checked)} className="mt-1 h-5 w-5 text-primary" />
              <span className="text-sm">
                <strong className="block text-gray-900">Permitir geolocalização (opcional)</strong>
                Se eu permitir, a localização será registrada como evidência. Se eu negar, a contratação continuará normalmente.
              </span>
            </label>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <p className="font-bold text-secondary">Escolha como receber o código</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setCanalOtp('email')} className={`flex items-center gap-3 rounded-lg border bg-white p-3 text-left ${canalOtp === 'email' ? 'border-primary ring-2 ring-primary/20' : ''}`}>
                  <Mail size={18} className="text-primary" />
                  <span className="text-sm font-semibold">E-mail cadastrado</span>
                </button>
                <button type="button" onClick={() => setCanalOtp('whatsapp')} className={`flex items-center gap-3 rounded-lg border bg-white p-3 text-left ${canalOtp === 'whatsapp' ? 'border-primary ring-2 ring-primary/20' : ''}`}>
                  <Smartphone size={18} className="text-primary" />
                  <span className="text-sm font-semibold">WhatsApp cadastrado</span>
                </button>
              </div>
              {!otpEnviado ? (
                <Button className="mt-4" onClick={solicitarOtp} isLoading={isProcessing} disabled={!aceiteContrato || !aceiteRegras}>
                  <ShieldCheck size={17} className="mr-2" />
                  Enviar código de validação
                </Button>
              ) : (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input inputMode="numeric" maxLength={6} value={codigo} onChange={(event) => setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Código de 6 dígitos" className="rounded-lg border border-gray-300 px-4 py-3 font-mono tracking-[0.3em]" />
                  <Button onClick={finalizarAssinatura} isLoading={isProcessing} disabled={codigo.length !== 6}>
                    Validar assinatura
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {contratoValidado && (
        <Card>
          <CardHeader className="border-b bg-gray-50">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-green-600" />
              Contrato validado · próxima etapa: {metodoPagamento === 'boleto' && reserva?.boleto_modo === 'manual' ? 'aprovação administrativa' : 'pagamento'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm leading-relaxed text-slate-600">{metodoPagamento === 'boleto' && reserva?.boleto_modo === 'manual' ? 'A assinatura foi registrada com protocolo e certificado. Agora a equipe confere seu cadastro e as evidências do contrato. Após a aprovação, os boletos serão anexados ao seu cadastro e enviados pela administração por e-mail e WhatsApp.' : 'A assinatura foi registrada com protocolo e certificado. A cobrança é uma etapa separada; se o gateway estiver temporariamente indisponível, seu contrato continua salvo e você pode tentar novamente.'}</p>
            <div className="flex flex-wrap gap-3">
              <a href={`/api/contratos/download/${encodeURIComponent(reservaId || '')}?inline=1`} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 hover:border-primary hover:text-primary">
                Visualizar PDF final
              </a>
              <a href={`/api/contratos/download/${encodeURIComponent(reservaId || '')}`} className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 hover:border-primary hover:text-primary">
                Baixar PDF
              </a>
            </div>
            {!pagamentoEmAndamento ? (
              <Button onClick={criarCobranca} isLoading={isProcessing}>
                {metodoPagamento === 'boleto' && reserva?.boleto_modo === 'manual' ? 'Enviar para análise e emissão dos boletos' : 'Criar cobrança no Banco Cora'}
              </Button>
            ) : (
              <>
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                  {pagamentoData?.modo === 'manual' || estado?.checkout_estado === 'aguardando_aprovacao_boleto' ? (
                    <>
                      Contrato validado. Sua reserva está em <strong>análise administrativa para boleto</strong>. Depois da aprovação, a equipe preparará e enviará as parcelas.
                    </>
                  ) : (
                    <>
                      Cobrança criada ou em acompanhamento. Status atual: <strong>{pagamento?.status || pagamentoData?.status || estado?.checkout_estado || 'pendente'}</strong>.
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => carregarDados(true)}>
                    <RefreshCw size={16} className="mr-2" />
                    Atualizar status
                  </Button>
                  <Link to={`/confirmacao/${reservaId}`} state={{ pagamentoData: pagamentoData || pagamento }}>
                    <Button>Acompanhar pagamento</Button>
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col items-center justify-between gap-4 border-t pt-5 sm:flex-row">
        <div>
          <p className="text-sm text-gray-500">Total desta contratação</p>
          <p className="text-3xl font-black text-secondary">{formatarMoeda(resumo.total)}</p>
        </div>
        {pagamentoEmAndamento && (
          <Link to={`/confirmacao/${reservaId}`} state={{ pagamentoData: pagamentoData || pagamento }}>
            <Button>Acompanhar pagamento</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
