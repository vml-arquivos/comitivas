import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { Calendar, Ticket, Download } from 'lucide-react';

export default function MinhasReservas() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReservas = async () => {
      try {
        const response = await api.get('/pacotes/minhas-reservas');
        setReservas(response.data.reservas || []);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar reservas. Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReservas();
  }, []);

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string, text: string, label: string }> = {
      'visitante': { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Visitante' },
      'cadastrado': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Cadastrado' },
      'pacote_montado': { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Pacote Montado' },
      'checkout_iniciado': { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Checkout Iniciado' },
      'aguardando_pagamento': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Aguardando Pagamento' },
      'contrato_gerado': { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Contrato Gerado' },
      'cliente_confirmado': { bg: 'bg-green-100', text: 'text-green-800', label: 'Confirmado' },
      'abandonado': { bg: 'bg-red-100', text: 'text-red-800', label: 'Abandonado' },
    };

    const badge = badges[status] || badges['visitante'];
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>;
  };

  if (isLoading) return <div className="py-12 text-center">Carregando suas reservas...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-secondary">Minhas Reservas</h1>

      {reservas.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Ticket size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">Nenhuma reserva encontrada</h3>
            <p className="text-gray-500 mb-6">Você ainda não fez nenhuma reserva de pacote conosco.</p>
            <Link to="/">
              <Button>Ver Eventos Disponíveis</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reservas.map((reserva) => (
            <Card key={reserva.id}>
              <CardHeader className="border-b bg-gray-50 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">Reserva #{reserva.id.substring(0, 8)}</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      Realizada em {new Date(reserva.criado_em).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {getStatusBadge(reserva.status)}
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Valor Total:</span>
                  <span className="font-bold text-lg">R$ {reserva.valor_total}</span>
                </div>

                <div className="pt-4 border-t flex flex-wrap gap-3">
                  {reserva.status === 'aguardando_pagamento' || reserva.status === 'contrato_gerado' ? (
                    <Link to={`/checkout/${reserva.id}`} className="flex-1">
                      <Button className="w-full">Pagar Agora</Button>
                    </Link>
                  ) : reserva.status === 'cliente_confirmado' ? (
                    <Button variant="outline" className="flex-1 flex items-center justify-center gap-2">
                      <Download size={16} /> Contrato
                    </Button>
                  ) : (
                    <Link to={`/pacote/${reserva.lote_id}`} className="flex-1">
                      <Button variant="outline" className="w-full">Continuar Montagem</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
