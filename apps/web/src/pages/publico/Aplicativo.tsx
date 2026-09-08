import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Plus,
  Share2,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function emModoAplicativo() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function Aplicativo() {
  const [promptInstalacao, setPromptInstalacao] = useState<InstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState(false);
  const [mensagem, setMensagem] = useState('');

  const ambiente = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    return {
      ios: /iphone|ipad|ipod/.test(ua),
      android: /android/.test(ua),
    };
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

  const rolarParaInstalacao = (plataforma?: 'ios' | 'android') => {
    document.getElementById(plataforma === 'ios' ? 'instalar-ios' : plataforma === 'android' ? 'instalar-android' : 'como-instalar')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const instalar = async () => {
    setMensagem('');
    if (instalado) return;

    if (promptInstalacao) {
      await promptInstalacao.prompt();
      const escolha = await promptInstalacao.userChoice;
      setMensagem(escolha.outcome === 'accepted' ? 'Instalação iniciada.' : 'Instalação não concluída. Você pode tentar novamente quando quiser.');
      setPromptInstalacao(null);
      return;
    }

    rolarParaInstalacao(ambiente.ios ? 'ios' : ambiente.android ? 'android' : undefined);
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard?.writeText('https://excursaodascomitivas.com.br/aplicativo');
      setMensagem('Link do aplicativo copiado.');
    } catch {
      setMensagem('Abra excursaodascomitivas.com.br/aplicativo no celular.');
    }
  };

  const labelInstalar = instalado
    ? 'Aplicativo instalado'
    : ambiente.ios
      ? 'Instalar no iPhone'
      : ambiente.android
        ? 'Instalar no Android'
        : 'Instalar aplicativo';

  const recursos = [
    { icon: FileText, titulo: 'Excursões e pacotes', texto: 'Consulte opções, detalhes da viagem e disponibilidade.' },
    { icon: FileText, titulo: 'Contratos', texto: 'Gere, valide, visualize e acompanhe seus documentos.' },
    { icon: FileText, titulo: 'Pagamentos', texto: 'Acompanhe boletos, parcelas, pagamentos e comprovantes.' },
    { icon: ShieldCheck, titulo: 'Sua conta', texto: 'Acesse histórico, dados, reservas e atendimento em um só lugar.' },
  ];

  return (
    <div className="bg-[#F8F5EF] text-[#182D3B]">
      <Helmet>
        <title>Aplicativo | Excursão das Comitivas</title>
        <meta name="description" content="Instale a Excursão das Comitivas no Android ou iPhone e acompanhe pacotes, contratos, pagamentos e reservas pelo celular." />
        <link rel="canonical" href="https://excursaodascomitivas.com.br/aplicativo" />
      </Helmet>

      <section className="border-b border-[#182D3B]/8 bg-[radial-gradient(circle_at_top_right,rgba(133,31,50,.13),transparent_42%)]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 sm:py-14 lg:grid-cols-[1.02fr_.98fr] lg:gap-14 lg:px-8 lg:py-20">
          <div className="order-2 lg:order-1">
            <div className="flex items-center gap-4 lg:hidden">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[1.55rem] border border-[#182D3B]/10 bg-white p-2 shadow-[0_12px_30px_rgba(24,45,59,.10)]">
                <img src="/app-icon-192.png" alt="Excursão das Comitivas" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.17em] text-[#851F32]">Aplicativo oficial</p>
                <p className="mt-1 font-editorial text-lg font-bold leading-tight text-[#182D3B] sm:text-xl">Excursão das Comitivas</p>
                <p className="mt-1 text-xs text-[#182D3B]/55">Android e iPhone</p>
              </div>
            </div>

            <span className="hidden items-center gap-2 rounded-full border border-[#851F32]/15 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#851F32] lg:inline-flex">
              <Smartphone size={15} /> Aplicativo oficial
            </span>

            <h1 className="font-editorial mt-5 max-w-2xl text-[1.9rem] font-bold leading-[1.08] tracking-[-0.035em] text-[#182D3B] sm:text-5xl lg:mt-7 lg:text-6xl">
              Sua viagem na palma da mão.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#182D3B]/68 sm:mt-6 sm:text-lg sm:leading-8">
              Instale pelo próprio site e use a mesma conta para escolher pacotes, contratar, validar documentos, acompanhar pagamentos e falar com a equipe.
            </p>

            <div className="mt-6 rounded-2xl border border-[#851F32]/15 bg-white p-4 shadow-[0_12px_35px_rgba(24,45,59,.07)] sm:mt-8 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-[#851F32]/8 p-2 text-[#851F32]"><Download size={20} /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-[#182D3B]">Instale agora no seu celular</p>
                  <p className="mt-1 text-sm leading-6 text-[#182D3B]/60">Não precisa criar outra conta. O aplicativo abre em tela cheia e mantém o acesso ao mesmo sistema.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <button
                  type="button"
                  onClick={() => void instalar()}
                  disabled={instalado}
                  className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-extrabold transition ${instalado ? 'cursor-default bg-[#365B41] text-white' : 'bg-[#851F32] text-white shadow-[0_10px_24px_rgba(133,31,50,.16)] hover:bg-[#6f1929]'}`}
                >
                  {instalado ? <CheckCircle2 size={18} /> : <Download size={18} />} {labelInstalar}
                </button>
                <button type="button" onClick={copiarLink} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#182D3B]/12 bg-white px-5 py-3 text-sm font-bold text-[#182D3B] transition hover:border-[#851F32]/25 hover:text-[#851F32]">
                  <Share2 size={17} /> Compartilhar
                </button>
              </div>
              {mensagem && <p className="mt-3 text-sm font-semibold text-[#365B41]" aria-live="polite">{mensagem}</p>}
            </div>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#182D3B]/58 sm:text-sm">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#365B41]" /> Sem download de loja</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#365B41]" /> Mesma conta e segurança</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#365B41]" /> Atualização automática</span>
            </div>
          </div>

          <div className="order-1 hidden lg:block">
            <div className="relative mx-auto max-w-[470px]">
              <div className="absolute -inset-10 rounded-full bg-[#851F32]/8 blur-3xl" />
              <div className="relative rounded-[2.3rem] border border-[#182D3B]/10 bg-white p-7 shadow-[0_30px_90px_rgba(24,45,59,.16)]">
                <div className="flex items-center gap-5 border-b border-[#182D3B]/8 pb-6">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[1.8rem] bg-[#F8F5EF] p-2 shadow-inner">
                    <img src="/app-icon-192.png" alt="Ícone do aplicativo Excursão das Comitivas" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#851F32]">App oficial</p>
                    <h2 className="font-editorial mt-2 text-3xl font-bold leading-tight text-[#182D3B]">Excursão das Comitivas</h2>
                    <p className="mt-2 text-sm text-[#182D3B]/55">Instalado direto pelo navegador</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3">
                  {['Escolha de excursões e pacotes', 'Contratação e validação de contrato', 'Boletos, pagamentos e comprovantes', 'Histórico, documentos e atendimento'].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-xl bg-[#F8F5EF] px-4 py-3 text-sm font-semibold text-[#182D3B]">
                      <CheckCircle2 size={17} className="shrink-0 text-[#365B41]" /> {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mb-7 sm:text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#851F32]">Tudo conectado</p>
          <h2 className="font-editorial mt-2 text-2xl font-bold tracking-[-0.025em] text-[#182D3B] sm:text-4xl">Um aplicativo para toda a sua jornada</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {recursos.map(({ icon: Icon, titulo, texto }) => (
            <article key={titulo} className="rounded-2xl border border-[#182D3B]/9 bg-white p-5 shadow-[0_8px_24px_rgba(24,45,59,.04)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#851F32]/8 text-[#851F32]"><Icon size={20} /></div>
              <h3 className="mt-4 text-base font-black text-[#182D3B]">{titulo}</h3>
              <p className="mt-2 text-sm leading-6 text-[#182D3B]/60">{texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="como-instalar" className="scroll-mt-24 border-y border-[#182D3B]/10 bg-white py-10 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl sm:mx-auto sm:text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#851F32]">Instalação simples</p>
            <h2 className="font-editorial mt-2 text-2xl font-bold tracking-[-0.025em] text-[#182D3B] sm:text-4xl">Escolha seu celular</h2>
            <p className="mt-3 text-sm leading-6 text-[#182D3B]/60 sm:text-base">Leva menos de um minuto e não exige cadastro adicional.</p>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <article id="instalar-android" className={`scroll-mt-28 rounded-2xl border p-5 sm:p-7 ${ambiente.android ? 'border-[#851F32]/35 bg-[#FFF8F8] shadow-[0_10px_30px_rgba(133,31,50,.06)]' : 'border-[#182D3B]/10 bg-[#F8F5EF]'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3"><Smartphone className="text-[#851F32]" size={24} /><h3 className="font-editorial text-xl font-bold text-[#182D3B]">Android</h3></div>
                {ambiente.android && <span className="rounded-full bg-[#851F32] px-2.5 py-1 text-[10px] font-black uppercase text-white">Seu aparelho</span>}
              </div>
              <ol className="mt-5 space-y-3 text-sm leading-6 text-[#182D3B]/72">
                <li className="flex gap-3"><span className="font-black text-[#851F32]">1.</span><span>Abra esta página no <strong>Chrome</strong>.</span></li>
                <li className="flex gap-3"><span className="font-black text-[#851F32]">2.</span><span>Toque em <strong>Instalar aplicativo</strong>. Se o botão não aparecer, abra o menu ⋮ do navegador e escolha a opção de instalar/adicionar à tela inicial.</span></li>
                <li className="flex gap-3"><span className="font-black text-[#851F32]">3.</span><span>Confirme. O ícone da Excursão das Comitivas aparecerá na tela inicial.</span></li>
              </ol>
              {ambiente.android && !instalado && <button type="button" onClick={() => void instalar()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#851F32] px-4 py-3 text-sm font-extrabold text-white"><Download size={17} />Instalar no Android</button>}
            </article>

            <article id="instalar-ios" className={`scroll-mt-28 rounded-2xl border p-5 sm:p-7 ${ambiente.ios ? 'border-[#851F32]/35 bg-[#FFF8F8] shadow-[0_10px_30px_rgba(133,31,50,.06)]' : 'border-[#182D3B]/10 bg-[#F8F5EF]'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3"><Share2 className="text-[#851F32]" size={24} /><h3 className="font-editorial text-xl font-bold text-[#182D3B]">iPhone / iPad</h3></div>
                {ambiente.ios && <span className="rounded-full bg-[#851F32] px-2.5 py-1 text-[10px] font-black uppercase text-white">Seu aparelho</span>}
              </div>
              <ol className="mt-5 space-y-3 text-sm leading-6 text-[#182D3B]/72">
                <li className="flex gap-3"><span className="font-black text-[#851F32]">1.</span><span>Abra esta página no <strong>Safari</strong>.</span></li>
                <li className="flex gap-3"><span className="font-black text-[#851F32]">2.</span><span>Toque no botão <strong>Compartilhar</strong> <Share2 size={15} className="inline" />.</span></li>
                <li className="flex gap-3"><Plus size={18} className="mt-1 shrink-0 text-[#851F32]" /><span>Escolha <strong>Adicionar à Tela de Início</strong>, mantenha <strong>Abrir como App da Web</strong> ativado e toque em <strong>Adicionar</strong>.</span></li>
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-[#182D3B] p-6 text-white sm:p-7">
            <ShieldCheck size={27} className="text-[#D6A6AE]" />
            <h3 className="font-editorial mt-4 text-xl font-bold sm:text-2xl">Mesma segurança do sistema</h3>
            <p className="mt-3 text-sm leading-7 text-white/70">O aplicativo usa o mesmo login, backend, contratos, validações e controles financeiros. Não existe uma segunda base de dados.</p>
          </div>
          <div className="rounded-2xl border border-[#182D3B]/10 bg-white p-6 sm:p-7">
            <WifiOff size={27} className="text-[#851F32]" />
            <h3 className="font-editorial mt-4 text-xl font-bold text-[#182D3B] sm:text-2xl">Operações críticas sempre online</h3>
            <p className="mt-3 text-sm leading-7 text-[#182D3B]/70">Preços, vagas, contratos e pagamentos são consultados no servidor para manter a informação correta e atualizada.</p>
          </div>
        </div>

        <button type="button" onClick={() => rolarParaInstalacao()} className="mx-auto mt-7 flex items-center gap-1 text-sm font-extrabold text-[#851F32] hover:underline">
          Ver instruções de instalação <ChevronRight size={16} />
        </button>
      </section>
    </div>
  );
}
