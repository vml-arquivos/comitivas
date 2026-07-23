import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../contexts/AuthContext';
import { Button, Card, CardContent, CardFooter } from '@ui/index';
import { Calendar, MapPin, AlertCircle } from 'lucide-react';

export default function Eventos() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEventos = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/eventos');
      setEventos(res.data.eventos || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar eventos. Tente novamente.');
      setEventos([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEventos();
  }, []);

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <div className="inline-block">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
        <p className="mt-4 text-gray-600">Carregando eventos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-500 mt-0.5" size={24} />
            <div>
              <h3 className="font-semibold text-red-900">Erro ao carregar eventos</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <Button 
                onClick={fetchEventos} 
                variant="outline" 
                className="mt-4"
              >
                Tentar Novamente
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Nenhum evento disponível</h2>
        <p className="text-gray-600">Volte mais tarde para ver novos eventos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4 py-8">
        <h1 className="text-4xl font-bold text-secondary">Próximas Excursões</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Escolha seu destino, monte seu pacote personalizado e garanta sua vaga com a melhor comitiva do Brasil.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {eventos.map((evento) => (
          <Card key={evento.id} className="overflow-hidden flex flex-col">
            <div className="h-48 bg-gray-200 relative">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <h3 className="text-xl font-bold">{evento.nome}</h3>
              </div>
            </div>
            <CardContent className="flex-1 pt-6 space-y-4">
              <p className="text-gray-600 text-sm">{evento.descricao}</p>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-primary" />
                  <span>{new Date(evento.data_inicio).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-primary" />
                  <span>{evento.local}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-gray-50 border-t flex justify-between items-center py-4">
              <div className="text-sm">
                <span className="text-gray-500">A partir de</span>
                <div className="font-bold text-lg text-secondary">
                  R$ {evento.valor_base.toFixed(2)}
                </div>
              </div>
              <Link to={`/pacote/${evento.id}`}>
                <Button>Montar Pacote</Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
