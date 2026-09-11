import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  CalendarDays,
  Ticket,
  Users,
  UserCog,
  FileText,
  Settings,
  LogOut,
  ArrowLeft,
  PartyPopper,
  BarChart3,
  Percent,
  ShoppingCart,
  CreditCard,
  WalletCards,
  KeyRound,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import iconUrl from '../assets/brand/icon.svg';

type Papel = 'cliente' | 'vendedor' | 'admin' | 'dev';

type NavItem = {
  name: string;
  path: string;
  icon: React.ComponentType<any>;
  roles: Papel[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [
      { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, roles: ['admin', 'dev', 'vendedor'] },
    ],
  },
  {
    label: 'Comercial & clientes',
    items: [
      { name: 'Vendas internas', path: '/admin/vendas', icon: ShoppingCart, roles: ['admin', 'dev', 'vendedor'] },
      { name: 'Clientes', path: '/admin/clientes', icon: UserCog, roles: ['admin', 'dev'] },
      { name: 'Jornada (CRM)', path: '/admin/jornada', icon: Users, roles: ['admin', 'dev', 'vendedor'] },
      { name: 'Cupons', path: '/admin/cupons', icon: Ticket, roles: ['admin', 'dev'] },
    ],
  },
  {
    label: 'Operação da excursão',
    items: [
      { name: 'Eventos & Lotes', path: '/admin/eventos', icon: PartyPopper, roles: ['admin', 'dev'] },
      { name: 'Reservas', path: '/admin/reservas', icon: CalendarDays, roles: ['admin', 'dev', 'vendedor'] },
      { name: 'Contratos', path: '/admin/contratos', icon: FileText, roles: ['admin', 'dev', 'vendedor'] },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { name: 'Pagamentos', path: '/admin/pagamentos', icon: CreditCard, roles: ['admin', 'dev'] },
      { name: 'Boletos bancários', path: '/admin/boletos', icon: WalletCards, roles: ['admin', 'dev'] },
      { name: 'Comissões', path: '/admin/comissoes', icon: Percent, roles: ['admin', 'dev'] },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { name: 'Relatórios', path: '/admin/relatorios', icon: BarChart3, roles: ['admin', 'dev'] },
      { name: 'Configurações', path: '/admin/configuracoes', icon: Settings, roles: ['admin', 'dev'] },
    ],
  },
  {
    label: 'Sistema & segurança',
    items: [
      { name: 'Equipe & Acessos', path: '/admin/equipe', icon: ShieldCheck, roles: ['admin', 'dev'] },
      { name: 'Gateway', path: '/admin/gateway', icon: KeyRound, roles: ['dev'] },
    ],
  },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuAberto, setMenuAberto] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const papelLabel = user?.tipo === 'dev' ? 'DEV' : user?.tipo === 'admin' ? 'Admin' : 'Vendedor';
  const papel = user?.tipo as Papel | undefined;

  const gruposVisiveis = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => papel && item.roles.includes(papel)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="admin-shell flex min-h-screen bg-[#F8F5EF]">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col bg-[#182D3B] text-white md:flex">
        <div className="flex h-[76px] shrink-0 items-center border-b border-white/10 px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <div className="shrink-0 rounded-full bg-white p-1.5 shadow-sm">
              <img src={iconUrl} alt="Comitiva" className="h-7 w-7" />
            </div>
            <span className="truncate font-editorial text-xl font-bold">Painel {papelLabel}</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <nav className="space-y-6" aria-label="Navegação administrativa">
            {gruposVisiveis.map((group, groupIndex) => (
              <section
                key={group.label}
                aria-labelledby={`admin-nav-${groupIndex}`}
                className={clsx(groupIndex > 0 && 'border-t border-white/8 pt-4')}
              >
                <p
                  id={`admin-nav-${groupIndex}`}
                  className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45"
                >
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path
                      || (item.path !== '/admin' && location.pathname.startsWith(`${item.path}/`));

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        aria-current={isActive ? 'page' : undefined}
                        className={clsx(
                          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                          isActive
                            ? 'bg-white/12 font-semibold text-white shadow-sm'
                            : 'text-white/72 hover:bg-white/7 hover:text-white',
                        )}
                      >
                        <Icon
                          size={18}
                          className={clsx(
                            'shrink-0 transition-colors',
                            isActive ? 'text-white' : 'text-white/62 group-hover:text-white',
                          )}
                        />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#182D3B] p-4">
          <div className="mb-2 flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold">
              {user?.nome.charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{user?.nome}</p>
              <p className="truncate text-xs text-gray-400">{user?.email}</p>
            </div>
          </div>
          <Link to="/" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-gray-300 transition-colors hover:bg-white/5 hover:text-white">
            <ArrowLeft size={20} />
            Voltar ao site
          </Link>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[#F8F5EF]">
        <header className="flex h-[68px] items-center justify-between border-b border-[#182D3B]/10 bg-white px-4 sm:px-6 md:hidden">
          <span className="font-editorial text-xl font-bold text-secondary">Painel {papelLabel}</span>
          <div className="flex items-center gap-2 text-sm">
            <span className="max-w-32 truncate text-gray-500">{user?.nome}</span>
            <button onClick={() => setMenuAberto((aberto) => !aberto)} className="rounded-full border border-[#182D3B]/10 p-2 text-gray-600 hover:bg-gray-100" aria-expanded={menuAberto} aria-controls="admin-nav-mobile" aria-label={menuAberto ? 'Fechar menu administrativo' : 'Abrir menu administrativo'}>
              {menuAberto ? <X size={18} /> : <Menu size={18} />}
            </button>
            <button onClick={handleLogout} className="rounded-md p-2 text-gray-600 hover:bg-gray-100" aria-label="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {menuAberto && (
          <div id="admin-nav-mobile" className="border-b border-[#182D3B]/10 bg-white px-4 py-4 shadow-sm md:hidden">
            <nav className="space-y-4" aria-label="Navegação administrativa móvel">
              {gruposVisiveis.map((group) => (
                <section key={group.label}>
                  <p className="mb-1.5 px-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#851F32]">{group.label}</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(`${item.path}/`));
                      return <Link key={item.path} to={item.path} onClick={() => setMenuAberto(false)} className={clsx('flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold', isActive ? 'bg-[#851F32] text-white' : 'text-[#182D3B] hover:bg-[#F8F5EF]')}><Icon size={17} />{item.name}</Link>;
                    })}
                  </div>
                </section>
              ))}
            </nav>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
