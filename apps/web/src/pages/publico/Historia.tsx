import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { api } from '../../contexts/AuthContext';
import { Calendar, MapPin, AlertCircle } from 'lucide-react';
import { Button } from '@ui/index';

export default function Historia() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchEventosRealizados = async () => {
      try {
        const response = await api.get('/publico/eventos-realizados');
        setEventos(response.data.eventos || []);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar histórico. Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventosRealizados();
  }, []);

  if (isLoading) {
    return (
      <div className="py-24 text-center min-h-[60vh]">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-gray-600">Carregando nosso histórico...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Helmet>
        <title>Nossa História | Comitiva Prime</title>
        <meta name="description" content="Veja fotos e relembre as edições passadas das nossas excursões para Barretos e outros eventos sertanejos." />
      </Helmet>

      {/* Header */}
      <div className="bg-secondary py-20 text-center px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Excursões Realizadas</h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          Mais de 10 anos colecionando momentos inesquecíveis. Veja por onde a Comitiva Prime já passou.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-16">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg mx-auto text-center">
            <AlertCircle className="text-red-500 mx-auto mb-2" size={32} />
            <h3 className="font-semibold text-red-900">Erro ao carregar histórico</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        ) : eventos.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Histórico em construção</h2>
            <p className="text-gray-600">As fotos das edições anteriores estão sendo atualizadas.</p>
          </div>
        ) : (
          <div className="space-y-24">
            {eventos.map((evento, index) => (
              <div key={evento.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-8 md:p-12 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-3xl font-bold text-secondary mb-3">{evento.nome}</h2>
                    <div className="flex flex-wrap items-center gap-4 text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={18} className="text-primary" />
                        <span>{new Date(evento.data_inicio).toLocaleDateString('pt-BR')} a {new Date(evento.data_fim).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={18} className="text-primary" />
                        <span>{evento.local}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-6 py-4 rounded-xl text-center">
                    <div className="text-3xl font-bold text-primary">{evento.fotos?.length || 0}</div>
                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Fotos</div>
                  </div>
                </div>

                <div className="p-8 md:p-12">
                  {evento.fotos && evento.fotos.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {evento.fotos.map((foto: any) => (
                        <div 
                          key={foto.id} 
                          className="aspect-square rounded-xl overflow-hidden cursor-pointer group relative"
                          onClick={() => setSelectedImage(foto.url_foto)}
                        >
                          <img 
                            src={foto.url_foto} 
                            alt={foto.legenda || `Foto de ${evento.nome}`} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <p className="text-gray-500">Nenhuma foto cadastrada para este evento ainda.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button 
            className="absolute top-6 right-6 text-white hover:text-gray-300"
            onClick={() => setSelectedImage(null)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <img 
            src={selectedImage} 
            alt="Foto ampliada" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
