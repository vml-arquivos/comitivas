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
      className="fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full bg-[#25D366] p-4 text-white shadow-2xl transition-transform hover:scale-110 hover:bg-[#1ebe57] focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
      aria-label="Fale conosco no WhatsApp"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.39a9.9 9.9 0 0 0 4.69 1.19h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.15.83.84-3.07-.19-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.53 3.7-8.22 8.25-8.22 4.55 0 8.25 3.69 8.25 8.22 0 4.53-3.7 8.25-8.25 8.25z" />
      </svg>
    </a>
  );
}

export function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  const handleLogout = () => {
    logout();
    setMenuAberto(false);
    navigate('/login');
  };

  const fecharMenu = () => setMenuAberto(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 bg-primary text-white shadow-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link to="/" className="flex min-w-0 items-center gap-2" onClick={fecharMenu}>
              <div className="shrink-0 rounded-full bg-white p-1">
                <picture>
                  <source srcSet={logoWebp} type="image/webp" />
                  <img src={logoUrl} alt="Excursão das Comitivas" className="h-8 w-8 object-contain" />
                </picture>
              </div>
              <span className="truncate text-base font-black tracking-tight sm:text-lg lg:text-xl">Excursão das Comitivas</span>
            </Link>

            <nav className="hidden items-center gap-5 text-sm font-semibold lg:flex">
              <Link to="/eventos" className="transition-colors hover:text-accent">Excursões</Link>
              <Link to="/historia" className="transition-colors hover:text-accent">Nossa História</Link>
              <Link to="/galeria" className="transition-colors hover:text-accent">Galeria</Link>
              <Link to="/avaliacoes" className="transition-colors hover:text-accent">Avaliações</Link>
              <Link to="/regras" className="transition-colors hover:text-accent">Regras</Link>
            </nav>

            <nav className="hidden items-center gap-3 md:flex">
              {user ? (
                <>
                  <Link to="/minhas-reservas" className="text-sm font-semibold transition-colors hover:text-accent">Minhas reservas</Link>
                  {(user.tipo === 'admin' || user.tipo === 'vendedor') && <Link to="/admin" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20">Painel</Link>}
                  <div className="flex items-center gap-2 border-l border-white/20 pl-3">
                    <UserIcon size={17} />
                    <span className="hidden max-w-28 truncate text-sm xl:inline">{user.nome}</span>
                    <button onClick={handleLogout} className="rounded-md p-1.5 transition hover:bg-white/10" aria-label="Sair"><LogOut size={17} /></button>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-sm font-semibold hover:text-accent">Entrar</Link>
                  <Link to="/cadastro" className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-primary transition hover:bg-gray-100">Cadastrar</Link>
                </>
              )}
            </nav>

            <button type="button" className="shrink-0 rounded-lg p-2 transition hover:bg-white/10 md:hidden" onClick={() => setMenuAberto((aberto) => !aberto)} aria-expanded={menuAberto} aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}>
              {menuAberto ? <X size={23} /> : <Menu size={23} />}
            </button>
          </div>

          {menuAberto && (
            <nav className="space-y-1 border-t border-white/15 py-4 text-sm md:hidden">
              <Link to="/eventos" onClick={fecharMenu} className="block rounded-lg px-3 py-2 hover:bg-white/10">Excursões</Link>
              <Link to="/historia" onClick={fecharMenu} className="block rounded-lg px-3 py-2 hover:bg-white/10">Nossa História</Link>
              <Link to="/galeria" onClick={fecharMenu} className="block rounded-lg px-3 py-2 hover:bg-white/10">Galeria</Link>
              <Link to="/avaliacoes" onClick={fecharMenu} className="block rounded-lg px-3 py-2 hover:bg-white/10">Avaliações</Link>
              <Link to="/regras" onClick={fecharMenu} className="block rounded-lg px-3 py-2 hover:bg-white/10">Regras de convivência</Link>
              {user ? (
                <>
                  <Link to="/minhas-reservas" onClick={fecharMenu} className="block rounded-lg px-3 py-2 hover:bg-white/10">Minhas reservas</Link>
                  {(user.tipo === 'admin' || user.tipo === 'vendedor') && <Link to="/admin" onClick={fecharMenu} className="block rounded-lg px-3 py-2 font-bold hover:bg-white/10">Painel administrativo</Link>}
                  <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10"><LogOut size={16} />Sair</button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Link to="/login" onClick={fecharMenu} className="rounded-lg border border-white/25 px-3 py-2 text-center">Entrar</Link>
                  <Link to="/cadastro" onClick={fecharMenu} className="rounded-lg bg-white px-3 py-2 text-center font-bold text-primary">Cadastrar</Link>
                </div>
              )}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="bg-secondary py-10 text-white">
        <div className="mx-auto max-w-7xl space-y-4 px-4 text-center sm:px-6 lg:px-8">
          <picture className="inline-block">
            <source srcSet={logoBrancaWebp} type="image/webp" />
            <img src={logoBranca} alt="Excursão das Comitivas" className="mx-auto h-20 w-20 object-contain" loading="lazy" />
          </picture>
          <a href="https://instagram.com/excurssaodascomitivas" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:text-accent">
            <Instagram size={18} /> @excurssaodascomitivas
          </a>
          <p className="text-sm text-gray-300">&copy; {new Date().getFullYear()} Excursão das Comitivas. Todos os direitos reservados.</p>
        </div>
      </footer>

      <WhatsAppFloatButton />
    </div>
  );
}
