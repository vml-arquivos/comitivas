import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Star, AlertCircle, Quote, ArrowRight } from 'lucide-react';
import { Button, WhatsAppCTA } from '@ui/index';

const MENSAGEM_WHATSAPP = 'Olá! Vi as avaliações da Excursão das Comitivas e quero informações sobre os pacotes para Barretos.';

export default function AvaliacoesPublicas() {
  const [avaliacoes, setAvaliacoes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAvaliacoes = async () => {
      try {
        const response = await api.get('/publico/avaliacoes');
        setAvaliacoes(response.data.avaliacoes || []);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar avaliações. Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvaliacoes();
  }, []);

  // Função helper para renderizar estrelas
  const renderStars = (nota: number) => {
    return Array.from({ length: 5 }).map((_, index) => (
      <Star 
        key={index} 
        size={20} 
        className={index < nota ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} 
      />
    ));
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center min-h-[60vh]">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-gray-600">Carregando depoimentos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      <Helmet>
        <title>Avaliações de Clientes | Excursão das Comitivas</title>
        <meta name="description" content="Leia depoimentos aprovados de quem já viajou com a Excursão das Comitivas para a Festa do Peão de Barretos." />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://comitivas.permupay.com.br/avaliacoes" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Excursão das Comitivas" />
        <meta property="og:title" content="Avaliações de Clientes | Excursão das Comitivas" />
        <meta property="og:description" content="Depoimentos aprovados de participantes da Excursão das Comitivas." />
        <meta property="og:url" content="https://comitivas.permupay.com.br/avaliacoes" />
        <meta property="og:image" content="https://comitivas.permupay.com.br/images/logo-compartilhamento.webp" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Avaliações | Excursão das Comitivas" />
        <meta name="twitter:description" content="Veja o que dizem os participantes das nossas excursões." />
        <meta name="twitter:image" content="https://comitivas.permupay.com.br/images/logo-compartilhamento.webp" />
      </Helmet>

      {/* Header */}
      <div className="bg-secondary py-20 text-center px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">O Que Dizem Nossos Clientes</h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          A satisfação de quem viaja com a gente é a nossa maior prova de qualidade.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-16">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg mx-auto text-center">
            <AlertCircle className="text-red-500 mx-auto mb-2" size={32} />
            <h3 className="font-semibold text-red-900">Erro ao carregar depoimentos</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        ) : avaliacoes.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Nenhuma avaliação ainda</h2>
            <p className="text-gray-600">Seja o primeiro a deixar um depoimento após sua viagem!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {avaliacoes.map((avaliacao) => (
              <div key={avaliacao.id} className="bg-gray-50 rounded-2xl p-8 border border-gray-100 relative">
                <Quote className="absolute top-6 right-6 text-gray-200" size={48} />
                <div className="flex gap-1 mb-6 relative z-10">
                  {renderStars(avaliacao.nota)}
                </div>
                <p className="text-gray-700 text-lg italic mb-8 relative z-10">
                  "{avaliacao.comentario}"
                </p>
                <div className="flex items-center gap-4 border-t border-gray-200 pt-6 mt-auto">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-lg">
                    {avaliacao.usuario?.nome?.charAt(0) || 'P'}
                  </div>
                  <div>
                    <div className="font-bold text-secondary">{avaliacao.usuario?.nome || 'Participante da excursão'}</div>
                    <div className="text-sm text-gray-500">{new Date(avaliacao.criado_em).toLocaleDateString('pt-BR')}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="mx-auto mt-20 max-w-4xl px-4 text-center">
        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-8 sm:p-10">
          <h2 className="text-2xl font-black text-secondary">Viva essa experiência na próxima edição</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">Conheça as modalidades de hospedagem e tire suas dúvidas diretamente com a equipe.</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/eventos"><Button size="lg">Ver excursões <ArrowRight size={18} className="ml-2" /></Button></Link>
            <WhatsAppCTA mensagem={MENSAGEM_WHATSAPP} label="Falar no WhatsApp" size="lg" />
          </div>
        </div>
      </section>
    </div>
  );
}
