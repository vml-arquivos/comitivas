import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { Check, Info } from 'lucide-react';

export default function ConfiguradorPacote() {
  const { loteId } = useParams();
  const navigate = useNavigate();
  
  const [itensDisponiveis, setItensDisponiveis] = useState<any[]>([]);
  const [itensSelecionados, setItensSelecionados] = useState<Record<string, number>>({});
  const [calculo, setCalculo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchItens = async () => {
      try {
        const response = await api.get(`/pacotes/lotes/${loteId}/itens`);
        setItensDisponiveis(response.data.itens || []);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar itens. Tente novamente.');
        setItensDisponiveis([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchItens();
  }, [loteId]);

  // Recalcular sempre que mudar os itens
  useEffect(() => {
    if (isLoading) return;
    
    const calcular = async () => {
      setIsCalculating(true);
      try {
        const itensPayload = Object.entries(itensSelecionados)
          .filter(([_, qtd]) => qtd > 0)
          .map(([id, qtd]) => ({ id, quantidade: qtd }));

        const response = await api.post('/pacotes/calcular', {
          lote_id: loteId,
          itens: itensPayload
        });
        
        setCalculo(response.data);
      } catch (err: any) {
        console.error("Erro ao calcular valor:", err);
        setError('Erro ao calcular valor do pacote. Tente novamente.');
        setCalculo(null);
      } finally {
        setIsCalculating(false);
      }
    };

    // Debounce no cálculo
    const timer = setTimeout(calcular, 300);
    return () => clearTimeout(timer);
  }, [itensSelecionados, loteId, isLoading, itensDisponiveis]);

  const toggleItem = (id: string) => {
    setItensSelecionados(prev => {
      const current = prev[id] || 0;
      return { ...prev, [id]: current > 0 ? 0 : 1 };
    });
  };

  const handleReservar = async () => {
    setIsReserving(true);
    setError('');
    
    try {
      const itensPayload = Object.entries(itensSelecionados)
        .filter(([_, qtd]) => qtd > 0)
        .map(([id, qtd]) => ({ id, quantidade: qtd }));

      const response = await api.post('/pacotes/reservar', {
        lote_id: loteId,
        itens: itensPayload
      });
      
      navigate(`/checkout/${response.data.reserva_id}`);
          } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao criar reserva. Tente novamente.');
      } finally {
      setIsReserving(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center">Carregando configurador...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-secondary mb-2">Monte seu Pacote</h1>
          <p className="text-gray-600">Personalize sua experiência adicionando os itens desejados.</p>
        </div>
        
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-md">{error}</div>}

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Adicionais Disponíveis</h2>
          
          {itensDisponiveis.map(item => {
            const isSelected = (itensSelecionados[item.id] || 0) > 0;
            
            return (
              <Card 
                key={item.id} 
                className={`cursor-pointer transition-all ${isSelected ? 'border-primary ring-1 ring-primary' : 'hover:border-gray-300'}`}
                onClick={() => toggleItem(item.id)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${isSelected ? 'bg-primary border-primary text-white' : 'border-gray-300'}`}>
                      {isSelected && <Check size={14} />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{item.nome}</h3>
                      <p className="text-sm text-gray-500">{item.descricao}</p>
                    </div>
                  </div>
                  <div className="font-semibold">
                    + R$ {item.valor.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-1">
        <Card className="sticky top-24">
          <CardHeader className="bg-gray-50 border-b">
            <CardTitle>Resumo do Pacote</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pacote Base</span>
              <span className="font-medium">R$ {calculo?.valor_base?.toFixed(2) || '0.00'}</span>
            </div>
            
            {Object.entries(itensSelecionados).filter(([_, qtd]) => qtd > 0).length > 0 && (
              <div className="pt-4 border-t space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">Adicionais</p>
                {Object.entries(itensSelecionados)
                  .filter(([_, qtd]) => qtd > 0)
                  .map(([id, qtd]) => {
                    const item = itensDisponiveis.find(i => i.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.nome}</span>
                        <span className="font-medium">R$ {(item.valor * qtd).toFixed(2)}</span>
                      </div>
                    );
                  })}
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg">Total</span>
                <span className="font-bold text-2xl text-primary">
                  {isCalculating ? '...' : `R$ ${calculo?.valor_total?.toFixed(2) || '0.00'}`}
                </span>
              </div>
            </div>

            <Button 
              className="w-full mt-6" 
              size="lg"
              onClick={handleReservar}
              isLoading={isReserving}
              disabled={isCalculating}
            >
              Continuar para Pagamento
            </Button>
            
            <div className="flex items-start gap-2 text-xs text-gray-500 mt-4 bg-blue-50 p-3 rounded-md">
              <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p>Os valores são calculados em tempo real no servidor. Ao continuar, sua vaga será pré-reservada.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
