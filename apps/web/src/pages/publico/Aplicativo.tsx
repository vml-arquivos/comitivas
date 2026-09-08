import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Download, Share2, ShieldCheck, Smartphone, SquarePlus, WifiOff } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function emModoAplicativo() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function Aplicativo() {
  const [promptInstalacao, setPromptInstalacao] = useState<InstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState(false);
  const [mensagem, setMensagem] = useState('');

  const ambiente = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const android = /android/.test(ua);
    return { ios, android };
  }, []);

  useEffect(() => {
    setInstalado(emModoAplicativo());

    const antesDeInstalar = (event: Event) => {
      event.preventDefault();
      setPromptInstalacao(event as InstallPromptEvent);
    };
    const instaladoHandler = () => {
      setInstalado(true);
      setPromptInstalacao(null);
      setMensagem('Aplicativo instalado com sucesso.');
    };

    window.addEventListener('beforeinstallprompt', antesDeInstalar);
    window.addEventListener('appinstalled', instaladoHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', antesDeInstalar);
      window.removeEventListener('appinstalled', instaladoHandler);
    };
  }, []);

  const instalar = async () => {
    if (!promptInstalacao) return;
    await promptInstalacao.prompt();
    const escolha = await promptInstalacao.userChoice;
    if (escolha.outcome === 'accepted') setMensagem('Instalação iniciada.');
    setPromptInstalacao(null);
  };

  const copiarLink = async () => {
    await navigator.clipboard?.writeText('https://excursaodascomitivas.com.br/aplicativo');
    setMensagem('Link copiado.');
  };

  return (
    <div className="bg-[#F8F5EF]">
      <Helmet>
        <title>Aplicativo | Excursão das Comitivas</title>
        <meta name="description" content="Instale a Excursão das Comitivas no Android ou iPhone e acompanhe pacotes, contratos, pagamentos e reservas pelo celular." />
        <link rel="canonical" href="https://excursaodascomitivas.com.br/aplicativo" />
      </Helmet>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#851F32]/15 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#851F32]">
              <Smartphone size={15} /> App oficial
            </span>
            <h1 className="font-editorial mt-6 max-w-3xl text-5xl font-bold leading-[1.02] tracking-[-0.04em] text-[#182D3B] sm:text-6xl">
              Sua excursão inteira no celular.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#182D3B]/70">
              Instale o aplicativo da Excursão das Comitivas diretamente pelo site. Você usa a mesma conta e acompanha excursões, pacotes, contrato, validação, pagamentos, boletos e reservas em uma experiência feita para o celular.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {instalado ? (
                <div className="inline-flex items-center justify-center gap-2 rounded-full bg-[#365B41] px-6 py-3.5 font-extrabold text-white">
                  <CheckCircle2 size={19} /> Aplicativo instalado
                </div>
              ) : promptInstalacao ? (
                <button type="button" onClick={instalar} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#851F32] px-6 py-3.5 font-extrabold text-white shadow-[0_14px_34px_rgba(133,31,50,.18)] transition hover:bg-[#6f1929]">
                  <Download size={19} /> Instalar aplicativo
                </button>
              ) : (
                <a href="#como-instalar" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#851F32] px-6 py-3.5 font-extrabold text-white shadow-[0_14px_34px_rgba(133,31,50,.18)] transition hover:bg-[#6f1929]">
                  <Download size={19} /> Como instalar
                </a>
              )}
              <button type="button" onClick={copiarLink} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#182D3B]/15 bg-white px-6 py-3.5 font-bold text-[#182D3B] transition hover:border-[#851F32]/25 hover:text-[#851F32]">
                <Share2 size={18} /> Copiar link
              </button>
            </div>
            {mensagem && <p className="mt-3 text-sm font-semibold text-[#365B41]" aria-live="polite">{mensagem}</p>}
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-5 rounded-[3rem] bg-[#851F32]/8 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.6rem] border border-[#182D3B]/12 bg-[#182D3B] p-3 shadow-[0_32px_90px_rgba(24,45,59,.22)]">
              <div className="rounded-[2rem] bg-[#F8F5EF] p-7 sm:p-9">
                <img src="/app-icon-192.png" alt="Ícone do aplicativo Excursão das Comitivas" className="h-20 w-20 rounded-3xl shadow-sm" />
                <p className="mt-7 text-xs font-extrabold uppercase tracking-[0.18em] text-[#851F32]">Excursão das Comitivas</p>
                <h2 className="font-editorial mt-2 text-3xl font-bold text-[#182D3B]">Tudo em um só lugar</h2>
                <div className="mt-7 grid gap-3">
                  {['Ver excursões e pacotes', 'Montar e contratar o pacote', 'Validar contrato por código', 'Acompanhar boletos e pagamentos', 'Consultar reservas e documentos'].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-[#182D3B]/8 bg-white px-4 py-3 text-sm font-semibold text-[#182D3B]">
                      <CheckCircle2 size={18} className="shrink-0 text-[#365B41]" /> {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="como-instalar" className="border-y border-[#182D3B]/10 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#851F32]">Instalação rápida</p>
            <h2 className="font-editorial mt-3 text-4xl font-bold tracking-[-0.03em] text-[#182D3B]">Android e iPhone</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <article className={`rounded-[2rem] border p-7 ${ambiente.android ? 'border-[#851F32]/30 bg-[#FFF8F8]' : 'border-[#182D3B]/10 bg-[#F8F5EF]'}`}>
              <Smartphone className="text-[#851F32]" size={28} />
              <h3 className="font-editorial mt-5 text-2xl font-bold text-[#182D3B]">Android</h3>
              <ol className="mt-5 space-y-3 text-sm leading-6 text-[#182D3B]/72">
                <li><strong>1.</strong> Abra esta página no Chrome.</li>
                <li><strong>2.</strong> Toque em <strong>Instalar aplicativo</strong> quando o botão estiver disponível.</li>
                <li><strong>3.</strong> Confirme a instalação. O ícone aparecerá na tela inicial.</li>
              </ol>
            </article>
            <article className={`rounded-[2rem] border p-7 ${ambiente.ios ? 'border-[#851F32]/30 bg-[#FFF8F8]' : 'border-[#182D3B]/10 bg-[#F8F5EF]'}`}>
              <Share2 className="text-[#851F32]" size={28} />
              <h3 className="font-editorial mt-5 text-2xl font-bold text-[#182D3B]">iPhone / iPad</h3>
              <ol className="mt-5 space-y-3 text-sm leading-6 text-[#182D3B]/72">
                <li><strong>1.</strong> Abra esta página no Safari.</li>
                <li><strong>2.</strong> Toque em <strong>Compartilhar</strong>.</li>
                <li className="flex gap-2"><SquarePlus size={18} className="mt-1 shrink-0 text-[#851F32]" /><span><strong>3.</strong> Toque em <strong>Adicionar à Tela de Início</strong> e mantenha <strong>Abrir como App da Web</strong> ativado.</span></li>
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-[2rem] bg-[#182D3B] p-7 text-white">
            <ShieldCheck size={30} className="text-[#D6A6AE]" />
            <h3 className="font-editorial mt-5 text-2xl font-bold">Mesma segurança do sistema</h3>
            <p className="mt-3 text-sm leading-7 text-white/70">O aplicativo usa o mesmo backend, login, contratos, validações e controles financeiros do site. Não existe uma segunda base de dados nem regras duplicadas.</p>
          </div>
          <div className="rounded-[2rem] border border-[#182D3B]/10 bg-white p-7">
            <WifiOff size={30} className="text-[#851F32]" />
            <h3 className="font-editorial mt-5 text-2xl font-bold text-[#182D3B]">Operações críticas exigem internet</h3>
            <p className="mt-3 text-sm leading-7 text-[#182D3B]/70">Para proteger preços, vagas, contratos e pagamentos, as operações transacionais sempre consultam o servidor. O modo offline serve apenas como tela de continuidade.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
