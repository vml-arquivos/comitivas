import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../contexts/AuthContext';
import { WhatsAppCTA } from '@ui/index';
import LeadCapture from '../../components/LeadCapture';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Calendar,
  Check,
  ChevronRight,
  CircleDollarSign,
  Image as ImageIcon,
  MapPin,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react';

type Modalidade = {
  id: string;
  nome: string;
  descricao?: string | null;
  modalidade_hospedagem?: string | null;
  disponibilidade?: 'disponivel' | 'ultimas_vagas' | 'esgotado' | string | null;
  valor_total?: string | number | null;
  itens_inclusos?: unknown;
};

type Lote = {
  id: string;
  nome: string;
  descricao?: string | null;
  vagas_totais?: number;
  vagas_disponiveis?: number;
  data_inicio: string;
  data_fim: string;
  modalidades: Modalidade[];
};

type Evento = {
  id: string;
  nome: string;
  descricao?: string | null;
  local: string;
  data_inicio: string;
  data_fim: string;
  lotes: Lote[];
};

type Oferta = {
  evento: Evento;
  lote: Lote;
  pacote: Modalidade;
};

const MENSAGEM_WHATSAPP_PADRAO = 'Olá! Quero saber mais sobre os pacotes publicados da Excursão das Comitivas para Barretos.';

const SCHEMA_ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Excursão das Comitivas',
  url: 'https://excursaodascomitivas.com.br/',
  logo: 'https://excursaodascomitivas.com.br/images/logo-compartilhamento.webp',
  image: 'https://excursaodascomitivas.com.br/images/hero-parque-peao.jpg',
  description: 'Excursões e pacotes para Barretos com consulta de oferta, reserva digital e atendimento da equipe.',
  foundingDate: '2015',
  email: 'excursaodascomitivas@gmail.com',
  sameAs: ['https://instagram.com/excurssaodascomitivas'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'sales',
    telephone: '+55-61-99445-9086',
    availableLanguage: 'Portuguese',
  },
};

const GALERIA_BARRETOS = [
  {
    src: '/images/hero-parque-peao.jpg',
    alt: 'Vista do Parque do Peão com a estátua de Barretos em primeiro plano',
    legenda: 'Parque do Peão, Barretos',
    width: 1280,
    height: 853,
  },
  {
    src: '/images/gallery/barretos-vista.jpg',
    alt: 'Vista panorâmica de Barretos durante a festa',
    legenda: 'A energia de Barretos',
    width: 1200,
    height: 800,
  },
  {
    src: '/images/gallery/estatua-peao.jpg',
    alt: 'Estátua do Peão, símbolo de Barretos',
    legenda: 'Símbolo do Peão',
    width: 1200,
    height: 800,
  },
  {
    src: '/images/gallery/festa-multidao.webp',
    alt: 'Arena do Parque do Peão com o público reunido',
    legenda: 'Arena em noite de festa',
    width: 1200,
    height: 800,
  },
];

const ETAPAS = [
  {
    titulo: 'Compare a oferta publicada',
    texto: 'Veja excursão, lote, pacote, datas, disponibilidade e preço retornados pelo sistema.',
    Icone: BedDouble,
  },
  {
    titulo: 'Personalize com segurança',
    texto: 'Abra o configurador do lote e confirme a modalidade e os adicionais disponíveis para aquela venda.',
    Icone: Sparkles,
  },
  {
    titulo: 'Finalize com tudo registrado',
    texto: 'Preço, condição escolhida e conteúdo contratual são consolidados no fluxo antes do pagamento.',
    Icone: ShieldCheck,
  },
];

function formatarData(valor?: string | null, formatoCurto = false) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', formatoCurto
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(data);
}

function formatarMoeda(valor?: string | number | null) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function normalizarItens(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const registro = item as Record<string, unknown>;
      return String(registro.nome || registro.label || registro.descricao || '').trim();
    })
    .filter(Boolean)
    .slice(0, 3);
}

function statusOferta(disponibilidade?: string | null) {
  if (disponibilidade === 'esgotado') return { label: 'Esgotado', classe: 'bg-slate-900 text-white' };
  if (disponibilidade === 'ultimas_vagas') return { label: 'Últimas vagas', classe: 'bg-amber-100 text-amber-900' };
  return { label: 'Disponível', classe: 'bg-emerald-100 text-emerald-900' };
}

export default function Home() {
  const [searchParams] = useSearchParams();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [videoAtivo, setVideoAtivo] = useState<string | null>(null);
  const [stats, setStats] = useState<{ clientes: number | null; edicoes: number | null; nota: number | null }>({
    clientes: null,
    edicoes: null,
    nota: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [erroOfertas, setErroOfertas] = useState('');
  const [indiceOferta, setIndiceOferta] = useState(0);
  const [imagemSelecionada, setImagemSelecionada] = useState<typeof GALERIA_BARRETOS[number] | null>(null);
  const fecharModalRef = useRef<HTMLButtonElement>(null);
  const ultimoFocoRef = useRef<HTMLElement | null>(null);

  const refComercial = searchParams.get('ref');

  const ofertas = useMemo<Oferta[]>(() => eventos.flatMap((evento) =>
    (evento.lotes || []).flatMap((lote) =>
      (lote.modalidades || []).map((pacote) => ({ evento, lote, pacote })))), [eventos]);

  const ofertaAtiva = ofertas.length > 0 ? ofertas[Math.min(indiceOferta, ofertas.length - 1)] : null;

  const linkEventos = useMemo(() => {
    if (!refComercial) return '/eventos';
    return `/eventos?ref=${encodeURIComponent(refComercial)}`;
  }, [refComercial]);

  const linkPacote = (oferta: Oferta) => {
    const params = new URLSearchParams();
    params.set('pacote', oferta.pacote.id);
    if (refComercial) params.set('ref', refComercial);
    return `/pacote/${encodeURIComponent(oferta.lote.id)}?${params.toString()}`;
  };

  useEffect(() => {
    const carregarDadosPublicos = async () => {
      const [ofertasResultado, avaliacoesResultado, statsResultado, videosResultado] = await Promise.allSettled([
        api.get('/publico/ofertas'),
        api.get('/publico/avaliacoes'),
        api.get('/publico/stats'),
        api.get('/publico/videos'),
      ]);

      if (ofertasResultado.status === 'fulfilled') {
        setEventos(ofertasResultado.value.data.eventos || []);
        setErroOfertas('');
      } else {
        setErroOfertas('Não foi possível consultar as excursões publicadas agora.');
      }

      if (avaliacoesResultado.status === 'fulfilled') {
        setAvaliacoes((avaliacoesResultado.value.data.avaliacoes || [])
          .filter((avaliacao: any) => Boolean(avaliacao.comentario?.trim()))
          .slice(0, 3));
      }

      if (videosResultado.status === 'fulfilled') {
        setVideos((videosResultado.value.data.videos || []).filter((video: any) => video.youtube_id).slice(0, 3));
      }

      if (statsResultado.status === 'fulfilled') {
        const dados = statsResultado.value.data;
        setStats({
          clientes: typeof dados.clientesConfirmados === 'number' ? dados.clientesConfirmados : null,
          edicoes: typeof dados.excursoesRealizadas === 'number' ? dados.excursoesRealizadas : null,
          nota: typeof dados.notaMedia === 'number' ? dados.notaMedia : null,
        });
      }

      setIsLoading(false);
    };

    void carregarDadosPublicos();
  }, []);

  useEffect(() => {
    if (indiceOferta >= ofertas.length && ofertas.length > 0) setIndiceOferta(0);
  }, [indiceOferta, ofertas.length]);

  useEffect(() => {
    if (!imagemSelecionada) return undefined;

    const fechar = () => setImagemSelecionada(null);
    const tratarTeclado = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        fechar();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        fecharModalRef.current?.focus();
      }
    };

    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', tratarTeclado);
    window.requestAnimationFrame(() => fecharModalRef.current?.focus());

    return () => {
      document.body.style.overflow = overflowOriginal;
      window.removeEventListener('keydown', tratarTeclado);
      window.requestAnimationFrame(() => ultimoFocoRef.current?.focus());
    };
  }, [imagemSelecionada]);

  const abrirImagem = (foto: typeof GALERIA_BARRETOS[number], gatilho: HTMLElement) => {
    ultimoFocoRef.current = gatilho;
    setImagemSelecionada(foto);
  };

  const moverOferta = (delta: number) => {
    if (ofertas.length <= 1) return;
    setIndiceOferta((atual) => (atual + delta + ofertas.length) % ofertas.length);
  };

  const exibirNumero = (valor: number | null, sufixo = '') => valor === null ? '—' : `${valor.toLocaleString('pt-BR')}${sufixo}`;
  const statusAtivo = statusOferta(ofertaAtiva?.pacote.disponibilidade);
  const itensAtivos = normalizarItens(ofertaAtiva?.pacote.itens_inclusos);

  return (
    <div className="min-h-screen bg-[#F8F5EF] text-[#182D3B]">
      <Helmet>
        <title>Excursão para Barretos | Excursão das Comitivas</title>
        <meta name="description" content="Compare excursões e pacotes publicados para Barretos, consulte preço e disponibilidade e continue para a reserva digital da Excursão das Comitivas." />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://excursaodascomitivas.com.br/" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="Excursão das Comitivas" />
        <meta property="og:title" content="Excursão das Comitivas | Pacotes para Barretos" />
        <meta property="og:description" content="Veja excursões e pacotes publicados, consulte disponibilidade e escolha sua experiência em Barretos." />
        <meta property="og:url" content="https://excursaodascomitivas.com.br/" />
        <meta property="og:image" content="https://excursaodascomitivas.com.br/images/logo-compartilhamento.webp" />
        <meta property="og:image:alt" content="Excursão das Comitivas" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Excursão das Comitivas | Barretos" />
        <meta name="twitter:description" content="Consulte excursões, pacotes e disponibilidade para Barretos." />
        <meta name="twitter:image" content="https://excursaodascomitivas.com.br/images/logo-compartilhamento.webp" />
        <script type="application/ld+json">{JSON.stringify(SCHEMA_ORGANIZATION)}</script>
      </Helmet>

      <section className="relative overflow-hidden border-b border-[#182D3B]/10 bg-[#F8F5EF]">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#851F32]/5 blur-3xl" />
        <div className="mx-auto grid min-h-[680px] max-w-[1380px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:px-12 lg:py-20 xl:gap-20">
          <div className="relative z-10 max-w-2xl">
            <p className="mb-6 inline-flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.24em] text-[#851F32]">
              <span className="h-px w-9 bg-[#851F32]" /> Desde 2015 em Barretos
            </p>
            <h1 className="font-editorial text-[clamp(3.4rem,7vw,7rem)] leading-[0.88] tracking-[-0.045em] text-[#182D3B]">
              O destino é Barretos. <span className="text-[#851F32]">A história é sua.</span>
            </h1>
            <p className="mt-8 max-w-xl text-base leading-7 text-[#425563] sm:text-lg sm:leading-8">
              Encontre a excursão publicada, compare os pacotes e avance para a contratação sem perder a referência da sua escolha.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#hospedagem"
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[#851F32] px-7 py-3.5 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(133,31,50,0.18)] transition hover:bg-[#6f1929] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#851F32] focus-visible:ring-offset-4"
              >
                Encontrar meu pacote <ArrowRight size={17} />
              </a>
              <Link to={linkEventos} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-[#182D3B]/20 px-7 py-3.5 text-sm font-bold text-[#182D3B] transition hover:border-[#851F32]/40 hover:bg-white">
                Ver todas as excursões
              </Link>
            </div>
            <p className="mt-5 text-xs leading-5 text-[#687882]">Preço e disponibilidade exibidos nesta página são os dados retornados pela oferta publicada no sistema.</p>
          </div>

          <div className="relative mx-auto w-full max-w-[720px] pb-12 lg:pb-16">
            <div className="relative aspect-[1.14/1] overflow-hidden rounded-[2rem] bg-[#182D3B] shadow-[0_30px_80px_rgba(24,45,59,0.18)] sm:rounded-[2.5rem]">
              <img
                src="/images/hero-parque-peao.jpg"
                alt="Parque do Peão em Barretos"
                className="h-full w-full object-cover object-center"
                width="1280"
                height="853"
                fetchPriority="high"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#182D3B]/55 via-transparent to-transparent" />
              <div className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-[#182D3B] shadow-lg backdrop-blur sm:bottom-7 sm:left-7">
                <MapPin size={15} className="text-[#851F32]" /> Barretos, São Paulo
              </div>
            </div>

            <aside className="relative -mt-10 ml-auto mr-3 w-[min(92%,430px)] rounded-[1.5rem] border border-[#182D3B]/10 bg-white p-5 shadow-[0_24px_55px_rgba(24,45,59,0.18)] sm:-mt-16 sm:mr-7 sm:p-6" aria-live="polite">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#851F32]">Sua próxima viagem</p>
                  <h2 className="font-editorial mt-2 text-2xl leading-tight text-[#182D3B]">
                    {ofertaAtiva ? ofertaAtiva.evento.nome : 'Vamos encontrar sua excursão?'}
                  </h2>
                </div>
                {ofertaAtiva && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusAtivo.classe}`}>{statusAtivo.label}</span>}
              </div>

              {isLoading ? (
                <div className="mt-5 space-y-3" aria-label="Carregando oferta"><div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" /><div className="h-8 w-1/2 animate-pulse rounded bg-slate-100" /><div className="h-11 w-full animate-pulse rounded-full bg-slate-100" /></div>
              ) : ofertaAtiva ? (
                <>
                  <p className="mt-3 text-sm font-bold text-[#334A58]">{ofertaAtiva.pacote.nome}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[#182D3B]/10 py-4 text-xs text-[#60717B]">
                    <span className="inline-flex items-center gap-1.5"><Calendar size={14} className="text-[#851F32]" />{formatarData(ofertaAtiva.lote.data_inicio, true)} a {formatarData(ofertaAtiva.lote.data_fim, true)}</span>
                    <span className="text-right font-extrabold text-[#182D3B]">{formatarMoeda(ofertaAtiva.pacote.valor_total) || 'Valor no configurador'}</span>
                  </div>
                  {itensAtivos.length > 0 && <p className="mt-4 line-clamp-2 text-xs leading-5 text-[#687882]">{itensAtivos.join(' · ')}</p>}
                  <Link to={linkPacote(ofertaAtiva)} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#851F32] px-5 text-sm font-extrabold text-white transition hover:bg-[#6f1929]">
                    Quero este pacote <ArrowRight size={16} />
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-6 text-[#687882]">{erroOfertas || 'Nenhuma excursão futura foi retornada pela vitrine neste momento.'}</p>
                  <Link to={linkEventos} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#851F32]/25 text-sm font-extrabold text-[#851F32] transition hover:bg-[#851F32]/5">
                    Consultar excursões <ArrowRight size={16} />
                  </Link>
                </>
              )}

              {ofertas.length > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-[#182D3B]/10 pt-4">
                  <span className="text-[11px] font-semibold text-[#687882]">{indiceOferta + 1} de {ofertas.length}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => moverOferta(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#182D3B]/15 text-[#182D3B] transition hover:border-[#851F32]/40 hover:text-[#851F32]" aria-label="Oferta anterior"><ArrowLeft size={16} /></button>
                    <button type="button" onClick={() => moverOferta(1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#182D3B]/15 text-[#182D3B] transition hover:border-[#851F32]/40 hover:text-[#851F32]" aria-label="Próxima oferta"><ArrowRight size={16} /></button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>

      <section className="border-b border-[#182D3B]/10 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-[#182D3B]/10 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8">
          <div className="py-7 text-center"><div className="font-editorial text-3xl text-[#182D3B]">{exibirNumero(stats.edicoes)}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#7A878F]">Excursões concluídas</div></div>
          <div className="py-7 text-center"><div className="font-editorial text-3xl text-[#182D3B]">{exibirNumero(stats.clientes)}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#7A878F]">Clientes confirmados</div></div>
          <div className="py-7 text-center"><div className="flex items-center justify-center gap-1 font-editorial text-3xl text-[#182D3B]">{stats.nota === null ? '—' : <>{stats.nota.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<Star size={20} className="fill-[#851F32] text-[#851F32]" /></>}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#7A878F]">Média aprovada</div></div>
        </div>
      </section>

      <section id="hospedagem" className="scroll-mt-28 bg-[#F8F5EF] py-20 sm:py-24">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10">
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#851F32]">Oferta publicada</p>
              <h2 className="font-editorial mt-3 text-4xl leading-tight text-[#182D3B] sm:text-5xl">Escolha com clareza antes de contratar.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5C6F79] sm:text-base">Os cards abaixo usam a vitrine pública do próprio sistema. Sem pacote publicado, não exibimos preço ou disponibilidade fictícios.</p>
            </div>
            <Link to={linkEventos} className="inline-flex items-center gap-2 text-sm font-extrabold text-[#851F32] hover:text-[#6f1929]">Ver todos os pacotes <ArrowRight size={16} /></Link>
          </div>

          {isLoading && (
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Carregando pacotes">
              {[1, 2, 3].map((item) => <div key={item} className="h-72 animate-pulse rounded-[1.5rem] bg-white" />)}
            </div>
          )}

          {!isLoading && ofertas.length === 0 && (
            <div className="mt-10 rounded-[1.75rem] border border-dashed border-[#182D3B]/20 bg-white p-9 text-center">
              <Calendar className="mx-auto text-[#851F32]" size={30} />
              <h3 className="font-editorial mt-4 text-2xl text-[#182D3B]">Novas datas serão publicadas pela equipe.</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#667985]">{erroOfertas || 'Enquanto isso, você pode consultar o catálogo ou falar com a equipe para registrar seu interesse.'}</p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link to={linkEventos} className="inline-flex h-11 items-center rounded-full bg-[#851F32] px-6 text-sm font-bold text-white">Consultar excursões</Link><WhatsAppCTA mensagem={MENSAGEM_WHATSAPP_PADRAO} label="Falar com a equipe" size="sm" /></div>
            </div>
          )}

          {!isLoading && ofertas.length > 0 && (
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {ofertas.slice(0, 6).map((oferta) => {
                const status = statusOferta(oferta.pacote.disponibilidade);
                const itens = normalizarItens(oferta.pacote.itens_inclusos);
                return (
                  <article key={`${oferta.lote.id}-${oferta.pacote.id}`} className="group flex min-w-0 flex-col rounded-[1.5rem] border border-[#182D3B]/10 bg-white p-6 shadow-[0_12px_35px_rgba(24,45,59,0.06)] transition hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(24,45,59,0.1)]">
                    <div className="flex items-start justify-between gap-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#851F32]">{oferta.evento.nome}</p><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${status.classe}`}>{status.label}</span></div>
                    <h3 className="font-editorial mt-4 text-2xl leading-tight text-[#182D3B]">{oferta.pacote.nome}</h3>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#6B7C85]">{oferta.pacote.descricao || oferta.lote.descricao || 'Detalhes completos disponíveis no configurador.'}</p>
                    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-y border-[#182D3B]/10 py-4 text-xs text-[#60717B]"><span className="inline-flex items-center gap-1.5"><Calendar size={14} className="text-[#851F32]" />{formatarData(oferta.lote.data_inicio, true)} a {formatarData(oferta.lote.data_fim, true)}</span><span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-[#851F32]" />{oferta.evento.local}</span></div>
                    {itens.length > 0 && <ul className="mt-4 space-y-2">{itens.map((item) => <li key={item} className="flex items-start gap-2 text-xs leading-5 text-[#5F7079]"><Check size={14} className="mt-0.5 shrink-0 text-[#851F32]" />{item}</li>)}</ul>}
                    <div className="mt-auto pt-6"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#88949B]">Valor publicado</p><p className="font-editorial mt-1 text-2xl text-[#182D3B]">{formatarMoeda(oferta.pacote.valor_total) || 'Consultar'}</p><Link to={linkPacote(oferta)} className={`mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold transition ${oferta.pacote.disponibilidade === 'esgotado' ? 'pointer-events-none bg-slate-100 text-slate-400' : 'bg-[#851F32] text-white hover:bg-[#6f1929]'}`} aria-disabled={oferta.pacote.disponibilidade === 'esgotado'}>{oferta.pacote.disponibilidade === 'esgotado' ? 'Pacote esgotado' : 'Quero este pacote'}{oferta.pacote.disponibilidade !== 'esgotado' && <ArrowRight size={16} />}</Link></div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
          <div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#851F32]">Da escolha ao embarque</p><h2 className="font-editorial mt-3 text-4xl leading-tight text-[#182D3B] sm:text-5xl">Menos ruído. Mais segurança para decidir.</h2></div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {ETAPAS.map(({ titulo, texto, Icone }, index) => <article key={titulo} className="border-t border-[#182D3B]/15 pt-6"><div className="flex items-center justify-between"><span className="font-editorial text-2xl text-[#B9AFA6]">0{index + 1}</span><span className="grid h-10 w-10 place-items-center rounded-full bg-[#F8F5EF] text-[#851F32]"><Icone size={19} /></span></div><h3 className="font-editorial mt-6 text-2xl text-[#182D3B]">{titulo}</h3><p className="mt-3 text-sm leading-6 text-[#647680]">{texto}</p></article>)}
          </div>
        </div>
      </section>

      <section id="galeria" className="scroll-mt-28 bg-[#182D3B] py-20 sm:py-24">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#D8A0AA]">Barretos em imagens</p><h2 className="font-editorial mt-3 text-4xl leading-tight text-white sm:text-5xl">Uma prévia da atmosfera que move a comitiva.</h2><p className="mt-4 text-sm leading-6 text-white/65">Fotos da experiência e do destino ajudam a contar a história sem competir com a oferta principal.</p></div>
            <Link to="/historia" className="inline-flex items-center gap-2 text-sm font-bold text-white transition hover:text-[#D8A0AA]">Conhecer nossa história <ChevronRight size={18} /></Link>
          </div>

          <div className="mt-12 grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[230px] lg:grid-cols-4">
            {GALERIA_BARRETOS.map((foto, index) => (
              <button
                key={foto.src}
                type="button"
                onClick={(event) => abrirImagem(foto, event.currentTarget)}
                className={`group relative overflow-hidden rounded-[1.35rem] text-left ring-offset-[#182D3B] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 ${index === 0 ? 'col-span-2 row-span-2' : ''}`}
                aria-label={`Ampliar foto: ${foto.legenda}`}
              >
                <img src={foto.src} alt={foto.alt} width={foto.width} height={foto.height} loading={index === 0 ? 'eager' : 'lazy'} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
                <span className="absolute inset-0 bg-gradient-to-t from-[#0B151C]/75 via-transparent to-transparent" />
                <span className="absolute bottom-0 left-0 p-4 text-xs font-bold text-white sm:text-sm">{foto.legenda}</span>
                <span className="absolute right-3 top-3 rounded-full bg-white/15 p-2 text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><ImageIcon size={15} /></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {avaliacoes.length > 0 && (
        <section className="bg-[#F8F5EF] py-20 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#851F32]">Avaliações aprovadas</p><h2 className="font-editorial mt-3 text-4xl text-[#182D3B] sm:text-5xl">A experiência de quem já viajou.</h2></div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {avaliacoes.map((avaliacao) => (
                <article key={avaliacao.id} className="rounded-[1.35rem] border border-[#182D3B]/10 bg-white p-6 shadow-sm">
                  <div className="flex gap-1 text-[#851F32]">{Array.from({ length: Math.max(0, Math.min(5, Number(avaliacao.nota) || 0)) }, (_, indice) => <Star key={indice} size={15} className="fill-current" />)}</div>
                  <blockquote className="font-editorial mt-5 text-xl leading-8 text-[#2F4654]">“{avaliacao.comentario}”</blockquote>
                  <p className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-[#89949A]">Avaliação aprovada</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#851F32]">Histórias em movimento</p><h2 className="font-editorial mt-3 text-4xl leading-tight text-[#182D3B] sm:text-5xl">Veja a comitiva em cena.</h2><p className="mt-4 text-sm leading-6 text-[#647680]">O player só é carregado depois da sua ação, preservando o carregamento inicial da página.</p></div><PlayCircle className="hidden text-[#851F32] md:block" size={34} /></div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">{videos.map((video) => <article key={video.id || video.youtube_id} className="overflow-hidden rounded-[1.35rem] border border-[#182D3B]/10 bg-[#F8F5EF]"><div className="aspect-video bg-[#182D3B]">{videoAtivo === video.youtube_id ? <iframe title={video.titulo || 'Vídeo da Excursão das Comitivas'} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.youtube_id)}?rel=0&modestbranding=1`} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <button type="button" onClick={() => setVideoAtivo(video.youtube_id)} className="group relative h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#851F32]"><img src={`https://i.ytimg.com/vi/${encodeURIComponent(video.youtube_id)}/hqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" loading="lazy" width="480" height="360" /><span className="absolute inset-0 grid place-items-center"><span className="rounded-full bg-[#851F32] p-4 text-white shadow-xl"><PlayCircle size={26} /></span></span><span className="sr-only">Reproduzir vídeo</span></button>}</div><div className="p-5"><h3 className="font-editorial text-xl text-[#182D3B]">{video.titulo || 'História da comitiva'}</h3>{video.descricao && <p className="mt-2 text-sm leading-6 text-[#647680]">{video.descricao}</p>}</div></article>)}</div>
          </div>
        </section>
      )}

      <section id="atendimento" className="scroll-mt-28 bg-[#F8F5EF] py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <LeadCapture />
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#851F32] py-20 text-white sm:py-24">
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
          <CircleDollarSign className="mx-auto text-white/75" size={30} />
          <h2 className="font-editorial mt-6 text-4xl leading-tight sm:text-5xl">Sua próxima história pode começar pela escolha certa.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">Veja as ofertas publicadas e avance para o configurador. As condições comerciais aplicáveis são apresentadas no fluxo de contratação e registradas pelo sistema.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to={linkEventos} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-extrabold text-[#851F32] transition hover:bg-[#F8F5EF]">Ver pacotes disponíveis <ArrowRight size={16} /></Link>
            <WhatsAppCTA mensagem={MENSAGEM_WHATSAPP_PADRAO} label="Falar no WhatsApp" size="md" className="!bg-[#173F2D] hover:!bg-[#0f3324]" />
          </div>
        </div>
      </section>

      {imagemSelecionada && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0B151C]/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Visualização ampliada: ${imagemSelecionada.legenda}`}
          onMouseDown={() => setImagemSelecionada(null)}
        >
          <div className="relative max-h-full max-w-6xl" onMouseDown={(event) => event.stopPropagation()}>
            <button ref={fecharModalRef} type="button" onClick={() => setImagemSelecionada(null)} className="absolute -right-2 -top-12 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Fechar imagem ampliada"><X size={20} /> Fechar</button>
            <img src={imagemSelecionada.src} alt={imagemSelecionada.alt} width={imagemSelecionada.width} height={imagemSelecionada.height} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl" />
            <p className="mt-3 text-center text-sm font-semibold text-white">{imagemSelecionada.legenda}</p>
          </div>
        </div>
      )}

      {!isLoading && ofertas.length === 0 && <span className="sr-only">Nenhuma excursão futura foi retornada pela API pública de ofertas neste momento.</span>}
    </div>
  );
}
