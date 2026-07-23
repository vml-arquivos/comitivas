import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User as UserIcon } from 'lucide-react';

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
                <img src="/src/assets/brand/icon.svg" alt="Comitiva Prime" className="h-8 w-8" />
              </div>
              <span className="font-bold text-xl tracking-tight">Comitiva Prime</span>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-300">
            &copy; {new Date().getFullYear()} Comitiva - Excursões e Eventos. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
