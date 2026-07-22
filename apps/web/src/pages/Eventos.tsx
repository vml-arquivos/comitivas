import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../contexts/AuthContext';
import { Button, Card, CardContent, CardFooter } from '@ui/index';
import { Calendar, MapPin } from 'lucide-react';

export default function Eventos() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Para simplificar o teste, vamos mockar a listagem se a API falhar
    // pois não temos rotas públicas de listagem de eventos configuradas
    const fetchEventos = async () => {
      try {
        // Tentativa de buscar da API (se existir)
        const res = await api.get('/pacotes/lotes/mock-id/itens').catch(() => null);
        
        // Mocking dados para demonstração do frontend
        setEventos([
          {
            id: '1',
            nome: 'Festa do Peão de Barretos 2026',
            descricao: 'A maior festa do peão da América Latina. Saída de Goiânia com pacote completo.',
            data_inicio: '2026-08-20T00:00:00.000Z',
            data_fim: '2026-08-30T00:00:00.000Z',
            local: 'Barretos - SP',
            lote_id: 'lote-123',
            valor_base: 1500.00
          }
        ]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEventos();
  }, []);

  if (isLoading) return <div className="py-12 text-center">Carregando eventos...</div>;

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
              <Link to={`/pacote/${evento.lote_id}`}>
                <Button>Montar Pacote</Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
