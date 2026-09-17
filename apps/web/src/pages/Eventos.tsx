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
  fotos?: Foto[];
  periodos?: Periodo[];
  destaque_titulo?: string | null;
  destaque_subtitulo?: string | null;
  destaque_texto?: string | null;
};

type Periodo = {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  descricao?: string | null;
  disponibilidade?: 'disponivel' | 'ultimas_vagas' | 'esgotado' | 'aguardando' | string | null;
  vagas_disponiveis?: number;
  valor_total?: string | number | null;
  lote_comercial_nome?: string | null;
  lote_comercial_descricao?: string | null;
  lote_comercial_data_fim?: string | null;
  lote_comercial_configurado?: boolean;
};

type Foto = {
  id: string;
  url_foto: string;
  legenda?: string | null;
  alt_text?: string | null;
  capa?: boolean;
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
  fotos?: Foto[];
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
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero) : 'Consultar';
}

function itensInclusos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((item) => typeof item === 'string' ? item : String((item as any)?.nome || '')).filter(Boolean);
}

function statusOferta(disponibilidade?: string | null) {
  if (disponibilidade === 'esgotado') return { label: 'Esgotado', classe: 'bg-[#182D3B] text-white' };
  if (disponibilidade === 'aguardando') return { label: 'Indisponível', classe: 'bg-slate-100 text-slate-700' };
  if (disponibilidade === 'ultimas_vagas') return { label: 'Últimas vagas', classe: 'bg-[#F6E8C9] text-[#6B4D14]' };
  return { label: 'Disponível', classe: 'bg-[#E9F1EB] text-[#365B41]' };
}

function disponibilidadeModalidade(modalidade: Modalidade) {
  const periodos = modalidade.periodos || [];
  if (!periodos.length) return modalidade.disponibilidade;
  if (periodos.some((periodo) => periodo.disponibilidade === 'disponivel')) return 'disponivel';
  if (periodos.some((periodo) => periodo.disponibilidade === 'ultimas_vagas')) return 'ultimas_vagas';
  if (periodos.some((periodo) => periodo.disponibilidade === 'aguardando')) return 'aguardando';
  return 'esgotado';
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
          {eventosExibidos.map((evento) => {
            const pacotes = Array.from(new Map(evento.lotes.flatMap((lote) => lote.modalidades.map((modalidade) => [modalidade.id, { lote, modalidade }] as const))).values());
            const pacotesFiltrados = pacotes.filter(({ modalidade }) => (filtroModalidade === 'todas' || modalidade.modalidade_hospedagem === filtroModalidade) && (!somenteDisponiveis || !['esgotado', 'aguardando'].includes(String(disponibilidadeModalidade(modalidade)))));
            return (
              <article key={evento.id} className="overflow-hidden rounded-[2rem] border border-[#182D3B]/10 bg-white shadow-[0_18px_50px_rgba(24,45,59,0.08)]">
                <div className="grid lg:grid-cols-[minmax(300px,.38fr)_minmax(0,1.62fr)]">
                  <div className="relative min-h-[360px] overflow-hidden bg-[#182D3B] lg:min-h-full">
                    <img src={evento.fotos?.find((foto) => foto.capa)?.url_foto || evento.fotos?.[0]?.url_foto || '/images/hero-parque-peao.jpg'} alt={evento.fotos?.[0]?.alt_text || evento.nome} aria-hidden={!evento.fotos?.length} className="absolute inset-0 h-full w-full object-cover opacity-70" loading="lazy" width="760" height="980" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#182D3B] via-[#182D3B]/35 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-white/70">Excursão publicada</p>
                      <h2 className="font-editorial mt-3 text-3xl font-bold leading-tight sm:text-4xl">{evento.nome}</h2>
                      <div className="mt-5 space-y-2 text-sm text-white/85">
                        <p className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-[#E3AAB4]" />{evento.local}</p>
                        <p className="flex items-start gap-2"><Calendar size={16} className="mt-0.5 shrink-0 text-[#E3AAB4]" />{formatarData(evento.data_inicio)} a {formatarData(evento.data_fim)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 sm:p-8 lg:p-10">
                    {evento.descricao && <p className="max-w-3xl text-sm leading-7 text-[#182D3B]/66">{evento.descricao}</p>}
                    <div className={`${evento.descricao ? 'mt-7' : ''} flex flex-col justify-between gap-3 border-b border-[#182D3B]/10 pb-5 sm:flex-row sm:items-end`}>
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#851F32]">Pacotes publicados</p>
                        <h3 className="font-editorial mt-2 text-3xl font-bold text-[#182D3B]">Escolha seu pacote</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#182D3B]/60">Cada pacote reúne seus períodos disponíveis. A forma de contratação e o período são confirmados uma única vez no configurador.</p>
                      </div>
                      <span className="w-fit shrink-0 rounded-full bg-[#E9F1EB] px-3 py-1.5 text-xs font-bold text-[#365B41]">{pacotesFiltrados.length} {pacotesFiltrados.length === 1 ? 'opção' : 'opções'}</span>
                    </div>

                    {pacotesFiltrados.length > 0 ? (
                      <div className="mt-6 grid gap-5 md:grid-cols-2">
                        {pacotesFiltrados.map(({ lote, modalidade }) => {
                          const periodos = modalidade.periodos || [];
                          const inclusos = itensInclusos(modalidade.itens_inclusos);
                          const status = statusOferta(disponibilidadeModalidade(modalidade));
                          const disponibilidade = disponibilidadeModalidade(modalidade);
                          const esgotado = disponibilidade === 'esgotado';
                          const bloqueado = esgotado || disponibilidade === 'aguardando';
                          const pacoteLink = `/pacote/${lote.id}?pacote=${encodeURIComponent(modalidade.id)}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`;
                          const possuiLoteConfigurado = periodos.some((periodo) => periodo.lote_comercial_configurado);
                          const valoresAtuais = periodos.filter((periodo) => !['esgotado', 'aguardando'].includes(String(periodo.disponibilidade)) && (!periodo.lote_comercial_configurado || Boolean(periodo.lote_comercial_nome))).map((periodo) => Number(periodo.valor_total)).filter((valor) => Number.isFinite(valor) && valor > 0);
                          const valorAtual = valoresAtuais.sort((a, b) => a - b)[0] || (possuiLoteConfigurado ? 0 : Number(modalidade.valor_total));
                          const periodoComLote = periodos.find((periodo) => periodo.lote_comercial_nome);

                          return (
                            <article key={modalidade.id} className={`flex min-w-0 flex-col rounded-[1.5rem] border p-5 sm:p-6 transition ${esgotado ? 'border-[#182D3B]/10 bg-[#F8F5EF]/60' : 'border-[#182D3B]/10 bg-white hover:-translate-y-0.5 hover:border-[#851F32]/25 hover:shadow-[0_14px_32px_rgba(24,45,59,0.08)]'}`}>
                              <div className="flex items-start justify-between gap-3">
                                {modalidade.fotos?.[0] ? <img src={modalidade.fotos[0].url_foto} alt={modalidade.fotos[0].alt_text || modalidade.fotos[0].legenda || modalidade.nome} className="h-20 w-20 rounded-2xl object-cover" loading="lazy" /> : <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F4EAEC] text-[#851F32]"><BedDouble size={24} /></span>}
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${status.classe}`}>{status.label}</span>
                              </div>
                              <h4 className="font-editorial mt-5 text-2xl font-bold leading-tight text-[#182D3B]">{modalidade.nome}</h4>
                              {(modalidade.destaque_titulo || modalidade.destaque_subtitulo || modalidade.destaque_texto) && <div className="mt-4 rounded-2xl border border-[#851F32]/15 bg-[#F8F0F1] px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#851F32]">{modalidade.destaque_subtitulo || 'Condição em destaque'}</p>{modalidade.destaque_titulo && <p className="mt-1 text-sm font-extrabold text-[#182D3B]">{modalidade.destaque_titulo}</p>}{modalidade.destaque_texto && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5F7079]">{modalidade.destaque_texto}</p>}</div>}
                              {periodoComLote && <div className="mt-4 rounded-2xl border border-[#851F32]/15 bg-[#FFF8F4] px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#851F32]">Condição disponível</p><p className="mt-1 text-sm font-extrabold text-[#182D3B]">{periodoComLote.lote_comercial_nome}</p>{periodoComLote.lote_comercial_data_fim && <p className="mt-1 text-xs text-[#5F7079]">Venda até {formatarData(periodoComLote.lote_comercial_data_fim)}</p>}</div>}
                              {modalidade.descricao && <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#182D3B]/60">{modalidade.descricao}</p>}
                              <div className="mt-5 rounded-2xl border border-[#182D3B]/10 bg-[#FCFAF7] p-4"><div className="flex items-center justify-between gap-3"><p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#851F32]"><Calendar size={14} />Períodos disponíveis</p><span className="text-xs font-bold text-[#182D3B]/50">{periodos.length || 0}</span></div>{periodos.length > 0 ? <div className="mt-3 space-y-2.5">{periodos.map((periodo) => { const periodoStatus = statusOferta(periodo.disponibilidade); const periodoTemPrecoVigente = !periodo.lote_comercial_configurado || Boolean(periodo.lote_comercial_nome); return <div key={periodo.id} className="rounded-xl border border-[#182D3B]/8 bg-white px-3 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block break-words text-sm font-extrabold text-[#182D3B]">{periodo.nome}</strong><span className="mt-1 block text-xs font-semibold text-[#60717B]">{formatarData(periodo.data_inicio)} a {formatarData(periodo.data_fim)}</span>{periodo.lote_comercial_nome && <small className="mt-1 block break-words text-[10px] font-bold text-[#851F32]">{periodo.lote_comercial_nome}</small>}{periodo.lote_comercial_descricao && <small className="mt-1 block line-clamp-2 text-[10px] leading-4 text-[#60717B]">{periodo.lote_comercial_descricao}</small>}</div><div className="shrink-0 text-right"><strong className="block text-xs font-extrabold text-[#182D3B]">{periodoTemPrecoVigente && periodo.valor_total ? formatarMoeda(periodo.valor_total) : 'Consultar'}</strong><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${periodoStatus.classe}`}>{periodoStatus.label}</span></div></div></div>; })}</div> : <p className="mt-2 text-xs font-semibold text-[#60717B]">Período confirmado no configurador.</p>}</div>
                              {inclusos.length > 0 && <ul className="mt-4 space-y-2 text-xs text-[#182D3B]/68">{inclusos.slice(0, 3).map((item) => <li key={item} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#851F32]" /><span>{item}</span></li>)}</ul>}
                              <div className="mt-auto pt-6"><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#182D3B]/45">Valor da condição disponível</p><p className="mt-1 text-2xl font-extrabold text-[#182D3B]">{Number.isFinite(valorAtual) && valorAtual > 0 ? formatarMoeda(valorAtual) : 'Consultar'} <span className="text-xs font-semibold text-[#182D3B]/50">por pessoa</span></p>{esgotado ? <WhatsAppCTA mensagem={`Olá! Quero saber sobre lista de espera para ${modalidade.nome} — ${evento.nome}.`} label="Consultar disponibilidade" size="sm" className="mt-4 w-full" /> : bloqueado ? <span className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center rounded-full bg-slate-100 px-4 text-sm font-extrabold text-slate-500">Indisponível no momento</span> : <Link to={pacoteLink} className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#851F32] px-4 text-sm font-extrabold text-white transition hover:bg-[#6f1929]">Escolher pacote e período <ArrowRight size={16} /></Link>}</div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-6 rounded-2xl border border-dashed border-[#182D3B]/15 bg-[#F8F5EF] p-7 text-center text-sm text-[#182D3B]/55">Nenhum pacote desta excursão corresponde aos filtros selecionados.</div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
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
