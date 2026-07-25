import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertCircle, ArrowRight, Bed, Bus, Calendar, CheckCircle2, MapPin, Snowflake, TentTree, Wind } from 'lucide-react';
import { Button, WhatsAppCTA } from '@ui/index';
import { api } from '../contexts/AuthContext';

type Modalidade = {
  id: string;
  nome: string;
  descricao?: string | null;
  modalidade_hospedagem: 'camping' | 'quarto_ventilador' | 'quarto_ar_condicionado';
  disponibilidade: 'disponivel' | 'ultimas_vagas' | 'esgotado';
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

const modalidadeMeta = {
  camping: { label: 'Camping', Icone: TentTree },
  quarto_ventilador: { label: 'Quarto com ventilador', Icone: Wind },
  quarto_ar_condicionado: { label: 'Quarto com ar-condicionado', Icone: Snowflake },
};

const mensagemWhatsApp = 'Olá! Quero receber as informações completas dos pacotes disponíveis da Excursão das Comitivas para Barretos.';

function data(valor: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(valor));
}

function Skeleton() {
  return (
    <div className="space-y-6 py-10" aria-label="Carregando excursões">
      <div className="mx-auto h-10 w-72 animate-pulse rounded-xl bg-slate-200" />
      {[1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-3xl bg-slate-100" />)}
    </div>
  );
}

export default function Eventos() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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
    carregar();
  }, []);

  return (
    <div className="min-h-screen bg-[#fffdf9]">
      <Helmet>
        <title>Pacotes para Barretos 2026 | Excursão das Comitivas</title>
        <meta name="description" content="Conheça as excursões e modalidades Camping, Quarto com Ventilador e Quarto com Ar-condicionado. Consulte disponibilidade e condições." />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://comitivas.permupay.com.br/eventos" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Excursão das Comitivas" />
        <meta property="og:title" content="Pacotes para Barretos 2026 | Excursão das Comitivas" />
        <meta property="og:description" content="Escolha sua modalidade, confira o que está incluso e fale com a equipe da Excursão das Comitivas." />
        <meta property="og:url" content="https://comitivas.permupay.com.br/eventos" />
        <meta property="og:image" content="https://comitivas.permupay.com.br/images/logo-compartilhamento.webp" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Pacotes para Barretos 2026 | Excursão das Comitivas" />
        <meta name="twitter:description" content="Camping e quartos organizados para viver Barretos com tranquilidade." />
        <meta name="twitter:image" content="https://comitivas.permupay.com.br/images/logo-compartilhamento.webp" />
      </Helmet>

      <section className="relative -mx-4 -mt-8 overflow-hidden bg-slate-950 px-4 py-24 text-white sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <img src="/images/hero-parque-peao.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-primary/55" />
        <div className="relative mx-auto max-w-5xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff9fa6]">Escolha como viver Barretos</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">Sua experiência começa pela escolha certa.</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-200">Conheça as datas, compare as modalidades e veja todos os detalhes antes de criar sua conta. O cadastro só é solicitado quando você decidir continuar para a reserva.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="#ofertas"><Button size="lg">Ver excursões abertas <ArrowRight size={18} className="ml-2" /></Button></a>
            <WhatsAppCTA mensagem={mensagemWhatsApp} label="Tirar dúvidas no WhatsApp" size="lg" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl py-20" id="ofertas">
        <div className="mb-10 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Vagas e modalidades em tempo real</p>
          <h2 className="mt-3 text-3xl font-black text-secondary sm:text-4xl">Excursões disponíveis</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">Os valores aparecem somente depois que você abre a oferta e escolhe uma modalidade. Nesta vitrine, você decide pela experiência e pela disponibilidade.</p>
        </div>

        {isLoading && <Skeleton />}

        {!isLoading && error && (
          <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <AlertCircle className="mx-auto text-red-600" size={34} />
            <h3 className="mt-3 font-bold text-red-950">Não conseguimos carregar as ofertas.</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
            <Button variant="outline" className="mt-5" onClick={carregar}>Tentar novamente</Button>
          </div>
        )}

        {!isLoading && !error && eventos.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Calendar className="mx-auto text-primary" size={38} />
            <h3 className="mt-4 text-2xl font-black text-secondary">Novas datas serão publicadas em breve.</h3>
            <p className="mt-2 text-slate-600">Fale com a equipe para entrar na lista de interesse da próxima excursão.</p>
            <WhatsAppCTA mensagem={mensagemWhatsApp} label="Entrar na lista pelo WhatsApp" className="mt-6" />
          </div>
        )}

        <div className="space-y-8">
          {eventos.map((evento) => (
            <article key={evento.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-950/5">
              <div className="grid lg:grid-cols-[0.75fr_1.25fr]">
                <div className="relative min-h-72 overflow-hidden bg-slate-950">
                  <img src="/images/hero-parque-peao.jpg" alt={`Parque do Peão — ${evento.nome}`} className="absolute inset-0 h-full w-full object-cover opacity-70" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-7 text-white">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff9fa6]">Excursão aberta</p>
                    <h2 className="mt-2 text-3xl font-black">{evento.nome}</h2>
                    <div className="mt-4 space-y-2 text-sm text-slate-100">
                      <p className="flex items-center gap-2"><MapPin size={16} className="text-[#ff9fa6]" />{evento.local}</p>
                      <p className="flex items-center gap-2"><Calendar size={16} className="text-[#ff9fa6]" />{data(evento.data_inicio)} a {data(evento.data_fim)}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-8">
                  {evento.descricao && <p className="leading-7 text-slate-600">{evento.descricao}</p>}
                  <div className="mt-6 space-y-5">
                    {evento.lotes.map((lote) => (
                      <div key={lote.id} className="rounded-2xl border border-slate-200 bg-[#fffaf5] p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-lg font-black text-secondary">{lote.nome}</h3>
                            <p className="mt-1 text-sm text-slate-500">{data(lote.data_inicio)} a {data(lote.data_fim)}</p>
                          </div>
                          <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${lote.vagas_disponiveis > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-800 text-white'}`}>
                            {lote.vagas_disponiveis > 0 ? `${lote.vagas_disponiveis} vagas no lote` : 'Lote esgotado'}
                          </span>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          {lote.modalidades.map((modalidade) => {
                            const meta = modalidadeMeta[modalidade.modalidade_hospedagem];
                            const Icone = meta?.Icone || Bed;
                            const esgotado = modalidade.disponibilidade === 'esgotado';
                            return (
                              <div key={modalidade.id} className={`rounded-xl border bg-white p-4 ${esgotado ? 'border-slate-200 opacity-65' : modalidade.disponibilidade === 'ultimas_vagas' ? 'border-amber-300' : 'border-slate-200'}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <Icone size={22} className="text-primary" />
                                  {modalidade.disponibilidade !== 'disponivel' && <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${esgotado ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-800'}`}>{esgotado ? 'Esgotado' : 'Últimas vagas'}</span>}
                                </div>
                                <p className="mt-3 text-sm font-bold text-slate-900">{meta?.label || modalidade.nome}</p>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{modalidade.descricao || modalidade.nome}</p>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <p className="flex items-center gap-2 text-xs font-semibold text-slate-600"><CheckCircle2 size={16} className="text-emerald-600" />Navegação livre e cadastro apenas no final.</p>
                          {lote.vagas_disponiveis > 0 && lote.modalidades.some((modalidade) => modalidade.disponibilidade !== 'esgotado') ? (
                            <Link to={`/pacote/${lote.id}`}><Button>Ver detalhes e disponibilidade <ArrowRight size={16} className="ml-2" /></Button></Link>
                          ) : (
                            <WhatsAppCTA mensagem={`Olá! Vi que ${lote.nome} está esgotado e quero saber se existe lista de espera.`} label="Entrar na lista de espera" size="sm" />
                          )}
                        </div>
                      </div>
                    ))}
                    {evento.lotes.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Os lotes desta excursão ainda serão publicados.</div>}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-secondary px-6 py-12 text-center text-white sm:px-10">
        <Bus className="mx-auto text-[#ff9fa6]" size={36} />
        <h2 className="mt-4 text-3xl font-black">Ainda está em dúvida entre as modalidades?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">Conte para a equipe como você gosta de viajar. A gente ajuda a comparar Camping, Ventilador e Ar-condicionado sem compromisso.</p>
        <WhatsAppCTA mensagem={mensagemWhatsApp} label="Conversar com um consultor" size="lg" className="mt-7" />
      </section>
    </div>
  );
}
