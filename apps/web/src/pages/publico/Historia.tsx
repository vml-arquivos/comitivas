import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../contexts/AuthContext';
import { Button, WhatsAppCTA } from '@ui/index';
import { ArrowRight, Calendar, MapPin, AlertCircle, Image as ImageIcon, X } from 'lucide-react';

const MENSAGEM_WHATSAPP_HISTORIA = 'Olá! Vi o histórico de excursões da Excursão das Comitivas e quero saber mais sobre a próxima viagem para Barretos.';

export default function Historia() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ src: string; alt: string; legenda?: string | null } | null>(null);

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

  useEffect(() => {
    if (!selectedImage) return undefined;

    const fecharComEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedImage(null);
    };

    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', fecharComEsc);

    return () => {
      document.body.style.overflow = overflowOriginal;
      window.removeEventListener('keydown', fecharComEsc);
    };
  }, [selectedImage]);

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
        <title>Histórico de Excursões | Excursão das Comitivas</title>
        <meta name="description" content="Veja fotos e relembre as edições passadas da Excursão das Comitivas em Barretos e outros eventos sertanejos." />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://comitivas.permupay.com.br/historia" />
        <meta property="og:title" content="Histórico de Excursões | Excursão das Comitivas" />
        <meta property="og:description" content="Fotos e histórias das excursões realizadas pela Excursão das Comitivas." />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Excursão das Comitivas" />
        <meta property="og:url" content="https://comitivas.permupay.com.br/historia" />
        <meta property="og:image" content="https://comitivas.permupay.com.br/images/logo-compartilhamento.webp" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Nossa História | Excursão das Comitivas" />
        <meta name="twitter:description" content="Quase 18 anos de estrada e uma equipe oficializada em 2015." />
        <meta name="twitter:image" content="https://comitivas.permupay.com.br/images/logo-compartilhamento.webp" />
      </Helmet>

      {/* Header */}
      <div className="bg-secondary py-20 text-center px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Nossa História</h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          Raízes de quase 18 anos de estrada. A equipe atual transformou essa experiência em uma operação oficial em 2015.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-16">
        <section className="mb-20 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
          <img src="/images/gallery/estatua-peao.jpg" alt="Estátua do Peão, símbolo de Barretos" className="h-full min-h-[340px] w-full object-cover" />
          <div className="flex flex-col justify-center p-8 sm:p-12">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Estrada, cuidado e pertencimento</p>
            <h2 className="mt-3 text-3xl font-black text-secondary sm:text-4xl">Uma comitiva construída edição após edição</h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
              <p>A história começou muito antes da formalização da equipe atual. São quase 18 anos acompanhando viajantes até Barretos, aprendendo na prática o que faz uma excursão ser segura, organizada e inesquecível.</p>
              <p>Em 2015, a equipe atual foi oficializada. Desde então, cada edição é preparada com o mesmo objetivo: receber bem, cumprir o combinado e permitir que cada participante aproveite a festa do começo ao fim.</p>
              <p>Os álbuns abaixo são alimentados com as fotos cadastradas pela administração. Para uma experiência mais visual, visite também nossa galeria.</p>
            </div>
            <Link to="/galeria" className="mt-7 inline-flex items-center gap-2 self-start font-bold text-primary hover:underline">
              Explorar a galeria <ArrowRight size={17} />
            </Link>
          </div>
        </section>

        <div className="mb-10 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Álbuns por edição</p>
          <h2 className="mt-2 text-3xl font-black text-secondary">Excursões realizadas</h2>
        </div>

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
                      {evento.fotos.map((foto: any) => {
                        const alt = foto.legenda || `Foto de ${evento.nome}`;
                        return (
                          <button
                            key={foto.id}
                            type="button"
                            className="aspect-square rounded-xl overflow-hidden cursor-pointer group relative text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                            onClick={() => setSelectedImage({ src: foto.url_foto, alt, legenda: foto.legenda })}
                            aria-label={`Ampliar foto: ${alt}`}
                          >
                            <img
                              src={foto.url_foto}
                              alt={alt}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300"></span>
                            <span className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"><ImageIcon size={16} /></span>
                          </button>
                        );
                      })}
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

      <div className="max-w-4xl mx-auto px-4 mt-20 text-center">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 sm:p-10">
          <h2 className="text-2xl font-bold text-secondary">Gostou do que viu? A próxima edição está aberta.</h2>
          <p className="mt-2 text-slate-600">Fale com a nossa equipe pelo WhatsApp ou veja os pacotes disponíveis para garantir sua vaga.</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <WhatsAppCTA mensagem={MENSAGEM_WHATSAPP_HISTORIA} label="Falar no WhatsApp" size="lg" />
            <Link to="/eventos"><Button size="lg" variant="outline">Ver pacotes disponíveis <ArrowRight size={18} className="ml-2" /></Button></Link>
          </div>
        </div>
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Visualização ampliada: ${selectedImage.legenda || selectedImage.alt}`}
          onMouseDown={() => setSelectedImage(null)}
        >
          <div className="relative max-h-full max-w-6xl" onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="absolute -right-2 -top-12 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              onClick={() => setSelectedImage(null)}
              aria-label="Fechar imagem ampliada"
            ><X size={20} /> Fechar</button>
            <img
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
            {selectedImage.legenda && <p className="mt-3 text-center text-sm font-semibold text-white">{selectedImage.legenda}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
