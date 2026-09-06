import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Instagram, LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logoUrl from '../assets/brand/logo.png';
import logoWebp from '../assets/brand/logo.webp';
import logoBranca from '../assets/brand/logo-branca.png';
import logoBrancaWebp from '../assets/brand/logo-branca.webp';

const WHATSAPP_NUMERO = import.meta.env.VITE_WHATSAPP_NUMERO || '5561994459086';

function WhatsAppFloatButton() {
  const link = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent('Olá! Quero saber mais sobre a Excursão das Comitivas para Barretos.')}`;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#128C4A] text-white shadow-[0_14px_34px_rgba(18,140,74,0.28)] transition hover:-translate-y-0.5 hover:bg-[#0f7b40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#128C4A] focus-visible:ring-offset-4"
      aria-label="Fale conosco no WhatsApp"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="27" height="27" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.39a9.9 9.9 0 0 0 4.69 1.19h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.15.83.84-3.07-.19-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.53 3.7-8.22 8.25-8.22 4.55 0 8.25 3.69 8.25 8.22 0 4.53-3.7 8.25-8.25 8.25z" />
      </svg>
    </a>
  );
}

export function MainLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  const handleLogout = () => {
    logout();
    setMenuAberto(false);
    navigate('/login');
  };

  const fecharMenu = () => setMenuAberto(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F5EF] text-[#182D3B]">
      <a
        href="#conteudo-principal"
        className="fixed left-4 top-3 z-[70] -translate-y-20 rounded-full bg-[#182D3B] px-4 py-2 text-sm font-bold text-white shadow-lg transition focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-50 border-b border-[#182D3B]/10 bg-[#F8F5EF]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-[88px] items-center justify-between gap-4">
            <Link to="/" className="flex min-w-0 items-center gap-3" onClick={fecharMenu} aria-label="Excursão das Comitivas — início">
              <div className="shrink-0 rounded-full border border-[#182D3B]/10 bg-white p-1.5 shadow-sm">
                <picture>
                  <source srcSet={logoWebp} type="image/webp" />
                  <img src={logoUrl} alt="" aria-hidden="true" className="h-9 w-9 object-contain" width="36" height="36" />
                </picture>
              </div>
              <span className="hidden truncate font-editorial text-[1.08rem] font-bold tracking-[-0.02em] text-[#182D3B] sm:block lg:text-xl">
                Excursão das Comitivas
              </span>
            </Link>

            <nav className="hidden items-center gap-6 text-sm font-semibold text-[#182D3B]/80 lg:flex" aria-label="Navegação principal">
              <Link to="/eventos" className="transition hover:text-[#851F32]">Excursões</Link>
              <Link to="/historia" className="transition hover:text-[#851F32]">Nossa História</Link>
              <Link to="/galeria" className="transition hover:text-[#851F32]">Galeria</Link>
              <Link to="/avaliacoes" className="transition hover:text-[#851F32]">Avaliações</Link>
              <Link to="/regras" className="transition hover:text-[#851F32]">Regras</Link>
            </nav>

            <nav className="hidden items-center gap-3 lg:flex" aria-label="Conta">
              {user ? (
                <>
                  <Link to="/minhas-reservas" className="text-sm font-bold text-[#182D3B] transition hover:text-[#851F32]">Minha conta</Link>
                  {(user.tipo === 'admin' || user.tipo === 'vendedor') && (
                    <Link to="/admin" className="rounded-full border border-[#182D3B]/15 px-4 py-2 text-sm font-bold text-[#182D3B] transition hover:border-[#851F32]/30 hover:text-[#851F32]">
                      {user.tipo === 'admin' ? 'Painel' : 'Meu painel'}
                    </Link>
                  )}
                  <div className="flex items-center gap-2 border-l border-[#182D3B]/15 pl-3 text-[#182D3B]/75">
                    <UserIcon size={17} />
                    <span className="hidden max-w-28 truncate text-sm xl:inline">{user.nome}</span>
                    <button onClick={handleLogout} className="rounded-full p-2 transition hover:bg-[#182D3B]/5 hover:text-[#851F32]" aria-label="Sair"><LogOut size={17} /></button>
                  </div>
                </>
              ) : isLoading ? (
                <span className="text-sm text-[#182D3B]/55" aria-live="polite">Verificando sessão…</span>
              ) : (
                <>
                  <Link to="/login" className="text-sm font-bold text-[#182D3B] hover:text-[#851F32]">Entrar</Link>
                  <Link to="/cadastro" className="rounded-full bg-[#851F32] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(133,31,50,0.16)] transition hover:bg-[#6f1929]">Quero viajar</Link>
                </>
              )}
            </nav>

            <button
              type="button"
              className="shrink-0 rounded-full border border-[#182D3B]/10 bg-white p-2.5 text-[#182D3B] shadow-sm transition hover:border-[#851F32]/25 hover:text-[#851F32] lg:hidden"
              onClick={() => setMenuAberto((aberto) => !aberto)}
              aria-expanded={menuAberto}
              aria-controls="navegacao-publica-mobile"
              aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            >
              {menuAberto ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          {menuAberto && (
            <nav id="navegacao-publica-mobile" className="space-y-1 border-t border-[#182D3B]/10 py-4 text-sm text-[#182D3B] lg:hidden" aria-label="Navegação móvel">
              <Link to="/eventos" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Excursões</Link>
              <Link to="/historia" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Nossa História</Link>
              <Link to="/galeria" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Galeria</Link>
              <Link to="/avaliacoes" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Avaliações</Link>
              <Link to="/regras" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Regras de convivência</Link>
              {user ? (
                <>
                  <Link to="/minhas-reservas" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-semibold hover:bg-white">Minha conta</Link>
                  {(user.tipo === 'admin' || user.tipo === 'vendedor') && <Link to="/admin" onClick={fecharMenu} className="block rounded-xl px-3 py-2.5 font-bold text-[#851F32] hover:bg-white">Painel administrativo</Link>}
                  <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold hover:bg-white"><LogOut size={16} />Sair</button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-3">
                  <Link to="/login" onClick={fecharMenu} className="rounded-full border border-[#182D3B]/20 px-3 py-2.5 text-center font-bold">Entrar</Link>
                  <Link to="/cadastro" onClick={fecharMenu} className="rounded-full bg-[#851F32] px-3 py-2.5 text-center font-bold text-white">Quero viajar</Link>
                </div>
              )}
            </nav>
          )}
        </div>
      </header>

      <main id="conteudo-principal" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="bg-[#182D3B] py-14 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-[1.25fr_1fr_1fr] lg:px-8">
          <div>
            <picture className="inline-block">
              <source srcSet={logoBrancaWebp} type="image/webp" />
              <img src={logoBranca} alt="Excursão das Comitivas" className="h-20 w-20 object-contain" loading="lazy" width="80" height="80" />
            </picture>
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">Desde 2015, conectando pessoas a Barretos com organização, acolhimento e uma experiência de viagem pensada do início ao fim.</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D6A6AE]">Informações</p>
            <div className="mt-5 grid gap-3 text-sm text-white/75">
              <Link to="/regras" className="transition hover:text-white">Regras de convivência</Link>
              <Link to="/privacidade" className="transition hover:text-white">Privacidade</Link>
              <Link to="/termos" className="transition hover:text-white">Termos de contratação</Link>
              <Link to="/cancelamento" className="transition hover:text-white">Cancelamento</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D6A6AE]">Fale com a equipe</p>
            <div className="mt-5 grid gap-3 text-sm text-white/75">
              <a href="https://wa.me/5561994459086" target="_blank" rel="noopener noreferrer" className="transition hover:text-white">WhatsApp: (61) 99445-9086</a>
              <a href="mailto:excursaodascomitivas@gmail.com" className="break-all transition hover:text-white">excursaodascomitivas@gmail.com</a>
              <a href="https://instagram.com/excurssaodascomitivas" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-white"><Instagram size={17} /> @excurssaodascomitivas</a>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 px-4 pt-6 text-xs text-white/50 sm:px-6 lg:px-8">&copy; {new Date().getFullYear()} Excursão das Comitivas. Todos os direitos reservados.</div>
      </footer>

      <WhatsAppFloatButton />
    </div>
  );
}
