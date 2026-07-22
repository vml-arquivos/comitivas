import React, { useEffect, useState } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { Button, Card, CardContent } from '@ui/index';
import { CheckCircle, Download, Clock, Mail } from 'lucide-react';
import { api } from '../../contexts/AuthContext';

export default function Confirmacao() {
  const { reservaId } = useParams();
  const location = useLocation();
  const pagamentoData = location.state?.pagamentoData;
  const [status, setStatus] = useState('aguardando_pagamento');

  useEffect(() => {
    // Polling para verificar status do pagamento
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/pagamentos/status/${reservaId}`);
        if (res.data.status === 'aprovado') {
          setStatus('confirmado');
          clearInterval(interval);
        }
      } catch (err) {
        // Ignorar erros de polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [reservaId]);

  const handleDownloadContrato = async () => {
    try {
      const response = await api.get(`/contratos/download/${reservaId}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `contrato-${reservaId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Contrato ainda não disponível ou erro no download');
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
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
              <p className="text-gray-600">Escaneie o QR Code abaixo no seu app de banco para pagar:</p>
              <div className="bg-gray-100 p-4 inline-block rounded-xl mx-auto">
                {/* Simulando um QR code para o teste visual */}
                <div className="w-48 h-48 bg-white border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm text-center p-4">
                  [QR Code PIX Aqui]<br/><br/>
                  <span className="text-xs break-all">{pagamentoData.qr_code.substring(0, 20)}...</span>
                </div>
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

          {status === 'confirmado' && (
            <div className="bg-blue-50 text-blue-800 p-4 rounded-lg flex items-start gap-3 text-left">
              <Mail className="flex-shrink-0 mt-1" size={24} />
              <div>
                <h4 className="font-bold">Tudo certo com sua reserva!</h4>
                <p className="text-sm mt-1">Enviamos um e-mail com a confirmação, seu contrato em PDF assinado digitalmente e o comprovante de pagamento.</p>
              </div>
            </div>
          )}

          <div className="pt-6 border-t flex flex-col sm:flex-row justify-center gap-4">
            <Button variant="outline" onClick={handleDownloadContrato} className="flex items-center gap-2">
              <Download size={18} />
              Baixar Contrato PDF
            </Button>
            <Link to="/minhas-reservas">
              <Button>Ver Minhas Reservas</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
