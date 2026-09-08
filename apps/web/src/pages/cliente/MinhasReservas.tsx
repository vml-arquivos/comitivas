import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { AlertCircle, Calendar, CheckCircle2, Clock3, Download, Eye, MapPin, Ticket } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { api } from '../../contexts/AuthContext';

const STATUS: Record<string, { classes: string; label: string; descricao: string }> = {
  aguardando_aprovacao_boleto: { classes: 'bg-amber-100 text-amber-800', label: 'Cadastro em análise', descricao: 'Contrato validado. A equipe está conferindo seu cadastro antes de liberar os boletos.' },
  boletos_em_preparacao: { classes: 'bg-indigo-100 text-indigo-800', label: 'Boletos em preparação', descricao: 'Cadastro e contrato aprovados. A equipe está preparando e anexando os boletos.' },
  boletos_enviados: { classes: 'bg-blue-100 text-blue-800', label: 'Boletos enviados', descricao: 'As parcelas foram enviadas pela equipe. Acompanhe os vencimentos e as confirmações.' },
  pacote_montado: { classes: 'bg-indigo-100 text-indigo-800', label: 'Reserva iniciada', descricao: 'Revise seus dados e emita o contrato.' },
  checkout_iniciado: { classes: 'bg-purple-100 text-purple-800', label: 'Checkout iniciado', descricao: 'Falta aceitar o contrato e escolher o pagamento.' },
  contrato_gerado: { classes: 'bg-amber-100 text-amber-800', label: 'Contrato gerado', descricao: 'Seu contrato está pronto; conclua o pagamento.' },
  aguardando_pagamento: { classes: 'bg-yellow-100 text-yellow-800', label: 'Aguardando pagamento', descricao: 'A confirmação será atualizada após o retorno do meio de pagamento.' },
  pagamento_parcial: { classes: 'bg-blue-100 text-blue-800', label: 'Pagamento parcial', descricao: 'A primeira parcela foi recebida; acompanhe o cronograma das próximas.' },
  primeira_parcela_confirmada: { classes: 'bg-blue-100 text-blue-800', label: 'Primeira parcela confirmada', descricao: 'A primeira parcela foi recebida; as demais seguem no cronograma.' },
  quitado: { classes: 'bg-emerald-100 text-emerald-800', label: 'Pagamento quitado', descricao: 'Pagamento integral confirmado.' },
  cliente_confirmado: { classes: 'bg-emerald-100 text-emerald-800', label: 'Viagem confirmada', descricao: 'Contrato e voucher de embarque estão disponíveis.' },
  abandonado: { classes: 'bg-red-100 text-red-800', label: 'Reserva interrompida', descricao: 'Fale com a equipe para verificar como retomar.' },
};

const MODALIDADES: Record<string, string> = {
  camping: 'Camping',
  quarto_ventilador: 'Quarto com ventilador',
  quarto_ar_condicionado: 'Quarto com ar-condicionado',
};

function moeda(valor: string | number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

function data(valor?: string | null) {
  if (!valor) return 'Data a confirmar';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(valor));
}

function ReservasSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2" aria-label="Carregando reservas">
      {[1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-2xl bg-slate-100" />)}
    </div>
  );
}

export default function MinhasReservas() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [baixando, setBaixando] = useState('');

  const carregar = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/pacotes/minhas-reservas');
      setReservas(response.data.reservas || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Não foi possível carregar suas reservas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const baixarDocumento = async (reservaId: string, tipo: 'contrato' | 'voucher') => {
    const chave = `${tipo}-${reservaId}`;
    setBaixando(chave);
    setError('');
    try {
      const endpoint = tipo === 'contrato' ? 'download' : 'voucher';
      const response = await api.get(`/contratos/${endpoint}/${reservaId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${tipo}-${reservaId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.erro || `Não foi possível baixar o ${tipo}.`);
    } finally {
      setBaixando('');
    }
  };

  const visualizarContrato = (reservaId: string) => {
    window.open(`/api/contratos/download/${encodeURIComponent(reservaId)}?inline=1`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-8 pb-12">
      <Helmet>
        <title>Minhas reservas | Excursão das Comitivas</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="rounded-3xl bg-gradient-to-r from-slate-950 to-primary p-8 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb3b8]">Área do cliente</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Suas viagens em um só lugar</h1>
        <p className="mt-3 max-w-2xl text-slate-200">Acompanhe o pagamento, retome uma reserva e baixe os documentos liberados para cada viagem.</p>
      </header>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <div className="flex gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} /><p>{error}</p></div>
          <button type="button" onClick={carregar} className="shrink-0 text-sm font-bold underline">Tentar novamente</button>
        </div>
      )}

      {isLoading ? <ReservasSkeleton /> : reservas.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <Ticket size={48} className="mx-auto mb-4 text-slate-300" />
            <h2 className="text-xl font-bold text-slate-900">Você ainda não iniciou uma reserva</h2>
            <p className="mx-auto mb-6 mt-2 max-w-md text-slate-500">Conheça as excursões abertas, compare as modalidades e crie sua conta apenas quando decidir continuar.</p>
            <Link to="/eventos"><Button>Ver excursões disponíveis</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {reservas.map((reserva) => {
            const status = STATUS[reserva.checkout_estado] || STATUS[reserva.status] || {
              classes: 'bg-slate-100 text-slate-700',
              label: 'Em andamento',
              descricao: 'Acompanhe os próximos passos desta reserva.',
            };
            const continuarCheckout = ['pacote_montado', 'checkout_iniciado', 'contrato_gerado', 'aguardando_pagamento'].includes(reserva.status);
            return (
              <Card key={reserva.id} className="overflow-hidden border-slate-200 shadow-lg shadow-slate-900/5">
                <CardHeader className="border-b bg-[#fffaf5] pb-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary">{reserva.evento_nome}</p>
                      <CardTitle className="mt-1 truncate text-xl">{reserva.pacote_nome || reserva.lote_nome}</CardTitle>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${status.classes}`}>{status.label}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-6">
                  <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <p className="flex items-center gap-2"><Calendar size={16} className="text-primary" />{data(reserva.evento_data_inicio)} a {data(reserva.evento_data_fim)}</p>
                    <p className="flex items-center gap-2"><MapPin size={16} className="text-primary" />{reserva.evento_local}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Hospedagem</p>
                        <p className="mt-1 font-bold text-slate-900">{MODALIDADES[reserva.modalidade_hospedagem] || reserva.pacote_nome || 'Conforme contrato'}</p>
                      </div>
                      <p className="text-lg font-black text-secondary">{moeda(reserva.valor_total)}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-slate-800">Pagamento</span>
                      <span className="font-semibold text-slate-600">{reserva.pagamento?.status_reconciliado === 'quitado' ? 'Quitado' : reserva.pagamento?.status_reconciliado === 'parcial' ? 'Parcial' : reserva.pagamento?.status_reconciliado === 'cancelado' ? 'Cancelado' : 'Pendente'}</span>
                    </div>
                    <p className="mt-1 text-slate-500">{reserva.forma_pagamento ? `${String(reserva.forma_pagamento).toUpperCase()} · ${reserva.quantidade_parcelas || 1}x de ${moeda(reserva.valor_parcela || reserva.valor_total)}` : 'Escolha o meio de pagamento para continuar.'}</p>
                    {Array.isArray(reserva.parcelas) && reserva.parcelas.length > 0 ? <div className="mt-3 space-y-2">{reserva.parcelas.map((parcela: any) => <div key={parcela.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><div className="flex items-center justify-between gap-2"><span>Parcela {parcela.sequencia} · {parcela.vencimento || 'a confirmar'}</span><strong>{moeda(parcela.valor)}</strong></div><p className="mt-1 text-[11px] text-slate-500">{parcela.status === 'aprovado' ? 'Pagamento confirmado' : parcela.boleto_disponivel ? 'Boleto preparado/enviado pela equipe' : 'Boleto em preparação'}{parcela.enviado_email_em ? ' · enviado por e-mail' : ''}{parcela.enviado_whatsapp_em ? ' · WhatsApp registrado' : ''}</p></div>)}</div> : Array.isArray(reserva.cronograma_pagamento) && reserva.cronograma_pagamento.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{reserva.cronograma_pagamento.map((parcela: any) => <div key={parcela.numero} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span>Parcela {parcela.numero} · {parcela.vencimento || 'a confirmar'}</span><strong>{moeda(parcela.valor)}</strong></div>)}</div>}
                  </div>

                  <div className="flex items-start gap-3 text-sm text-slate-600">
                    {reserva.status === 'cliente_confirmado' ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} /> : <Clock3 className="mt-0.5 shrink-0 text-amber-600" size={18} />}
                    <p>{status.descricao}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
                    {continuarCheckout && (
                      <Link to={`/checkout/${reserva.id}`} className="flex-1"><Button className="w-full">{reserva.status === 'aguardando_pagamento' ? 'Ver pagamento' : 'Continuar reserva'}</Button></Link>
                    )}
                    {reserva.contrato_disponivel && (
                      <><Button variant="outline" className="flex-1 gap-2" onClick={() => visualizarContrato(reserva.id)}><Eye size={16} /> Visualizar contrato</Button><Button variant="outline" className="flex-1 gap-2" onClick={() => baixarDocumento(reserva.id, 'contrato')} isLoading={baixando === `contrato-${reserva.id}`}><Download size={16} /> Baixar contrato</Button></>
                    )}
                    {reserva.voucher_disponivel && (
                      <Button variant="outline" className="flex-1 gap-2" onClick={() => baixarDocumento(reserva.id, 'voucher')} isLoading={baixando === `voucher-${reserva.id}`}>
                        <Ticket size={16} /> Voucher
                      </Button>
                    )}
                  </div>
                  <p className="text-center text-[11px] text-slate-400">Reserva #{reserva.id.slice(0, 10)} · criada em {data(reserva.criado_em)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
