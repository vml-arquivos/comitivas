import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Download, Home, Instagram, LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logoUrl from '../assets/brand/logo.png';
import logoWebp from '../assets/brand/logo.webp';
import logoBranca from '../assets/brand/logo-branca.png';
import logoBrancaWebp from '../assets/brand/logo-branca.webp';
import { PwaInstallButton } from '../components/PwaInstallButton';
import { emModoAplicativo } from '../utils/pwaInstall';

const WHATSAPP_NUMERO = import.meta.env.VITE_WHATSAPP_NUMERO || '5561994459086';

function WhatsAppFloatButton() {
  const link = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent('Olá! Quero saber mais sobre a Excursão das Comitivas para Barretos.')}`;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#128C4A] text-white shadow-[0_14px_34px_rgba(18,140,74,0.28)] transition hover:-translate-y-0.5 hover:bg-[#0f7b40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#128C4A] focus-visible:ring-offset-4 lg:bottom-5"
      aria-label="Fale conosco no WhatsApp"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="27" height="27" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.39a9.9 9.9 0 0 0 4.69 1.19h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.15.83.84-3.07-.19-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.53 3.7-8.22 8.25-8.22 4.55 0 8.25 3.69 8.25 8.22 0 4.53-3.7 8.25-8.25 8.25z" />
      </svg>
    </a>
  );
}

function AppBottomNav({ logado }: { logado: boolean }) {
  const location = useLocation();
  const itens = [
    { to: '/', label: 'Início', icon: Home },
    { to: '/eventos', label: 'Excursões', icon: CalendarDays },
    { to: logado ? '/minha-conta' : '/login', label: logado ? 'Minhas viagens' : 'Entrar', icon: UserIcon },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[65] border-t border-[#182D3B]/10 bg-white/97 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_34px_rgba(24,45,59,.08)] backdrop-blur-xl" aria-label="Navegação do aplicativo">
      <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
        {itens.map(({ to, label, icon: Icon }) => {
          const ativo = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <Link key={to} to={to} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition ${ativo ? 'bg-[#851F32]/8 text-[#851F32]' : 'text-[#182D3B]/58'}`}>
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MainLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);
  const modoApp = emModoAplicativo();

  const handleLogout = () => {
    logout();
    setMenuAberto(false);
    navigate('/login');
  };

  const fecharMenu = () => setMenuAberto(false);

  return (
    <div className={`safe-mobile-content flex min-h-screen w-full flex-col overflow-x-clip bg-[#F8F5EF] text-[#182D3B] ${modoApp ? 'pwa-app-shell' : ''}`}>
      <a href="#conteudo-principal" className="fixed left-4 top-3 z-[70] -translate-y-20 rounded-full bg-[#182D3B] px-4 py-2 text-sm font-bold text-white shadow-lg transition focus:translate-y-0">Pular para o conteúdo</a>

      {modoApp ? (
        <header className="sticky top-0 z-50 border-b border-[#182D3B]/10 bg-white/96 pt-[env(safe-area-inset-top)] shadow-[0_4px_18px_rgba(24,45,59,.05)] backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-3 px-4">
            <Link to="/" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F8F5EF] p-1 shadow-sm" aria-label="Início">
              <picture><source srcSet={logoWebp} type="image/webp" /><img src={logoUrl} alt="" aria-hidden="true" className="h-full w-full object-contain" /></picture>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-[#182D3B]">Excursão das Comitivas</p>
              <p className="truncate text-[11px] font-semibold text-[#182D3B]/48">Seu aplicativo de viagem</p>
            </div>
            {user ? (
              <Link to="/minha-conta" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#851F32] font-black text-white" aria-label="Minha conta">{user.nome.charAt(0).toUpperCase()}</Link>
            ) : !isLoading ? (
              <Link to="/login" className="rounded-full bg-[#851F32] px-4 py-2 text-xs font-extrabold text-white">Entrar</Link>
            ) : null}
          </div>
        </header>
      ) : (
        <>
          <header className="sticky top-0 z-50 border-b border-[#182D3B]/10 bg-[#F8F5EF]/95 shadow-[0_4px_20px_rgba(24,45,59,.035)] backdrop-blur-xl">
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
              <div className="grid min-h-[96px] grid-cols-[94px_1fr_auto] items-center gap-3 sm:min-h-[108px] sm:grid-cols-[116px_1fr_auto] sm:gap-6">
                <Link to="/" className="group flex w-[94px] flex-col items-center justify-center gap-0.5 sm:w-[116px]" onClick={fecharMenu} aria-label="Excursão das Comitivas — início">
                  <div className="shrink-0 rounded-full border border-[#182D3B]/10 bg-white p-1 shadow-[0_10px_26px_rgba(24,45,59,.1)] transition group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_rgba(24,45,59,.14)] sm:p-1.5">
                    <picture><source srcSet={logoWebp} type="image/webp" /><img src={logoUrl} alt="" aria-hidden="true" className="h-14 w-14 object-contain sm:h-[76px] sm:w-[76px] lg:h-20 lg:w-20" width="80" height="80" /></picture>
                  </div>
                  <span className="max-w-[112px] text-center font-editorial text-[0.58rem] font-bold leading-[1.05] tracking-[0.01em] text-[#182D3B] sm:max-w-[132px] sm:text-[0.68rem]">Excursão das Comitivas</span>
                </Link>

                <nav className="hidden items-center justify-self-center gap-5 text-[0.83rem] font-semibold text-[#182D3B]/80 xl:gap-7 xl:text-sm lg:flex" aria-label="Navegação principal">
                  <Link to="/eventos" className="whitespace-nowrap transition hover:text-[#851F32]">Excursões</Link>
                  <Link to="/historia" className="whitespace-nowrap transition hover:text-[#851F32]">Nossa História</Link>
                  <Link to="/galeria" className="whitespace-nowrap transition hover:text-[#851F32]">Galeria</Link>
                  <Link to="/avaliacoes" className="whitespace-nowrap transition hover:text-[#851F32]">Avaliações</Link>
                  <Link to="/regras" className="whitespace-nowrap transition hover:text-[#851F32]">Regras</Link>
                  <Link to="/aplicativo" className="inline-flex items-center gap-1.5 whitespace-nowrap transition hover:text-[#851F32]"><Download size={15} />Aplicativo</Link>
                </nav>

                <nav className="hidden items-center justify-self-end gap-3 lg:flex" aria-label="Conta">
                  {user ? (
                    <>
                      <Link to="/minha-conta" className="text-sm font-bold text-[#182D3B] transition hover:text-[#851F32]">Minha conta</Link>
                      {(['admin', 'dev', 'vendedor'].includes(user.tipo)) && <Link to="/admin" className="rounded-full border border-[#182D3B]/15 px-4 py-2 text-sm font-bold text-[#182D3B] transition hover:border-[#851F32]/30 hover:text-[#851F32]">{user.tipo === 'dev' ? 'Painel DEV' : user.tipo === 'admin' ? 'Painel' : 'Meu painel'}</Link>}
                      <div className="flex items-center gap-2 border-l border-[#182D3B]/15 pl-3 text-[#182D3B]/75"><UserIcon size={17} /><span className="hidden max-w-28 truncate text-sm xl:inline">{user.nome}</span><button onClick={handleLogout} className="rounded-full p-2 transition hover:bg-[#182D3B]/5 hover:text-[#851F32]" aria-label="Sair"><LogOut size={17} /></button></div>
                    </>
                  ) : isLoading ? <span className="text-sm text-[#182D3B]/55">Verificando sessão…</span> : <><Link to="/login" className="text-sm font-bold text-[#182D3B] hover:text-[#851F32]">Entrar</Link><Link to="/cadastro" className="rounded-full bg-[#851F32] px-5 py-2.5 text-sm font-extrabold text-white">Quero viajar</Link></>}
                </nav>

                <div className="flex shrink-0 items-center justify-self-end gap-2 lg:hidden">
                  <Link to="/aplicativo" onClick={fecharMenu} className="hidden min-h-10 items-center gap-1.5 rounded-full border border-[#851F32]/15 bg-white px-3 text-xs font-extrabold text-[#851F32] shadow-sm min-[520px]:inline-flex" aria-label="Instalar aplicativo"><Download size={15} />Instalar app</Link>
                  <button type="button" className="rounded-full border border-[#182D3B]/10 bg-white p-2.5 text-[#182D3B] shadow-sm" onClick={() => setMenuAberto((aberto) => !aberto)} aria-expanded={menuAberto} aria-controls="navegacao-publica-mobile" aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}>{menuAberto ? <X size={22} /> : <Menu size={22} />}</button>
                </div>
              </div>

              {menuAberto && (
                <nav id="navegacao-publica-mobile" className="space-y-1 border-t border-[#182D3B]/10 py-4 text-sm text-[#182D3B] lg:hidden" aria-label="Navegação móvel">
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    <Link to="/eventos" onClick={fecharMenu} className="rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Excursões</Link>
                    <Link to="/historia" onClick={fecharMenu} className="rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Nossa História</Link>
                    <Link to="/galeria" onClick={fecharMenu} className="rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Galeria</Link>
                    <Link to="/avaliacoes" onClick={fecharMenu} className="rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Avaliações</Link>
                    <Link to="/regras" onClick={fecharMenu} className="rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Regras</Link>
                    <Link to="/aplicativo" onClick={fecharMenu} className="flex items-center gap-2 rounded-xl px-3 py-2.5 font-bold text-[#851F32] hover:bg-white"><Download size={16} />Instalar aplicativo</Link>
                  </div>
                  {user ? <><Link to="/minha-conta" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Minha conta</Link>{(['admin', 'dev', 'vendedor'].includes(user.tipo)) && <Link to="/admin" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-bold text-[#851F32] hover:bg-white">Painel administrativo</Link>}<button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold hover:bg-white"><LogOut size={16} />Sair</button></> : <div className="grid grid-cols-2 gap-2 pt-3"><Link to="/login" onClick={fecharMenu} className="rounded-full border border-[#182D3B]/20 px-3 py-2.5 text-center font-bold">Entrar</Link><Link to="/cadastro" onClick={fecharMenu} className="rounded-full bg-[#851F32] px-3 py-2.5 text-center font-bold text-white">Quero viajar</Link></div>}
                </nav>
              )}
            </div>
          </header>

          <div className="border-b border-[#851F32]/10 bg-white px-4 py-2.5 lg:hidden">
            <PwaInstallButton className="mx-auto flex min-h-10 w-full max-w-md items-center justify-center gap-2 rounded-xl bg-[#851F32] px-4 text-sm font-semibold text-white shadow-sm" />
          </div>
        </>
      )}

      <main id="conteudo-principal" className={`min-w-0 flex-1 ${modoApp ? 'pb-[calc(78px+env(safe-area-inset-bottom))]' : ''}`} tabIndex={-1}><Outlet /></main>

      {!modoApp && (
        <footer className="bg-[#182D3B] py-16 text-white sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-[1.25fr_1fr_1fr] lg:px-8">
            <div><picture className="inline-block"><source srcSet={logoBrancaWebp} type="image/webp" /><img src={logoBranca} alt="Excursão das Comitivas" className="h-20 w-20 object-contain" loading="lazy" width="80" height="80" /></picture><p className="mt-5 max-w-sm text-sm leading-7 text-white/70">Desde 2015, conectando pessoas a Barretos com organização, acolhimento e uma experiência de viagem pensada do início ao fim.</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D6A6AE]">Informações</p><div className="mt-5 grid gap-3 text-sm text-white/75"><Link to="/regras" className="transition hover:text-white">Regras de convivência</Link><Link to="/privacidade" className="transition hover:text-white">Privacidade</Link><Link to="/termos" className="transition hover:text-white">Termos de contratação</Link><Link to="/cancelamento" className="transition hover:text-white">Cancelamento</Link><Link to="/aplicativo" className="inline-flex items-center gap-2 font-semibold text-white transition hover:text-[#D6A6AE]"><Download size={16} />Instalar aplicativo</Link></div></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D6A6AE]">Fale com a equipe</p><div className="mt-5 grid gap-3 text-sm text-white/75"><a href="https://wa.me/5561994459086" target="_blank" rel="noopener noreferrer" className="transition hover:text-white">WhatsApp: (61) 99445-9086</a><a href="mailto:atendimento@excursaodascomitivas.com.br" className="break-all transition hover:text-white">atendimento@excursaodascomitivas.com.br</a><a href="https://instagram.com/excurssaodascomitivas" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-white"><Instagram size={17} />@excurssaodascomitivas</a></div></div>
          </div>
          <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 px-4 pt-6 text-xs text-white/50 sm:px-6 lg:px-8">&copy; {new Date().getFullYear()} Excursão das Comitivas. Todos os direitos reservados.</div>
        </footer>
      )}

      {!modoApp && <WhatsAppFloatButton />}
      {modoApp && <AppBottomNav logado={Boolean(user)} />}
    </div>
  );
}
