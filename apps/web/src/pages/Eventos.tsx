import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertCircle, ArrowRight, BedDouble, Calendar, Check, Filter, MapPin, MessageCircle } from 'lucide-react';
import { Button, WhatsAppCTA } from '@ui/index';
import { api } from '../contexts/AuthContext';

type Modalidade = {
  id: string;
  nome: string;
  descricao?: string | null;
  modalidade_hospedagem?: string | null;
  disponibilidade?: 'disponivel' | 'ultimas_vagas' | 'esgotado' | string | null;
  valor_total: string | number;
  itens_inclusos?: unknown;
};

type Lote = {
  id: string;
  nome: string;
  descricao?: string | null;
  vagas_totais: number;
  vagas_disponiveis: number;
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

function slugify(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function formatarData(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(data);
}

function formatarMoeda(valor: string | number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

function itensInclusos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((item) => typeof item === 'string' ? item : String((item as any)?.nome || '')).filter(Boolean);
}

function statusOferta(disponibilidade?: string | null) {
  if (disponibilidade === 'esgotado') return { label: 'Esgotado', classe: 'bg-[#182D3B] text-white' };
  if (disponibilidade === 'ultimas_vagas') return { label: 'Últimas vagas', classe: 'bg-[#F6E8C9] text-[#6B4D14]' };
  return { label: 'Disponível', classe: 'bg-[#E9F1EB] text-[#365B41]' };
}

const mensagemWhatsApp = 'Olá! Quero receber as informações completas dos pacotes disponíveis da Excursão das Comitivas para Barretos.';

function Skeleton() {
  return (
    <div className="space-y-6 py-10" aria-label="Carregando excursões">
      <div className="mx-auto h-10 w-72 animate-pulse rounded-xl bg-[#182D3B]/10" />
      {[1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-[2rem] bg-white" />)}
    </div>
  );
}

export default function Eventos() {
  const { eventoId, eventoSlug } = useParams();
  const [searchParams] = useSearchParams();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroModalidade, setFiltroModalidade] = useState('todas');
  const [somenteDisponiveis, setSomenteDisponiveis] = useState(false);
  const identificadorEvento = eventoId || eventoSlug;
  const eventosExibidos = identificadorEvento ? eventos.filter((evento) => evento.id === identificadorEvento || slugify(evento.nome) === identificadorEvento) : eventos;
  const ref = searchParams.get('ref');

  const carregar = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/publico/ofertas');
      setEventos(response.data.eventos || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Não foi possível carregar as excursões agora.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const tituloPagina = identificadorEvento ? `${eventosExibidos[0]?.nome || 'Excursão para Barretos'} | Excursão das Comitivas` : 'Pacotes para Barretos | Excursão das Comitivas';
  const canonical = `https://excursaodascomitivas.com.br/${identificadorEvento ? `excursao/${encodeURIComponent(eventoSlug || identificadorEvento)}` : 'eventos'}`;

  return (
    <div className="min-h-screen bg-[#F8F5EF] text-[#182D3B]">
      <Helmet>
        <title>{tituloPagina}</title>
        <meta name="description" content="Compare as excursões e pacotes publicados para Barretos, consulte preços e disponibilidade e continue para montar sua reserva." />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Excursão das Comitivas" />
        <meta property="og:title" content={tituloPagina} />
        <meta property="og:description" content="Veja os pacotes publicados para Barretos e escolha sua experiência." />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content="https://excursaodascomitivas.com.br/images/logo-compartilhamento.webp" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={tituloPagina} />
        <meta name="twitter:description" content="Pacotes publicados, preços e disponibilidade para sua próxima excursão." />
        <meta name="twitter:image" content="https://excursaodascomitivas.com.br/images/logo-compartilhamento.webp" />
      </Helmet>

      <section className="border-b border-[#182D3B]/10 bg-[#F8F5EF] px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-end gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#851F32]">Excursões & pacotes</p>
            <h1 className="font-editorial mt-4 max-w-4xl text-3xl font-bold leading-[1.04] tracking-[-0.035em] text-[#182D3B] sm:mt-5 sm:text-5xl lg:text-6xl">
              Escolha a experiência que combina com a sua viagem.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#182D3B]/68 sm:text-lg">
              A vitrine usa as ofertas publicadas pelo sistema. Preço, disponibilidade e pacote selecionado continuam sob responsabilidade do backend.
            </p>
          </div>
          <div className="relative min-h-[300px] overflow-hidden rounded-[2rem] bg-[#182D3B] shadow-[0_24px_60px_rgba(24,45,59,0.18)]">
            <img src="/images/hero-parque-peao.jpg" alt="Parque do Peão em Barretos" className="absolute inset-0 h-full w-full object-cover opacity-75" width="900" height="620" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#182D3B]/80 via-[#182D3B]/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-7 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Barretos, São Paulo</p>
              <p className="font-editorial mt-2 text-3xl font-bold">Sua próxima história começa aqui.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8" id="ofertas">
        <div className="flex flex-col justify-between gap-5 border-b border-[#182D3B]/10 pb-8 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#851F32]">Oferta publicada</p>
            <h2 className="font-editorial mt-3 text-4xl font-bold tracking-[-0.035em] text-[#182D3B]">Encontre seu pacote</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#182D3B]/60">Escolha diretamente o pacote desejado. O configurador confirmará a seleção contra a lista atual retornada pelo servidor.</p>
        </div>

        <div className="sticky top-[120px] z-30 -mx-4 border-b border-[#182D3B]/8 bg-[#F8F5EF]/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 text-xs font-black uppercase tracking-[.12em] text-[#182D3B]/45"><Filter size={14}/>Filtrar</span>
            {[['todas','Todos'],['camping','Camping'],['quarto_ventilador','Ventilador'],['quarto_ar_condicionado','Ar-condicionado']].map(([valor,label])=><button key={valor} type="button" onClick={()=>setFiltroModalidade(valor)} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-extrabold transition ${filtroModalidade===valor?'border-[#851F32] bg-[#851F32] text-white':'border-[#182D3B]/12 bg-white text-[#182D3B] hover:border-[#851F32]/30'}`}>{label}</button>)}
            <button type="button" onClick={()=>setSomenteDisponiveis(v=>!v)} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-extrabold transition ${somenteDisponiveis?'border-[#365B41] bg-[#365B41] text-white':'border-[#182D3B]/12 bg-white text-[#182D3B] hover:border-[#365B41]/30'}`}>Somente disponíveis</button>
          </div>
        </div>

        {isLoading && <Skeleton />}

        {!isLoading && error && (
          <div className="mx-auto mt-10 max-w-xl rounded-[1.75rem] border border-[#851F32]/15 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto text-[#851F32]" size={34} />
            <h3 className="font-editorial mt-4 text-2xl font-bold text-[#182D3B]">Não conseguimos carregar as ofertas.</h3>
            <p className="mt-2 text-sm leading-6 text-[#182D3B]/65">{error}</p>
            <Button variant="outline" className="mt-5" onClick={() => void carregar()}>Tentar novamente</Button>
          </div>
        )}

        {!isLoading && !error && eventosExibidos.length === 0 && (
          <div className="mt-10 rounded-[2rem] border border-dashed border-[#182D3B]/20 bg-white p-12 text-center">
            <Calendar className="mx-auto text-[#851F32]" size={38} />
            <h3 className="font-editorial mt-4 text-3xl font-bold text-[#182D3B]">Novas datas serão publicadas em breve.</h3>
            <p className="mt-3 text-[#182D3B]/65">Fale com a equipe para acompanhar a próxima excursão.</p>
            <WhatsAppCTA mensagem={mensagemWhatsApp} label="Falar com a equipe" className="mt-6" />
          </div>
        )}

        <div className="mt-10 space-y-10">
          {eventosExibidos.map((evento) => (
            <article key={evento.id} className="overflow-hidden rounded-[2rem] border border-[#182D3B]/10 bg-white shadow-[0_18px_50px_rgba(24,45,59,0.08)]">
              <div className="grid lg:grid-cols-[0.36fr_0.64fr]">
                <div className="relative min-h-[300px] overflow-hidden bg-[#182D3B] lg:min-h-full">
                  <img src="/images/hero-parque-peao.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-65" loading="lazy" width="760" height="980" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#182D3B] via-[#182D3B]/45 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-7 text-white">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-white/70">Excursão publicada</p>
                    <h2 className="font-editorial mt-3 text-3xl font-bold leading-tight">{evento.nome}</h2>
                    <div className="mt-5 space-y-2 text-sm text-white/85">
                      <p className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-[#E3AAB4]" />{evento.local}</p>
                      <p className="flex items-start gap-2"><Calendar size={16} className="mt-0.5 shrink-0 text-[#E3AAB4]" />{formatarData(evento.data_inicio)} a {formatarData(evento.data_fim)}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-8 lg:p-9">
                  {evento.descricao && <p className="max-w-3xl text-sm leading-7 text-[#182D3B]/66">{evento.descricao}</p>}

                  <div className={`${evento.descricao ? 'mt-7' : ''} space-y-8`}>
                    {evento.lotes.map((lote) => (
                      <section key={lote.id} aria-labelledby={`lote-${lote.id}`}>
                        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                          <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#851F32]">{formatarData(lote.data_inicio)} — {formatarData(lote.data_fim)}</p>
                            <h3 id={`lote-${lote.id}`} className="font-editorial mt-1 text-2xl font-bold text-[#182D3B]">{lote.nome}</h3>
                            {lote.descricao && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#182D3B]/60">{lote.descricao}</p>}
                          </div>
                          <span className={`self-start rounded-full px-3 py-1.5 text-xs font-bold ${lote.vagas_disponiveis > 0 ? 'bg-[#E9F1EB] text-[#365B41]' : 'bg-[#182D3B] text-white'}`}>
                            {lote.vagas_disponiveis > 0 ? 'Vagas no lote' : 'Lote esgotado'}
                          </span>
                        </div>

                        {lote.modalidades.filter((m) => (filtroModalidade === 'todas' || m.modalidade_hospedagem === filtroModalidade) && (!somenteDisponiveis || m.disponibilidade !== 'esgotado')).length > 0 ? (
                          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {lote.modalidades.filter((m) => (filtroModalidade === 'todas' || m.modalidade_hospedagem === filtroModalidade) && (!somenteDisponiveis || m.disponibilidade !== 'esgotado')).map((modalidade) => {
                              const status = statusOferta(modalidade.disponibilidade);
                              const esgotado = modalidade.disponibilidade === 'esgotado';
                              const inclusos = itensInclusos(modalidade.itens_inclusos);
                              const pacoteLink = `/pacote/${lote.id}?pacote=${encodeURIComponent(modalidade.id)}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`;

                              return (
                                <article key={modalidade.id} className={`flex min-h-full flex-col rounded-[1.5rem] border p-5 transition ${esgotado ? 'border-[#182D3B]/10 bg-[#F8F5EF]/55' : 'border-[#182D3B]/10 bg-white hover:-translate-y-0.5 hover:border-[#851F32]/25 hover:shadow-[0_14px_32px_rgba(24,45,59,0.08)]'}`}>
                                  <div className="flex items-start justify-between gap-3">
                                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F4EAEC] text-[#851F32]"><BedDouble size={20} /></span>
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${status.classe}`}>{status.label}</span>
                                  </div>
                                  <h4 className="font-editorial mt-5 text-xl font-bold leading-tight text-[#182D3B]">{modalidade.nome}</h4>
                                  {modalidade.descricao && <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#182D3B]/60">{modalidade.descricao}</p>}
                                  {inclusos.length > 0 && (
                                    <ul className="mt-4 space-y-2 text-xs text-[#182D3B]/68">
                                      {inclusos.slice(0, 3).map((item) => <li key={item} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#851F32]" /><span>{item}</span></li>)}
                                    </ul>
                                  )}
                                  <div className="mt-auto pt-6">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#182D3B]/45">Valor publicado</p>
                                    <p className="mt-1 text-2xl font-extrabold text-[#182D3B]">{formatarMoeda(modalidade.valor_total)} <span className="text-xs font-semibold text-[#182D3B]/50">por pessoa</span></p>
                                    {esgotado ? (
                                      <WhatsAppCTA mensagem={`Olá! Quero saber sobre lista de espera para ${modalidade.nome} — ${lote.nome}.`} label="Consultar lista de espera" size="sm" className="mt-4 w-full" />
                                    ) : (
                                      <Link to={pacoteLink} className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#851F32] px-4 text-sm font-extrabold text-white transition hover:bg-[#6f1929]">
                                        Ver detalhes e escolher <ArrowRight size={16} />
                                      </Link>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-5 rounded-2xl border border-dashed border-[#182D3B]/15 bg-[#F8F5EF] p-6 text-center text-sm text-[#182D3B]/55">Nenhum pacote deste lote corresponde aos filtros selecionados.</div>
                        )}
                      </section>
                    ))}

                    {evento.lotes.length === 0 && <div className="rounded-2xl border border-dashed border-[#182D3B]/15 bg-[#F8F5EF] p-7 text-center text-sm text-[#182D3B]/55">Os lotes desta excursão ainda serão publicados.</div>}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-[#182D3B]/10 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <MessageCircle className="text-[#851F32]" size={30} />
          <h2 className="font-editorial mt-4 text-3xl font-bold text-[#182D3B] sm:text-4xl">Quer comparar antes de decidir?</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#182D3B]/62">A equipe pode explicar as diferenças entre os pacotes publicados e ajudar você a escolher sem alterar as condições apresentadas no sistema.</p>
          <WhatsAppCTA mensagem={mensagemWhatsApp} label="Conversar com a equipe" size="lg" className="mt-7" />
        </div>
      </section>
    </div>
  );
}
