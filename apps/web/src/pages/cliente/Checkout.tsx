import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { CheckSquare, CreditCard, QrCode, FileText, AlertCircle } from 'lucide-react';

export default function Checkout() {
  const { reservaId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [reserva, setReserva] = useState<any>(null);
  const [contratoAceito, setContratoAceito] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState<'pix' | 'credito' | 'debito'>('pix');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchReserva = async () => {
      try {
        const response = await api.get(`/pacotes/reservas/${reservaId}`);
        setReserva(response.data);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar reserva. Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReserva();
  }, [reservaId]);

  const handleFinalizar = async () => {
    if (!contratoAceito) {
      setError('Você precisa aceitar os termos do contrato para continuar.');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      // 1. Aceitar contrato
      await api.post(`/contratos/aceitar/${reservaId}`);
      
      // 2. Gerar pagamento
      const response = await api.post('/pagamentos/criar', {
        reserva_id: reservaId,
        metodo: metodoPagamento
      });
      
      // Redirecionar para confirmação/QR Code
      navigate(`/confirmacao/${reservaId}`, { 
        state: { pagamentoData: response.data } 
      });
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao processar checkout. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center">Carregando detalhes...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-secondary">Finalizar Reserva</h1>
        <p className="text-gray-600">Falta pouco para garantir sua vaga!</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 flex items-start gap-3">
          <AlertCircle className="text-red-500 mt-0.5" size={20} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center gap-2">
            <FileText size={20} className="text-primary" />
            Contrato e Termos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="bg-gray-100 p-4 rounded-md h-48 overflow-y-auto text-sm text-gray-700 border border-gray-200">
            <h4 className="font-bold mb-2">TERMOS DE PRESTAÇÃO DE SERVIÇOS - COMITIVA</h4>
            <p className="mb-2">Ao aceitar este contrato, o contratante concorda com as regras de cancelamento, horários de embarque e regras de convivência da excursão.</p>
            <p className="mb-2">1. O valor total da reserva é de R$ {reserva?.valor_total}.</p>
            <p className="mb-2">2. O não comparecimento no horário de embarque configura no-show, sem direito a reembolso.</p>
            <p>3. Este documento será assinado digitalmente com registro de IP e Data/Hora, possuindo validade legal.</p>
            {/* O contrato real será gerado em PDF pelo backend */}
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-4 border rounded-md hover:bg-gray-50 transition-colors">
            <input 
              type="checkbox" 
              className="mt-1 h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
              checked={contratoAceito}
              onChange={(e) => setContratoAceito(e.target.checked)}
            />
            <div>
              <span className="font-medium text-gray-900 block">Li e aceito os termos do contrato</span>
              <span className="text-sm text-gray-500 block">
                Ao marcar esta caixa, concordo com a assinatura digital do contrato (IP será registrado).
              </span>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle>Forma de Pagamento</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setMetodoPagamento('pix')}
              className={`p-4 border rounded-xl flex flex-col items-center justify-center gap-3 transition-all ${
                metodoPagamento === 'pix' ? 'border-primary ring-2 ring-primary/20 bg-red-50/50' : 'hover:border-gray-300'
              }`}
            >
              <QrCode size={32} className={metodoPagamento === 'pix' ? 'text-primary' : 'text-gray-400'} />
              <span className="font-medium">PIX</span>
              <span className="text-xs text-green-600 font-medium">Aprovação imediata</span>
            </button>

            <button
              type="button"
              onClick={() => setMetodoPagamento('credito')}
              className={`p-4 border rounded-xl flex flex-col items-center justify-center gap-3 transition-all ${
                metodoPagamento === 'credito' ? 'border-primary ring-2 ring-primary/20 bg-red-50/50' : 'hover:border-gray-300'
              }`}
            >
              <CreditCard size={32} className={metodoPagamento === 'credito' ? 'text-primary' : 'text-gray-400'} />
              <span className="font-medium">Cartão de Crédito</span>
              <span className="text-xs text-gray-500">Até 12x</span>
            </button>

            <button
              type="button"
              onClick={() => setMetodoPagamento('debito')}
              className={`p-4 border rounded-xl flex flex-col items-center justify-center gap-3 transition-all ${
                metodoPagamento === 'debito' ? 'border-primary ring-2 ring-primary/20 bg-red-50/50' : 'hover:border-gray-300'
              }`}
            >
              <CreditCard size={32} className={metodoPagamento === 'debito' ? 'text-primary' : 'text-gray-400'} />
              <span className="font-medium">Cartão de Débito</span>
              <span className="text-xs text-gray-500">À vista</span>
            </button>
          </div>

          <div className="mt-8 flex justify-between items-center pt-6 border-t">
            <div>
              <p className="text-sm text-gray-500">Total a pagar</p>
              <p className="text-3xl font-bold text-secondary">R$ {reserva?.valor_total}</p>
            </div>
            <Button 
              size="lg" 
              onClick={handleFinalizar}
              isLoading={isProcessing}
              disabled={!contratoAceito}
              className="px-8"
            >
              Finalizar Reserva
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
