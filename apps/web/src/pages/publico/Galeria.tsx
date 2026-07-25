import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Image as ImageIcon, X } from 'lucide-react';
import { Button, WhatsAppCTA } from '@ui/index';
import { api } from '../../contexts/AuthContext';

const MENSAGEM_WHATSAPP = 'Olá! Vi a galeria da Excursão das Comitivas e quero informações sobre a próxima viagem para Barretos.';

const FOTOS_EDITORIAIS = [
  { src: '/images/hero-parque-peao.jpg', alt: 'Parque do Peão em Barretos', evento: 'Barretos' },
  { src: '/images/gallery/barretos-vista.jpg', alt: 'Vista da Festa do Peão de Barretos', evento: 'Barretos' },
  { src: '/images/gallery/estatua-peao.jpg', alt: 'Estátua do Peão em Barretos', evento: 'Barretos' },
  { src: '/images/gallery/festa-multidao.webp', alt: 'Público reunido na arena de Barretos', evento: 'Barretos' },
  { src: '/images/gallery/arena-shows.avif', alt: 'Arena de shows durante a Festa do Peão', evento: 'Barretos' },
];

type FotoGaleria = {
  id?: string;
  src: string;
  alt: string;
  legenda?: string | null;
  evento: string;
  data?: string | null;
};

export default function Galeria() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<FotoGaleria | null>(null);

  useEffect(() => {
    api.get('/publico/eventos-realizados')
      .then((response) => setEventos(response.data.eventos || []))
      .catch((error) => setErro(error.response?.data?.erro || 'Não foi possível carregar as fotos cadastradas.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!selecionada) return undefined;
    const fechar = (event: KeyboardEvent) => event.key === 'Escape' && setSelecionada(null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', fechar);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', fechar);
    };
  }, [selecionada]);

  const fotos = useMemo<FotoGaleria[]>(() => {
    const cadastradas = eventos.flatMap((evento) =>
      (evento.fotos || []).map((foto: any) => ({
        id: foto.id,
        src: foto.url_foto,
        alt: foto.legenda || `Registro de ${evento.nome}`,
        legenda: foto.legenda,
        evento: evento.nome,
        data: evento.data_inicio,
      })),
    );
    return cadastradas.length > 0 ? cadastradas : FOTOS_EDITORIAIS;
  }, [eventos]);

  return (
    <div className="min-h-screen bg-[#fffdf9] pb-24">
      <Helmet>
        <title>Galeria | Excursão das Comitivas</title>
        <meta name="description" content="Veja fotos da experiência da Excursão das Comitivas em Barretos e conheça o clima que espera por você." />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://comitivas.permupay.com.br/galeria" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Excursão das Comitivas" />
        <meta property="og:title" content="Galeria | Excursão das Comitivas" />
        <meta property="og:description" content="Fotos da experiência da Excursão das Comitivas em Barretos." />
        <meta property="og:url" content="https://comitivas.permupay.com.br/galeria" />
        <meta property="og:image" content="https://comitivas.permupay.com.br/images/logo-compartilhamento.webp" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Galeria | Excursão das Comitivas" />
        <meta name="twitter:description" content="Conheça a experiência da nossa comitiva em Barretos." />
        <meta name="twitter:image" content="https://comitivas.permupay.com.br/images/logo-compartilhamento.webp" />
      </Helmet>

      <section className="relative isolate overflow-hidden bg-secondary px-4 py-24 text-center">
        <img src="/images/gallery/festa-multidao.webp" alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/70 to-secondary/95" />
        <Camera className="mx-auto text-[#ff9fa6]" size={34} />
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.2em] text-[#ff9fa6]">Memórias reais</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-black tracking-tight text-white md:text-6xl">Uma prévia da energia que espera por você</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-200">Os registros cadastrados pelo time aparecem primeiro. Enquanto uma edição ainda não tem álbum próprio, mostramos imagens editoriais reais de Barretos.</p>
      </section>

      <main className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Carregando galeria">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-2xl bg-slate-200" />)}
          </div>
        ) : (
          <>
            {erro && eventos.length === 0 && (
              <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{erro} As imagens editoriais continuam disponíveis abaixo.</p>
            )}
            <div className="grid auto-rows-[220px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fotos.map((foto, index) => (
                <button
                  key={foto.id || `${foto.src}-${index}`}
                  type="button"
                  onClick={() => setSelecionada(foto)}
                  className={`group relative overflow-hidden rounded-2xl bg-slate-200 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${index === 0 ? 'sm:row-span-2 sm:auto-rows-auto' : ''}`}
                  aria-label={`Ampliar: ${foto.alt}`}
                >
                  <img src={foto.src} alt={foto.alt} loading={index > 2 ? 'lazy' : 'eager'} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <span className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                  <span className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <span className="block text-xs font-bold uppercase tracking-[0.16em] text-[#ffb3b8]">{foto.evento}</span>
                    <span className="mt-1 block font-semibold">{foto.legenda || foto.alt}</span>
                  </span>
                  <span className="absolute right-4 top-4 rounded-full bg-black/35 p-2 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100"><ImageIcon size={17} /></span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      <section className="mx-auto mt-20 max-w-4xl px-4 text-center">
        <div className="rounded-3xl border border-primary/20 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-12">
          <h2 className="text-3xl font-black text-secondary">Pronto para aparecer no próximo álbum?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">Consulte as modalidades disponíveis ou fale com a equipe para escolher a experiência ideal.</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/eventos"><Button size="lg">Ver excursões <ArrowRight size={18} className="ml-2" /></Button></Link>
            <WhatsAppCTA mensagem={MENSAGEM_WHATSAPP} label="Falar no WhatsApp" size="lg" />
          </div>
        </div>
      </section>

      {selecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Visualização ampliada: ${selecionada.alt}`} onMouseDown={() => setSelecionada(null)}>
          <div className="relative max-h-full max-w-6xl" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setSelecionada(null)} className="absolute -right-2 -top-12 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"><X size={20} /> Fechar</button>
            <img src={selecionada.src} alt={selecionada.alt} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl" />
            <p className="mt-3 text-center text-sm font-semibold text-white">{selecionada.legenda || selecionada.alt}</p>
          </div>
        </div>
      )}
    </div>
  );
}
