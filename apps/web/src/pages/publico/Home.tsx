import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../../contexts/AuthContext';
import { Button, WhatsAppCTA } from '@ui/index';
import {
  ArrowRight,
  Bed,
  Bus,
  Calendar,
  Check,
  ChevronRight,
  Coffee,
  Image as ImageIcon,
  MapPin,
  Music2,
  ShieldCheck,
  Star,
  Tent,
  UtensilsCrossed,
  Users,
  Volume2,
  Waves,
  Wine,
  X,
} from 'lucide-react';

const ITENS_INCLUSOS = [
  { texto: 'Café da manhã', Icone: Coffee },
  { texto: 'Almoço', Icone: UtensilsCrossed },
  { texto: '10h de open bar na chácara', Icone: Wine },
  { texto: 'Barman fazendo drinks', Icone: Wine },
  { texto: 'DJ durante o dia', Icone: Music2 },
  { texto: 'Som automotivo', Icone: Volume2 },
  { texto: 'Piscina liberada', Icone: Waves },
  { texto: 'Translado chácara ⇄ Parque do Peão', Icone: Bus },
  { texto: 'Ida e volta Brasília ⇄ Barretos (embarque em Goiânia)', Icone: Bus },
];

const PACOTES_HOSPEDAGEM = [
  {
    id: 'camping',
    titulo: 'Camping',
    Icone: Tent,
    destaque: 'A energia coletiva da comitiva',
    bullets: [
      'Área totalmente gramada',
      'Banheiros externos',
      'Pontos de energia',
      'Segurança',
      'Cliente leva o próprio material',
    ],
    mensagemWhatsApp: 'Olá! Quero saber mais sobre o pacote Camping da Excursão das Comitivas.',
  },
  {
    id: 'quarto_ventilador',
    titulo: 'Quarto com ventilador',
    Icone: Bed,
    destaque: 'Conforto essencial para descansar',
    bullets: [
      'Quartos suítes para 5 a 6 pessoas',
      'Ventilador',
      'Separado por feminino ou masculino',
      'Não há quartos mistos',
    ],
    mensagemWhatsApp: 'Olá! Quero saber mais sobre o pacote com Quarto com Ventilador da Excursão das Comitivas.',
  },
  {
    id: 'quarto_ar_condicionado',
    titulo: 'Quarto com ar-condicionado',
    Icone: Bed,
    destaque: 'A experiência com máximo conforto',
    bullets: [
      'Quartos suítes para 5 a 6 pessoas',
      'Ar-condicionado',
      'Separado por feminino ou masculino',
      'Não há quartos mistos',
    ],
    mensagemWhatsApp: 'Olá! Quero saber mais sobre o pacote com Quarto com Ar-condicionado da Excursão das Comitivas.',
  },
];

const MENSAGEM_WHATSAPP_PADRAO = 'Olá! Quero saber mais sobre os pacotes da Excursão das Comitivas para Barretos.';

const GALERIA_BARRETOS = [
  {
    src: '/images/hero-parque-peao.jpg',
    alt: 'Vista do Parque do Peão com a estátua de Barretos em primeiro plano',
    legenda: 'Parque do Peão, Barretos',
  },
  {
    src: '/images/gallery/barretos-vista.jpg',
    alt: 'Vista panorâmica de Barretos durante a festa',
    legenda: 'A energia de Barretos',
  },
  {
    src: '/images/gallery/estatua-peao.jpg',
    alt: 'Estátua do Peão, símbolo de Barretos',
    legenda: 'Símbolo do Peão',
  },
  {
    src: '/images/gallery/festa-multidao.webp',
    alt: 'Arena do Parque do Peão com o público reunido',
    legenda: 'Arena em noite de festa',
  },
];

function formatarData(valor?: string | null) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(data);
}

export default function Home() {
  const [eventoAtivo, setEventoAtivo] = useState<any>(null);
  const [avaliacoes, setAvaliacoes] = useState<any[]>([]);
  const [stats, setStats] = useState<{ clientes: number | null; edicoes: number | null; nota: number | null }>({
    clientes: null,
    edicoes: null,
    nota: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [imagemSelecionada, setImagemSelecionada] = useState<typeof GALERIA_BARRETOS[number] | null>(null);

  useEffect(() => {
    const carregarDadosPublicos = async () => {
      const [eventosResultado, avaliacoesResultado, statsResultado] = await Promise.allSettled([
        api.get('/publico/eventos-ativos'),
        api.get('/publico/avaliacoes'),
        api.get('/publico/stats'),
      ]);

      if (eventosResultado.status === 'fulfilled') {
        const eventos = eventosResultado.value.data.eventos || [];
        setEventoAtivo(eventos[0] || null);
      }

      if (avaliacoesResultado.status === 'fulfilled') {
        setAvaliacoes((avaliacoesResultado.value.data.avaliacoes || []).slice(0, 3));
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

    carregarDadosPublicos();
  }, []);

  useEffect(() => {
    if (!imagemSelecionada) return undefined;

    const fecharComEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImagemSelecionada(null);
    };

    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', fecharComEsc);

    return () => {
      document.body.style.overflow = overflowOriginal;
      window.removeEventListener('keydown', fecharComEsc);
    };
  }, [imagemSelecionada]);

  const dataEvento = eventoAtivo ? `${formatarData(eventoAtivo.data_inicio)} a ${formatarData(eventoAtivo.data_fim)}` : null;
  const exibirNumero = (valor: number | null, sufixo = '') => valor === null ? '—' : `${valor.toLocaleString('pt-BR')}${sufixo}`;

  return (
    <div className="min-h-screen bg-[#fffdf9] text-slate-900">
      <Helmet>
        <title>Excursão das Comitivas | Pacotes para Barretos</title>
        <meta name="description" content="Conheça os pacotes da Excursão das Comitivas para Barretos: escolha sua hospedagem, faça sua reserva online e viaje com tranquilidade." />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://comitivas.permupay.com.br/" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="Excursão das Comitivas" />
        <meta property="og:title" content="Excursão das Comitivas | Pacotes para Barretos" />
        <meta property="og:description" content="Pacotes para Barretos com hospedagem escolhida por você e reserva digital." />
        <meta property="og:url" content="https://comitivas.permupay.com.br/" />
        <meta property="og:image" content="https://comitivas.permupay.com.br/images/hero-parque-peao.jpg" />
        <meta property="og:image:alt" content="Parque do Peão em Barretos" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Excursão das Comitivas | Barretos" />
        <meta name="twitter:description" content="Pacotes para Barretos com reserva online e modalidades de hospedagem." />
        <meta name="twitter:image" content="https://comitivas.permupay.com.br/images/hero-parque-peao.jpg" />
      </Helmet>

      <section className="relative isolate min-h-[760px] overflow-hidden bg-secondary">
        <img
          src="/images/hero-parque-peao.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/65 to-[#3f0b0b]/85" />
        <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-24 left-0 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="relative mx-auto flex min-h-[760px] max-w-7xl items-center px-4 py-28 sm:px-6 lg:px-8">
          <div className="grid w-full items-end gap-10 lg:grid-cols-[1fr_320px]">
            <div className="max-w-4xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold tracking-[0.16em] text-white backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_16px_rgba(230,57,70,1)]" />
                EXCURSÃO DAS COMITIVAS
              </div>
              <h1 className="max-w-4xl text-5xl font-black leading-[0.96] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Barretos é mais do que destino. <span className="text-[#ff7a83]">É história para viver.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-100 sm:text-xl">
                Monte seu pacote, escolha a modalidade de hospedagem e registre sua reserva com uma experiência digital simples, clara e segura.
              </p>

              {eventoAtivo && (
                <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/90">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/15 px-4 py-2 backdrop-blur-sm"><MapPin size={16} className="text-[#ff7a83]" />{eventoAtivo.local}</span>
                  {dataEvento && <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/15 px-4 py-2 backdrop-blur-sm"><Calendar size={16} className="text-[#ff7a83]" />{dataEvento}</span>}
                </div>
              )}

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link to="/eventos">
                  <Button size="lg" className="group w-full px-8 py-6 text-base shadow-xl shadow-black/25 sm:w-auto">
                    Ver pacotes disponíveis <ArrowRight size={18} className="ml-2 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <a href="#galeria" className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/35 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10 sm:w-auto">
                  <ImageIcon size={18} /> Conhecer Barretos
                </a>
              </div>
              <WhatsAppCTA
                mensagem={MENSAGEM_WHATSAPP_PADRAO}
                label="Prefere falar direto? Chame no WhatsApp"
                variant="outline"
                size="sm"
                className="mt-4 !border-white/40 !text-white hover:!bg-white/10"
              />
            </div>

            <aside className="rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-2xl backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ffb0b5]">Reserva digital</p>
              <h2 className="mt-3 text-2xl font-bold">Você escolhe como quer viver a viagem.</h2>
              <ul className="mt-5 space-y-4 text-sm text-slate-100">
                <li className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[#ff9fa6]">1</span><span>Escolha a excursão e a hospedagem.</span></li>
                <li className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[#ff9fa6]">2</span><span>Preencha seus dados contratuais.</span></li>
                <li className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[#ff9fa6]">3</span><span>Receba seu contrato digital com as escolhas registradas.</span></li>
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-slate-200 px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-8">
          <div className="py-8 text-center"><div className="text-3xl font-black text-secondary">{exibirNumero(stats.edicoes)}</div><div className="mt-1 text-sm font-medium text-slate-500">Excursões concluídas</div></div>
          <div className="py-8 text-center"><div className="text-3xl font-black text-secondary">{exibirNumero(stats.clientes)}</div><div className="mt-1 text-sm font-medium text-slate-500">Clientes confirmados</div></div>
          <div className="py-8 text-center"><div className="flex items-center justify-center gap-1 text-3xl font-black text-secondary">{stats.nota === null ? '—' : <>{stats.nota.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<Star size={24} className="fill-primary text-primary" /></>}</div><div className="mt-1 text-sm font-medium text-slate-500">Média de avaliações aprovadas</div></div>
        </div>
      </section>

      <section id="inclusos" className="scroll-mt-20 bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Tudo isso e muito mais</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-secondary sm:text-4xl">O que está incluso no seu pacote</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">Você só precisa chegar e curtir. A gente cuida do resto — da chegada na chácara até a volta pra casa.</p>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
            {ITENS_INCLUSOS.map(({ texto, Icone }) => (
              <div key={texto} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-[#fffaf5] p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone size={20} /></div>
                <span className="text-sm font-semibold text-slate-800">{texto}</span>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <h3 className="text-lg font-bold text-secondary">Quer saber os valores e as condições de pagamento?</h3>
              <p className="mt-1 text-sm text-slate-600">Fale agora com a nossa equipe pelo WhatsApp e garanta sua vaga.</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <WhatsAppCTA mensagem={MENSAGEM_WHATSAPP_PADRAO} label="Falar no WhatsApp" size="md" />
              <Link to="/eventos">
                <Button variant="outline" className="h-11">Ver pacotes disponíveis</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fffaf5] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Do seu jeito</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-secondary sm:text-4xl">Uma experiência organizada desde a primeira escolha</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">Cada pacote publicado pela equipe informa preço, modalidade de hospedagem e itens selecionáveis. Você visualiza tudo antes de contratar.</p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { titulo: 'Transporte planejado', texto: 'Informações da viagem apresentadas junto ao lote contratado.', Icone: Bus },
              { titulo: 'Hospedagem escolhida', texto: 'Camping, quarto com ventilador ou quarto com ar-condicionado.', Icone: Bed },
              { titulo: 'Reserva transparente', texto: 'Valores, descontos e condição de pagamento registrados no contrato.', Icone: ShieldCheck },
              { titulo: 'Equipe de comitiva', texto: 'Uma viagem feita por quem conhece a cultura de Barretos.', Icone: Users },
            ].map(({ titulo, texto, Icone }) => (
              <article key={titulo} className="group rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icone size={24} /></div>
                <h3 className="mt-6 text-xl font-bold text-secondary">{titulo}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="galeria" className="scroll-mt-20 bg-secondary py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl"><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#ff9fa6]">Visualmente inesquecível</p><h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Um gostinho do que espera por você em Barretos</h2><p className="mt-4 text-sm text-slate-300">Raízes de quase 18 anos de estrada — a equipe atual da Excursão das Comitivas segue firme desde 2015.</p></div>
            <Link to="/historia" className="inline-flex items-center gap-2 text-sm font-bold text-white transition hover:text-[#ffb0b5]">Ver histórico de excursões <ChevronRight size={18} /></Link>
          </div>

          <div className="mt-12 grid auto-rows-[190px] grid-cols-2 gap-3 sm:auto-rows-[240px] lg:grid-cols-4">
            {GALERIA_BARRETOS.map((foto, index) => (
              <button
                key={foto.src}
                type="button"
                onClick={() => setImagemSelecionada(foto)}
                className={`group relative overflow-hidden rounded-2xl text-left ring-offset-secondary transition focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 ${index === 0 ? 'col-span-2 row-span-2' : ''}`}
                aria-label={`Ampliar foto: ${foto.legenda}`}
              >
                <img src={foto.src} alt={foto.alt} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-80" />
                <span className="absolute bottom-0 left-0 p-4 text-sm font-bold text-white">{foto.legenda}</span>
                <span className="absolute right-3 top-3 rounded-full bg-white/15 p-2 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100"><ImageIcon size={16} /></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {avaliacoes.length > 0 && (
        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Avaliações aprovadas</p><h2 className="mt-3 text-3xl font-black text-secondary sm:text-4xl">A experiência de quem já viajou</h2></div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {avaliacoes.map((avaliacao) => (
                <article key={avaliacao.id} className="rounded-2xl border border-slate-200 bg-[#fffdf9] p-7 shadow-sm">
                  <div className="flex gap-1 text-primary">{Array.from({ length: Math.max(0, Math.min(5, Number(avaliacao.nota) || 0)) }, (_, indice) => <Star key={indice} size={17} className="fill-current" />)}</div>
                  <blockquote className="mt-5 text-base leading-relaxed text-slate-700">“{avaliacao.comentario || 'Avaliação registrada por cliente participante.'}”</blockquote>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Avaliação aprovada</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="hospedagem" className="scroll-mt-20 bg-[#fffaf5] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Conforto e organização</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-secondary sm:text-4xl">Nossos pacotes</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">Três formas de viver a mesma experiência. Escolha a modalidade de hospedagem que combina com você — valores e parcelamento sob consulta.</p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {PACOTES_HOSPEDAGEM.map(({ id, titulo, Icone, destaque, bullets, mensagemWhatsApp }) => (
              <article key={id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center self-start rounded-xl bg-primary/10 text-primary"><Icone size={24} /></div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">{destaque}</p>
                <h3 className="mt-1 text-xl font-bold text-secondary">{titulo}</h3>
                <ul className="mt-4 flex-1 space-y-2">
                  {bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Valores e parcelamento sob consulta</p>
                <div className="mt-3 flex flex-col gap-2">
                  <WhatsAppCTA mensagem={mensagemWhatsApp} label="Falar no WhatsApp" size="sm" className="w-full" />
                  <Link to="/eventos" className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-slate-300 text-xs font-bold text-slate-700 transition hover:border-primary hover:text-primary">
                    Ver disponibilidade <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#540c16] py-24">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Tent className="mx-auto text-[#ff9fa6]" size={34} />
          <h2 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl">Sua próxima história pode começar aqui.</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-200">Confira as excursões publicadas, veja os detalhes de cada pacote e as facilidades de pagamento: PIX com 5% de desconto, Boleto em até 2x sem juros ou Cartão em até 12x.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/eventos"><Button size="lg" className="px-9 py-6 text-base shadow-xl shadow-black/25">Ver pacotes disponíveis <ArrowRight size={18} className="ml-2" /></Button></Link>
            <WhatsAppCTA mensagem={MENSAGEM_WHATSAPP_PADRAO} label="Falar no WhatsApp" size="lg" />
          </div>
        </div>
      </section>

      {imagemSelecionada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Visualização ampliada: ${imagemSelecionada.legenda}`}
          onMouseDown={() => setImagemSelecionada(null)}
        >
          <div className="relative max-h-full max-w-6xl" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setImagemSelecionada(null)} className="absolute -right-2 -top-12 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white" aria-label="Fechar imagem ampliada"><X size={20} /> Fechar</button>
            <img src={imagemSelecionada.src} alt={imagemSelecionada.alt} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl" />
            <p className="mt-3 text-center text-sm font-semibold text-white">{imagemSelecionada.legenda}</p>
          </div>
        </div>
      )}

      {!isLoading && !eventoAtivo && <span className="sr-only">Nenhuma excursão ativa foi retornada pela API neste momento.</span>}
    </div>
  );
}
