import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User as UserIcon, Instagram } from 'lucide-react';
import logoUrl from '../assets/brand/logo.png';

const WHATSAPP_NUMERO = import.meta.env.VITE_WHATSAPP_NUMERO || '';

function WhatsAppFloatButton() {
  if (!WHATSAPP_NUMERO) return null;
  const link = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent('Olá! Quero saber mais sobre a excursão para Barretos.')}`;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 bg-[#25D366] hover:bg-[#1ebe57] text-white rounded-full p-4 shadow-lg flex items-center justify-center transition-transform hover:scale-110"
      aria-label="Fale conosco no WhatsApp"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.39a9.9 9.9 0 0 0 4.69 1.19h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.15.83.84-3.07-.19-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.53 3.7-8.22 8.25-8.22 4.55 0 8.25 3.69 8.25 8.22 0 4.53-3.7 8.25-8.25 8.25z"/>
      </svg>
    </a>
  );
}

export function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/" className="flex items-center gap-2">
              <div className="bg-white rounded-full p-1">
                <img src={logoUrl} alt="Excursão das Comitivas" className="h-8 w-8 object-contain" />
              </div>
              <span className="font-bold text-xl tracking-tight">Excursão das Comitivas</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link to="/eventos" className="hover:text-accent transition-colors">Excursões</Link>
              <Link to="/historia" className="hover:text-accent transition-colors">Nossa História</Link>
              <Link to="/avaliacoes" className="hover:text-accent transition-colors">Avaliações</Link>
            </nav>

            <nav className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-4">
                  <Link to="/minhas-reservas" className="hover:text-accent transition-colors">
                    Minhas Reservas
                  </Link>
                  {(user.tipo === 'admin' || user.tipo === 'vendedor') && (
                    <Link to="/admin" className="hover:text-accent transition-colors font-semibold">
                      Painel {user.tipo === 'admin' ? 'Admin' : 'Vendedor'}
                    </Link>
                  )}
                  <div className="flex items-center gap-2 border-l border-white/20 pl-4">
                    <UserIcon size={18} />
                    <span className="text-sm font-medium">{user.nome}</span>
                    <button onClick={handleLogout} className="ml-2 p-1 hover:bg-white/10 rounded-md transition-colors">
                      <LogOut size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Link to="/login" className="hover:text-accent transition-colors">
                    Entrar
                  </Link>
                  <Link to="/cadastro" className="bg-white text-primary px-4 py-2 rounded-md font-medium hover:bg-gray-100 transition-colors">
                    Cadastrar
                  </Link>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="bg-secondary text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
          <a
            href="https://instagram.com/excurssaodascomitivas"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium hover:text-accent transition-colors"
          >
            <Instagram size={18} /> @excurssaodascomitivas
          </a>
          <p className="text-sm text-gray-300">
            &copy; {new Date().getFullYear()} Excursão das Comitivas. Todos os direitos reservados.
          </p>
        </div>
      </footer>

      <WhatsAppFloatButton />
    </div>
  );
}
