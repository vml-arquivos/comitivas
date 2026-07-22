import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Ticket, 
  Users, 
  LogOut,
  ArrowLeft
} from 'lucide-react';
import { clsx } from 'clsx';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, roles: ['admin', 'vendedor'] },
    { name: 'Reservas', path: '/admin/reservas', icon: CalendarDays, roles: ['admin', 'vendedor'] },
    { name: 'Jornada (CRM)', path: '/admin/jornada', icon: Users, roles: ['admin', 'vendedor'] },
    { name: 'Cupons', path: '/admin/cupons', icon: Ticket, roles: ['admin'] },
  ];

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-secondary text-white flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-white rounded-full p-1">
              <img src="/src/assets/brand/icon.svg" alt="Comitiva" className="h-6 w-6" />
            </div>
            <span className="font-bold text-lg">Painel {user?.tipo === 'admin' ? 'Admin' : 'Vendedor'}</span>
          </Link>
        </div>
        
        <div className="p-4 flex-1">
          <nav className="space-y-1">
            {navItems.filter(item => user && item.roles.includes(user.tipo)).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                    isActive ? "bg-white/10 text-white font-medium" : "text-gray-300 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon size={20} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold">
              {user?.nome.charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.nome}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors w-full">
            <ArrowLeft size={20} />
            Voltar ao site
          </Link>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors w-full text-left mt-1"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 md:hidden">
          <span className="font-bold text-lg text-secondary">Painel {user?.tipo === 'admin' ? 'Admin' : 'Vendedor'}</span>
        </header>
        
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
