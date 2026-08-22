import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { AlertCircle, FileCheck2, FileText, Landmark, Mail, QrCode, ShieldCheck, Smartphone, Tent, Wind, Snowflake } from 'lucide-react';

type MetodoPagamento = 'pix' | 'boleto';
type CanalOtp = 'email' | 'whatsapp';

const MODALIDADES: Record<string, { titulo: string; descricao: string; Icone: typeof Tent }> = {
  camping: { titulo: 'Camping', descricao: 'Área de camping da excursão', Icone: Tent },
  quarto_ventilador: { titulo: 'Quarto com ventilador compartilhado', descricao: 'Quarto compartilhado com ventilador', Icone: Wind },
  quarto_ar_condicionado: { titulo: 'Quarto com climatizador compartilhado', descricao: 'Quarto compartilhado com climatizador', Icone: Snowflake },
};

function formatarMoeda(valor: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(valor) ? valor : 0); }
function formatarData(valor?: string | null) { if (!valor) return 'Não informado'; const data = new Date(valor); return Number.isNaN(data.getTime()) ? 'Não informado' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(data); }

export default function Checkout() {
  const { reservaId } = useParams();
  const navigate = useNavigate();
  const [reserva, setReserva] = useState<any>(null);
  const [contratoHtml, setContratoHtml] = useState('');
  const [documento, setDocumento] = useState<any>(null);
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

  useEffect(() => {
    let ativo = true;
    api.get(`/pacotes/reservas/${reservaId}`).then(({ data }) => {
      if (!ativo) return;
      setReserva(data);
      if (data.forma_pagamento === 'pix' || data.forma_pagamento === 'boleto') setMetodoPagamento(data.forma_pagamento);
      setQuantidadeParcelas(Number(data.quantidade_parcelas) || 1);
    }).catch((err) => setError(err.response?.data?.erro || 'Erro ao carregar reserva.')).finally(() => setIsLoading(false));
    return () => { ativo = false; };
  }, [reservaId]);

  const parcelasBoletoMaximas = Math.max(1, Number(reserva?.parcelas_boleto_maximas) || 1);
  const percentualDescontoPix = Number(reserva?.pix_desconto_percentual) || 5;
  useEffect(() => { if (metodoPagamento === 'pix') setQuantidadeParcelas(1); else setQuantidadeParcelas((atual) => Math.min(Math.max(atual, 1), parcelasBoletoMaximas)); }, [metodoPagamento, parcelasBoletoMaximas]);

  const resumo = useMemo(() => {
    const base = Number(reserva?.valor_total || 0) + Number(reserva?.desconto_pagamento || 0);
    const desconto = metodoPagamento === 'pix' ? base * percentualDescontoPix / 100 : 0;
    const total = Number(reserva?.forma_pagamento) ? Number(reserva?.valor_total || 0) : base - desconto;
    const quantidade = metodoPagamento === 'pix' ? 1 : quantidadeParcelas;
    const parcela = total / quantidade;
    return { base, desconto, total, quantidade, parcela };
  }, [reserva?.valor_total, reserva?.desconto_pagamento, reserva?.forma_pagamento, metodoPagamento, quantidadeParcelas, percentualDescontoPix]);

  const prepararContrato = async () => {
    if (!reservaId) return;
    setIsProcessing(true); setError('');
    try {
      const response = await api.post(`/contratos/aceitar/${reservaId}`, { metodo_pagamento: metodoPagamento, quantidade_parcelas: resumo.quantidade });
      setDocumento(response.data.documento);
      const html = await api.get(`/contratos/visualizar/${reservaId}`, { responseType: 'text' });
      setContratoHtml(String(html.data));
    } catch (err: any) { setError(err.response?.data?.erro || 'Não foi possível preparar o contrato.'); }
    finally { setIsProcessing(false); }
  };

  const solicitarOtp = async () => {
    if (!aceiteContrato || !aceiteRegras) { setError('Marque os dois aceites após ler o contrato e as regras.'); return; }
    setIsProcessing(true); setError('');
    try {
      const response = await api.post(`/contratos/otp/solicitar/${reservaId}`, { contrato_id: documento?.id, canal: canalOtp });
      setOtpEnviado(true);
      if (response.data?.destinatario) setError(`Código enviado para ${response.data.destinatario}.`);
    } catch (err: any) { setError(err.response?.data?.erro || 'Não foi possível enviar o código.'); }
    finally { setIsProcessing(false); }
  };

  const finalizar = async () => {
    if (!codigo) { setError('Informe o código recebido.'); return; }
    setIsProcessing(true); setError('');
    try {
      const geolocalizacao = consentiuGeo ? await new Promise<any>((resolve) => {
        if (!navigator.geolocation) { resolve({ consentida: true }); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ consentida: true, latitude: pos.coords.latitude, longitude: pos.coords.longitude, precisao_metros: pos.coords.accuracy }),
          () => resolve({ consentida: true }),
          { timeout: 5000, maximumAge: 60000 },
        );
      }) : { consentida: false };
      await api.post(`/contratos/otp/confirmar/${reservaId}`, { codigo, aceite_contrato: aceiteContrato, aceite_regras: aceiteRegras, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, geolocalizacao });
      const response = await api.post('/pagamentos/criar', { reserva_id: reservaId, metodo: metodoPagamento, idempotency_key: `checkout-${reservaId}-${metodoPagamento}-${resumo.quantidade}` });
      navigate(`/confirmacao/${reservaId}`, { state: { pagamentoData: response.data } });
    } catch (err: any) { setError(err.response?.data?.erro || 'Não foi possível concluir o checkout.'); }
    finally { setIsProcessing(false); }
  };

  if (isLoading) return <div className="py-12 text-center">Carregando detalhes da reserva...</div>;
  const modalidade = reserva?.modalidade_hospedagem ? MODALIDADES[reserva.modalidade_hospedagem] : null;
  const contratante = reserva?.contratante;
  const dadosIncompletos = contratante ? ['cpf', 'rg', 'data_nascimento', 'estado_civil', 'profissao', 'endereco', 'telefone'].filter((campo) => !contratante[campo]) : [];
  const pagamentoEmAndamento = ['aguardando_pagamento', 'cliente_confirmado'].includes(reserva?.status);

  return <div className="mx-auto max-w-5xl space-y-6 pb-12">
    <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Excursão das Comitivas</p><h1 className="mt-2 text-3xl font-black text-secondary">Finalizar reserva</h1><p className="mt-2 text-gray-600">Confira as escolhas, leia o contrato oficial e valide sua contratação com segurança.</p></div>
    {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle size={20} className="mt-0.5 shrink-0" /><p>{error}</p></div>}

    <Card><CardHeader className="bg-gradient-to-r from-red-950 to-primary text-white"><CardTitle className="flex items-center gap-2"><FileText size={20} />Resumo da reserva</CardTitle></CardHeader><CardContent className="p-6">
      {modalidade ? <div className="flex items-center gap-4 rounded-xl border border-red-100 bg-red-50/50 p-4"><modalidade.Icone size={34} className="shrink-0 text-primary" /><div><p className="text-xs font-bold uppercase tracking-wide text-primary">Hospedagem escolhida</p><p className="text-lg font-bold text-secondary">{modalidade.titulo}</p><p className="text-sm text-gray-600">{reserva?.pacote_nome || modalidade.descricao}</p></div></div> : <p className="text-sm text-amber-800">A modalidade desta reserva não foi localizada.</p>}
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-gray-500">Evento</dt><dd className="font-semibold">{reserva?.evento_nome || 'Excursão das Comitivas'}</dd></div><div><dt className="text-gray-500">Período</dt><dd className="font-semibold">{formatarData(reserva?.data_inicio)} a {formatarData(reserva?.data_fim)}</dd></div><div><dt className="text-gray-500">Reserva</dt><dd className="font-semibold">{reservaId}</dd></div></dl>
    </CardContent></Card>

    <Card><CardHeader className="border-b bg-gray-50"><CardTitle>Dados que constarão no contrato</CardTitle></CardHeader><CardContent className="p-6"><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-gray-500">Nome</dt><dd className="font-semibold">{contratante?.nome || 'Não informado'}</dd></div><div><dt className="text-gray-500">CPF / RG</dt><dd className="font-semibold">{contratante?.cpf || 'Não informado'} {contratante?.rg ? `• ${contratante.rg}` : ''}</dd></div><div><dt className="text-gray-500">Nascimento</dt><dd className="font-semibold">{formatarData(contratante?.data_nascimento)}</dd></div><div><dt className="text-gray-500">Nacionalidade / estado civil</dt><dd className="font-semibold">{contratante?.nacionalidade || 'Brasileira'} • {contratante?.estado_civil || 'Não informado'}</dd></div><div><dt className="text-gray-500">Profissão</dt><dd className="font-semibold">{contratante?.profissao || 'Não informado'}</dd></div><div><dt className="text-gray-500">Telefone / e-mail</dt><dd className="font-semibold">{contratante?.telefone || 'Não informado'} • {contratante?.email || 'Não informado'}</dd></div><div className="sm:col-span-2"><dt className="text-gray-500">Endereço</dt><dd className="font-semibold">{contratante?.endereco || 'Não informado'}</dd></div></dl>{dadosIncompletos.length > 0 && <Link to={`/meus-dados?redirect=${encodeURIComponent(`/checkout/${reservaId}`)}`} className="mt-5 inline-block rounded-lg bg-amber-900 px-4 py-2 text-sm font-bold text-white">Completar dados contratuais</Link>}</CardContent></Card>

    <Card><CardHeader className="border-b bg-gray-50"><CardTitle>Pagamento pelo Banco Cora</CardTitle></CardHeader><CardContent className="space-y-5 p-6"><div className="grid gap-4 sm:grid-cols-2"><button type="button" disabled={Boolean(reserva?.forma_pagamento)} onClick={() => setMetodoPagamento('pix')} className={`rounded-xl border p-5 text-left transition ${metodoPagamento === 'pix' ? 'border-primary bg-red-50 ring-2 ring-primary/20' : 'border-gray-200'}`}><QrCode className="text-primary" /><strong className="mt-3 block">PIX à vista</strong><span className="mt-1 block text-sm text-green-700">{percentualDescontoPix}% de desconto</span></button><button type="button" disabled={Boolean(reserva?.forma_pagamento)} onClick={() => setMetodoPagamento('boleto')} className={`rounded-xl border p-5 text-left transition ${metodoPagamento === 'boleto' ? 'border-primary bg-red-50 ring-2 ring-primary/20' : 'border-gray-200'}`}><Landmark className="text-primary" /><strong className="mt-3 block">Boleto bancário</strong><span className="mt-1 block text-sm text-gray-600">{parcelasBoletoMaximas <= 1 ? 'À vista' : `Até ${parcelasBoletoMaximas}x sem juros`}</span></button></div>{metodoPagamento === 'boleto' && <label className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4 text-sm"><span><strong className="block text-secondary">Parcelas do carnê Cora</strong><span className="text-gray-600">Quitação integral antes do início da hospedagem.</span></span><select value={quantidadeParcelas} onChange={(event) => setQuantidadeParcelas(Number(event.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold">{Array.from({ length: parcelasBoletoMaximas }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}x de {formatarMoeda(resumo.base / (index + 1))}</option>)}</select></label>}<div className="space-y-2 rounded-xl border border-red-100 bg-red-50/40 p-5 text-sm"><div className="flex justify-between"><span>Valor da composição</span><strong>{formatarMoeda(resumo.base)}</strong></div>{resumo.desconto > 0 && <div className="flex justify-between text-green-700"><span>Desconto PIX</span><strong>-{formatarMoeda(resumo.desconto)}</strong></div>}<div className="flex justify-between border-t border-red-100 pt-3 text-lg font-black text-secondary"><span>Total contratado</span><strong>{formatarMoeda(resumo.total)}</strong></div>{resumo.quantidade > 1 && <p className="text-right text-xs text-gray-600">{resumo.quantidade} parcelas de aproximadamente {formatarMoeda(resumo.parcela)}</p>}</div></CardContent></Card>

    {!contratoHtml ? <Card><CardContent className="p-6"><div className="flex items-start gap-4"><FileCheck2 className="mt-1 shrink-0 text-primary" /><div><h2 className="text-xl font-bold text-secondary">Contrato oficial 2026</h2><p className="mt-2 text-sm leading-relaxed text-gray-600">O sistema gera uma versão individual com seus dados, hospedagem, serviços, transporte quando contratado, valores e regras oficiais. Nenhuma cobrança será criada antes da validação eletrônica.</p><Button className="mt-5" onClick={prepararContrato} isLoading={isProcessing} disabled={!modalidade || pagamentoEmAndamento}>Ler contrato completo</Button></div></div></CardContent></Card> : <Card><CardHeader className="border-b bg-gray-50"><CardTitle className="flex items-center gap-2"><FileCheck2 className="text-primary" />Leitura integral e validação</CardTitle></CardHeader><CardContent className="space-y-5 p-6"><iframe title="Contrato oficial da reserva" srcDoc={contratoHtml} className="h-[520px] w-full rounded-xl border border-gray-200 bg-white" /><p className="text-xs text-gray-500">Versão {documento?.versao || 'atual'} · O documento final terá hash SHA-256 e certificado de validação.</p><label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4"><input type="checkbox" checked={aceiteContrato} onChange={(event) => setAceiteContrato(event.target.checked)} className="mt-1 h-5 w-5 text-primary" /><span className="text-sm"><strong className="block text-gray-900">Li e concordo com o Contrato</strong>Confirmo que visualizei o documento integral da minha reserva.</span></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4"><input type="checkbox" checked={aceiteRegras} onChange={(event) => setAceiteRegras(event.target.checked)} className="mt-1 h-5 w-5 text-primary" /><span className="text-sm"><strong className="block text-gray-900">Li e concordo com as Regras de Convivência</strong>Aceito a versão oficial 2026.1 apresentada no contrato.</span></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"><input type="checkbox" checked={consentiuGeo} onChange={(event) => setConsentiuGeo(event.target.checked)} className="mt-1 h-5 w-5 text-primary" /><span className="text-sm"><strong className="block text-gray-900">Permitir geolocalização (opcional)</strong>Se eu permitir, a localização será registrada como evidência. Se eu negar, a contratação continuará normalmente.</span></label><div className="rounded-xl border border-primary/20 bg-primary/5 p-5"><p className="font-bold text-secondary">Escolha como receber o código</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setCanalOtp('email')} className={`flex items-center gap-3 rounded-lg border bg-white p-3 text-left ${canalOtp === 'email' ? 'border-primary ring-2 ring-primary/20' : ''}`}><Mail size={18} className="text-primary" /><span className="text-sm font-semibold">E-mail cadastrado</span></button><button type="button" onClick={() => setCanalOtp('whatsapp')} className={`flex items-center gap-3 rounded-lg border bg-white p-3 text-left ${canalOtp === 'whatsapp' ? 'border-primary ring-2 ring-primary/20' : ''}`}><Smartphone size={18} className="text-primary" /><span className="text-sm font-semibold">WhatsApp cadastrado</span></button></div>{!otpEnviado ? <Button className="mt-4" onClick={solicitarOtp} isLoading={isProcessing} disabled={!aceiteContrato || !aceiteRegras}><ShieldCheck size={17} className="mr-2" />Enviar código de validação</Button> : <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input inputMode="numeric" maxLength={6} value={codigo} onChange={(event) => setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Código de 6 dígitos" className="rounded-lg border border-gray-300 px-4 py-3 font-mono tracking-[0.3em]" /><Button onClick={finalizar} isLoading={isProcessing} disabled={codigo.length !== 6}>Validar e ir para pagamento</Button></div>}</div></CardContent></Card>}

    <div className="flex flex-col items-center justify-between gap-4 border-t pt-5 sm:flex-row"><div><p className="text-sm text-gray-500">Total desta contratação</p><p className="text-3xl font-black text-secondary">{formatarMoeda(resumo.total)}</p></div>{pagamentoEmAndamento && <Link to={`/confirmacao/${reservaId}`}><Button>Acompanhar pagamento</Button></Link>}</div>
  </div>;
}
