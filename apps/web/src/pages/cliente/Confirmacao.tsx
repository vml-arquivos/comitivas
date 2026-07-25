import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useParams, Link } from 'react-router-dom';
import { Button, Card, CardContent } from '@ui/index';
import { CheckCircle, Download, Clock, FileCheck2, Ticket } from 'lucide-react';
import { api } from '../../contexts/AuthContext';

export default function Confirmacao() {
  const { reservaId } = useParams();
  const location = useLocation();
  const pagamentoData = location.state?.pagamentoData;
  const [status, setStatus] = useState('aguardando_pagamento');
  const [baixando, setBaixando] = useState('');
  const [erroDocumento, setErroDocumento] = useState('');

  useEffect(() => {
    const verificarStatus = async () => {
      try {
        const res = await api.get(`/pagamentos/status/${reservaId}`);
        if (res.data.status === 'aprovado') {
          setStatus('confirmado');
        }
      } catch (err) {
        // A tela continua utilizável mesmo se uma consulta pontual falhar.
      }
    };

    verificarStatus();
    const interval = setInterval(verificarStatus, 5000);

    return () => clearInterval(interval);
  }, [reservaId]);

  const baixarDocumento = async (tipo: 'contrato' | 'voucher') => {
    setBaixando(tipo);
    setErroDocumento('');
    try {
      const endpoint = tipo === 'contrato' ? 'download' : 'voucher';
      const response = await api.get(`/contratos/${endpoint}/${reservaId}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${tipo}-${reservaId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setErroDocumento(err.response?.data?.erro || `Não foi possível baixar o ${tipo}.`);
    } finally {
      setBaixando('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
      <Helmet>
        <title>Status da reserva | Excursão das Comitivas</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Card className="text-center overflow-hidden border-0 shadow-lg">
        <div className={`py-8 ${status === 'confirmado' ? 'bg-green-500' : 'bg-yellow-500'} text-white`}>
          {status === 'confirmado' ? (
            <CheckCircle size={64} className="mx-auto mb-4" />
          ) : (
            <Clock size={64} className="mx-auto mb-4 animate-pulse" />
          )}
          <h1 className="text-3xl font-bold">
            {status === 'confirmado' ? 'Pagamento Confirmado!' : 'Aguardando Pagamento'}
          </h1>
          <p className="mt-2 opacity-90">
            Reserva #{reservaId?.substring(0, 8)}
          </p>
        </div>

        <CardContent className="p-8 space-y-8">
          {status !== 'confirmado' && pagamentoData?.metodo === 'pix' && pagamentoData.qr_code && (
            <div className="space-y-4">
              <p className="text-gray-600">Use o código PIX Copia e Cola abaixo no aplicativo do seu banco:</p>
              <div className="bg-gray-100 p-4 rounded-xl text-left">
                <code className="block break-all text-xs text-gray-700 select-all">{pagamentoData.qr_code}</code>
              </div>
              <p className="text-sm text-gray-500">O status será atualizado automaticamente assim que o pagamento for processado.</p>
            </div>
          )}

          {status !== 'confirmado' && pagamentoData?.url_pagamento && (
            <div className="space-y-4">
              <p className="text-gray-600">Clique no botão abaixo para acessar a página de pagamento seguro:</p>
              <a href={pagamentoData.url_pagamento} target="_blank" rel="noreferrer">
                <Button size="lg" className="w-full sm:w-auto">Acessar Gateway de Pagamento</Button>
              </a>
            </div>
          )}

          {status !== 'confirmado' && pagamentoData && !pagamentoData.qr_code && !pagamentoData.url_pagamento && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-amber-900">
              <p className="font-semibold">Pagamento pendente</p>
              <p className="mt-1 text-sm">A reserva foi registrada e o contrato já está disponível para download. As instruções de cobrança serão apresentadas quando houver um gateway de pagamento configurado.</p>
            </div>
          )}

          {status === 'confirmado' && (
            <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg flex items-start gap-3 text-left">
              <FileCheck2 className="flex-shrink-0 mt-1" size={24} />
              <div>
                <h4 className="font-bold">Tudo certo com sua reserva!</h4>
                <p className="text-sm mt-1">O pagamento foi confirmado. Seu contrato e o voucher de embarque estão liberados abaixo e também na área “Minhas reservas”.</p>
              </div>
            </div>
          )}

          {status !== 'confirmado' && !pagamentoData && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-left text-slate-700">
              <p className="font-semibold">Acompanhando o pagamento</p>
              <p className="mt-1 text-sm">Esta página verifica o retorno do meio de pagamento automaticamente. Você também pode acompanhar a reserva pela área do cliente.</p>
            </div>
          )}

          {erroDocumento && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erroDocumento}</p>}

          <div className="pt-6 border-t flex flex-col sm:flex-row justify-center gap-4">
            <Button variant="outline" onClick={() => baixarDocumento('contrato')} isLoading={baixando === 'contrato'} className="flex items-center gap-2">
              <Download size={18} />
              Baixar Contrato PDF
            </Button>
            {status === 'confirmado' && (
              <Button variant="outline" onClick={() => baixarDocumento('voucher')} isLoading={baixando === 'voucher'} className="flex items-center gap-2">
                <Ticket size={18} />
                Baixar Voucher
              </Button>
            )}
            <Link to="/minhas-reservas">
              <Button>Ver Minhas Reservas</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
