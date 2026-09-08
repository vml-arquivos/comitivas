import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useParams, Link } from 'react-router-dom';
import { Button, Card, CardContent } from '@ui/index';
import { CheckCircle, Download, Clock, FileCheck2, Landmark, RefreshCw, Ticket } from 'lucide-react';
import { api } from '../../contexts/AuthContext';

type EstadoPagamento = { status?: string; status_reconciliado?: string; checkout_estado?: string; boleto_modo?: string; parcelas?: any[] };

const ESTADOS: Record<string, { titulo: string; descricao: string; ok?: boolean }> = {
  aguardando_aprovacao_boleto: { titulo: 'Contrato validado · cadastro em análise', descricao: 'A equipe vai conferir seu cadastro e as evidências da assinatura. Depois da aprovação, os boletos serão preparados e enviados por e-mail e WhatsApp.' },
  boletos_em_preparacao: { titulo: 'Boletos em preparação', descricao: 'Seu cadastro e contrato foram aprovados. A administração está anexando as parcelas do boleto à sua ficha.' },
  boletos_enviados: { titulo: 'Boletos enviados', descricao: 'As parcelas foram disponibilizadas pela equipe. Acompanhe os vencimentos e as confirmações de pagamento.' },
  aguardando_pagamento: { titulo: 'Aguardando pagamento', descricao: 'A reserva está aguardando confirmação financeira.' },
  primeira_parcela_confirmada: { titulo: 'Pagamento parcial confirmado', descricao: 'A primeira parcela foi confirmada. Continue acompanhando as demais parcelas no cronograma.' },
  pagamento_parcial: { titulo: 'Pagamento parcial confirmado', descricao: 'Há pagamento confirmado e parcelas ainda em aberto.' },
  quitado: { titulo: 'Pagamento quitado!', descricao: 'Todas as parcelas foram confirmadas e a reserva está financeiramente quitada.', ok: true },
  cliente_confirmado: { titulo: 'Reserva confirmada!', descricao: 'Sua viagem está confirmada. Contrato e voucher ficam disponíveis na área do cliente.', ok: true },
};

export default function Confirmacao() {
  const { reservaId } = useParams();
  const location = useLocation();
  const pagamentoData = location.state?.pagamentoData;
  const [estado, setEstado] = useState<EstadoPagamento>({ checkout_estado: pagamentoData?.checkout_estado, status: pagamentoData?.status });
  const [baixando, setBaixando] = useState('');
  const [erroDocumento, setErroDocumento] = useState('');
  const [consultando, setConsultando] = useState(false);

  const verificarStatus = async () => {
    if (!reservaId) return;
    setConsultando(true);
    try {
      const res = await api.get(`/pagamentos/status/${reservaId}`);
      setEstado(res.data || {});
    } catch {
      // Mantém o último estado conhecido; o usuário ainda pode acessar os documentos.
    } finally { setConsultando(false); }
  };

  useEffect(() => {
    void verificarStatus();
    const interval = window.setInterval(() => void verificarStatus(), 15000);
    return () => window.clearInterval(interval);
  }, [reservaId]);

  const baixarDocumento = async (tipo: 'contrato' | 'voucher') => {
    setBaixando(tipo); setErroDocumento('');
    try {
      const endpoint = tipo === 'contrato' ? 'download' : 'voucher';
      const response = await api.get(`/contratos/${endpoint}/${reservaId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `${tipo}-${reservaId}.pdf`); document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch (err: any) { setErroDocumento(err.response?.data?.erro || `Não foi possível baixar o ${tipo}.`); }
    finally { setBaixando(''); }
  };

  const chave = String(estado.checkout_estado || estado.status_reconciliado || estado.status || 'aguardando_pagamento');
  const atual = ESTADOS[chave] || { titulo: 'Reserva em acompanhamento', descricao: 'A equipe e o sistema estão acompanhando os próximos passos da sua contratação.' };
  const confirmado = Boolean(atual.ok || estado.status_reconciliado === 'quitado');
  const manual = estado.boleto_modo === 'manual' || pagamentoData?.modo === 'manual' || ['aguardando_aprovacao_boleto', 'boletos_em_preparacao', 'boletos_enviados'].includes(chave);
  const parcelas = Array.isArray(estado.parcelas) ? estado.parcelas : [];

  return <div className="mx-auto max-w-2xl py-12">
    <Helmet><title>Status da reserva | Excursão das Comitivas</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <Card className="overflow-hidden border-0 text-center shadow-lg">
      <div className={`py-8 ${confirmado ? 'bg-emerald-600' : manual ? 'bg-[#182D3B]' : 'bg-amber-500'} text-white`}>
        {confirmado ? <CheckCircle size={64} className="mx-auto mb-4" /> : manual ? <Landmark size={64} className="mx-auto mb-4" /> : <Clock size={64} className="mx-auto mb-4" />}
        <h1 className="text-3xl font-bold">{atual.titulo}</h1>
        <p className="mx-auto mt-3 max-w-lg px-6 text-sm leading-6 text-white/85">{atual.descricao}</p>
        <p className="mt-2 text-xs text-white/65">Reserva #{reservaId?.substring(0, 8)}</p>
      </div>
      <CardContent className="space-y-7 p-8">
        {!confirmado && pagamentoData?.metodo === 'pix' && pagamentoData.qr_code && <div className="space-y-4"><p className="text-gray-600">Use o código PIX Copia e Cola abaixo no aplicativo do seu banco:</p><div className="rounded-xl bg-gray-100 p-4 text-left"><code className="block select-all break-all text-xs text-gray-700">{pagamentoData.qr_code}</code></div></div>}
        {!confirmado && pagamentoData?.url_pagamento && <a href={pagamentoData.url_pagamento} target="_blank" rel="noreferrer"><Button size="lg">Acessar gateway de pagamento</Button></a>}
        {manual && <div className="rounded-xl border border-[#182D3B]/15 bg-[#F8F5EF] p-5 text-left"><h2 className="font-bold text-secondary">Boleto bancário com controle administrativo</h2><p className="mt-2 text-sm leading-6 text-gray-600">Nenhum boleto é gerado automaticamente neste modo. A administração valida o cadastro e o contrato assinado, anexa cada PDF à sua ficha e registra os envios e as baixas de pagamento.</p></div>}
        {parcelas.length > 0 && <div className="text-left"><h2 className="mb-3 font-bold text-secondary">Cronograma financeiro</h2><div className="space-y-2">{parcelas.map((p: any) => <div key={p.id || p.sequencia} className="flex items-center justify-between rounded-xl border border-gray-200 p-3 text-sm"><div><strong>Parcela {p.sequencia}</strong><p className="text-xs text-gray-500">Vencimento {p.vencimento || 'a confirmar'} · {p.boleto_disponivel ? 'boleto preparado' : 'aguardando boleto'}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${p.status === 'aprovado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{p.status || 'pendente'}</span></div>)}</div></div>}
        {confirmado && <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-left text-emerald-800"><FileCheck2 className="mt-1 shrink-0" size={24} /><div><h4 className="font-bold">Tudo certo com sua reserva!</h4><p className="mt-1 text-sm">O financeiro foi confirmado. Seus documentos liberados também ficam em “Minhas reservas”.</p></div></div>}
        {erroDocumento && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erroDocumento}</p>}
        <div className="flex flex-col justify-center gap-3 border-t pt-6 sm:flex-row"><Button variant="outline" onClick={() => void baixarDocumento('contrato')} isLoading={baixando === 'contrato'}><Download size={18} className="mr-2" />Baixar contrato</Button>{confirmado && <Button variant="outline" onClick={() => void baixarDocumento('voucher')} isLoading={baixando === 'voucher'}><Ticket size={18} className="mr-2" />Baixar voucher</Button>}<Button variant="outline" disabled={consultando} onClick={() => void verificarStatus()}><RefreshCw size={16} className="mr-2" />Atualizar</Button><Link to="/minhas-reservas"><Button>Minhas reservas</Button></Link></div>
      </CardContent>
    </Card>
  </div>;
}
