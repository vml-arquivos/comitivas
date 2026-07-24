import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../contexts/AuthContext';
import { Button } from '@ui/index';
import { Star, Users, MapPin, Calendar, Bus, GlassWater, Bed, ShieldCheck } from 'lucide-react';

export default function Home() {
  const [eventoAtivo, setEventoAtivo] = useState<any>(null);
  const [avaliacoes, setAvaliacoes] = useState<any[]>([]);
  const [stats, setStats] = useState({ clientes: 0, edicoes: 10, nota: 4.9 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPublicData = async () => {
      try {
        // Buscar evento principal ativo (Barretos)
        const resEventos = await api.get('/publico/eventos-ativos');
        if (resEventos.data.eventos && resEventos.data.eventos.length > 0) {
          setEventoAtivo(resEventos.data.eventos[0]);
        }

        // Buscar avaliações aprovadas
        const resAvaliacoes = await api.get('/publico/avaliacoes');
        setAvaliacoes(resAvaliacoes.data.avaliacoes?.slice(0, 3) || []);

        // Na vida real, clientes confirmados viria de um endpoint de stats público
        // Aqui simulamos o número para a prova social, mas deve ser conectado à API real
        const resStats = await api.get('/publico/stats');
        setStats(prev => ({
          ...prev,
          clientes: resStats.data.clientesConfirmados ?? prev.clientes,
          nota: resStats.data.notaMedia ?? prev.nota,
        }));
      } catch (err) {
        console.error("Erro ao carregar dados públicos:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPublicData();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Comitiva Prime | A Melhor Experiência de Barretos</title>
        <meta name="description" content="Viaje para a Festa do Peão de Barretos com a comitiva mais exclusiva. 10 anos de tradição, transporte premium, camarote e open bar." />
      </Helmet>

      {/* Hero Section */}
      <section className="relative h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background Image - Placeholder for a real high-quality image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ 
            backgroundImage: 'url("/images/hero-parque-peao.jpg")',
          }}
        />
        <div className="absolute inset-0 bg-black/60" /> {/* Overlay escuro */}

        <div className="relative z-10 text-center px-4 max-w-5xl mx-auto mt-16">
          <span className="inline-block py-1 px-3 rounded-full bg-primary/20 text-primary border border-primary/30 text-sm font-semibold mb-6 backdrop-blur-sm">
            DESDE 2015 • RAÍZES DE QUASE 18 ANOS DE ESTRADA
          </span>
          <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 leading-tight">
            A Maior Experiência <br />do <span className="text-primary">Barretão</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-200 mb-10 max-w-3xl mx-auto font-light">
            Viaje com a comitiva mais exclusiva do Brasil. Transporte premium, camarote, hospedagem e open bar em um pacote 100% personalizável.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {eventoAtivo ? (
              <Link to={`/pacote/${eventoAtivo.id}`}>
                <Button size="lg" className="text-lg px-8 py-6 w-full sm:w-auto shadow-lg shadow-primary/30">
                  Garantir Minha Vaga
                </Button>
              </Link>
            ) : (
              <Link to="/eventos">
                <Button size="lg" className="text-lg px-8 py-6 w-full sm:w-auto shadow-lg shadow-primary/30">
                  Ver Próximas Excursões
                </Button>
              </Link>
            )}
            <Link to="/historia">
              <Button variant="outline" size="lg" className="text-lg px-8 py-6 w-full sm:w-auto text-white border-white hover:bg-white/10 backdrop-blur-sm">
                Conhecer Nossa História
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats / Prova Social */}
      <section className="py-12 bg-secondary text-white">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-gray-700">
          <div className="py-4">
            <div className="text-4xl font-bold text-primary mb-2">+{stats.edicoes} Anos</div>
            <div className="text-gray-300 font-medium">De Tradição em Barretos</div>
          </div>
          <div className="py-4">
            <div className="text-4xl font-bold text-primary mb-2">+{stats.clientes.toLocaleString('pt-BR')}</div>
            <div className="text-gray-300 font-medium">Clientes Satisfeitos</div>
          </div>
          <div className="py-4">
            <div className="flex items-center justify-center gap-1 mb-2">
              <span className="text-4xl font-bold text-primary">{stats.nota}</span>
              <Star className="text-primary fill-primary" size={32} />
            </div>
            <div className="text-gray-300 font-medium">Avaliação Média</div>
          </div>
        </div>
      </section>

      {/* O Que Está Incluso */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-secondary mb-4">Experiência Premium Completa</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Tudo que você precisa para curtir a festa sem preocupações. Nosso pacote base já inclui o essencial, e você personaliza o resto.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <Bus className="text-primary" size={32} />
              </div>
              <h3 className="text-xl font-bold text-secondary mb-3">Ônibus Leito</h3>
              <p className="text-gray-600">Transporte executivo de luxo com poltronas leito, ar-condicionado e conforto máximo.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <GlassWater className="text-primary" size={32} />
              </div>
              <h3 className="text-xl font-bold text-secondary mb-3">Open Bar VIP</h3>
              <p className="text-gray-600">Serviço de bordo premium durante toda a viagem de ida e volta, com bebidas selecionadas.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <Bed className="text-primary" size={32} />
              </div>
              <h3 className="text-xl font-bold text-secondary mb-3">Hospedagem</h3>
              <p className="text-gray-600">Hotéis parceiros selecionados a dedo, com café da manhã e traslado para o parque.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <ShieldCheck className="text-primary" size={32} />
              </div>
              <h3 className="text-xl font-bold text-secondary mb-3">Suporte 24h</h3>
              <p className="text-gray-600">Equipe de coordenação dedicada durante todo o evento para garantir sua segurança.</p>
            </div>
          </div>
        </div>
      </section>

      {/* História (Conteúdo Editorial Estático) */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2 space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold text-secondary">Nossa História: Uma Paixão de Mais de Duas Décadas</h2>
            <div className="w-20 h-1 bg-primary rounded-full"></div>
            <p className="text-lg text-gray-600 leading-relaxed">
              A Excursão das Comitivas nasceu do amor pela Festa do Peão de Barretos e pelo estilo de vida country. As raízes dessa
              caravana remontam a quase 18 anos de estrada, e em 2015 o grupo se oficializou com a equipe atual, dando início a uma
              nova fase — a mesma dedicação de sempre, agora com estrutura profissional.
            </p>
            <p className="text-lg text-gray-600 leading-relaxed">
              Não somos apenas uma agência de turismo: somos uma comitiva de verdade, apaixonada pelo sertanejo e movida pela vontade
              de compartilhar essa emoção com quem viaja com a gente. Ano após ano, aperfeiçoamos cada detalhe para entregar a melhor
              experiência da Festa do Peão.
            </p>
            <p className="text-lg font-semibold text-secondary">
              Nossa missão é simples: você só se preocupa em curtir a festa. O resto é com a gente.
            </p>
            <div className="pt-4">
              <Link to="/historia">
                <Button variant="outline" className="text-secondary border-gray-300 hover:bg-gray-50">
                  Ver Galeria de Fotos Antigas
                </Button>
              </Link>
            </div>
          </div>
          <div className="lg:w-1/2">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <img
                src="/images/gallery/estatua-peao.jpg"
                alt="Estátua do Peão, símbolo da Festa de Barretos"
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-0 border-4 border-white/20 rounded-2xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-24 bg-secondary relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold text-white">Pronto para a melhor viagem do ano?</h2>
          <p className="text-xl text-gray-300">
            As vagas do 1º lote são limitadas e costumam esgotar em poucos dias. Não fique de fora da Comitiva Prime.
          </p>
          <div className="pt-4">
            {eventoAtivo ? (
              <Link to={`/pacote/${eventoAtivo.id}`}>
                <Button size="lg" className="text-xl px-10 py-6 shadow-lg shadow-primary/30">
                  Montar Meu Pacote Agora
                </Button>
              </Link>
            ) : (
              <Link to="/eventos">
                <Button size="lg" className="text-xl px-10 py-6 shadow-lg shadow-primary/30">
                  Ver Excursões Disponíveis
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
