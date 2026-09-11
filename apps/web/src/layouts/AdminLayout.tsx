import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, CalendarDays, Ticket, Users, UserCog, FileText, ImagePlus, Settings, LogOut, ArrowLeft, PartyPopper, BarChart3, Percent, ShoppingCart, CreditCard, WalletCards, KeyRound, Menu, ShieldCheck, X, BusFront, UserRoundCog, ClipboardCheck, BedDouble } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import iconUrl from '../assets/brand/icon.svg';

type Papel = 'cliente' | 'vendedor' | 'admin' | 'dev';

type NavItem = {
  name: string;
  path: string;
  icon: LucideIcon;
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
      {
        name: 'Dashboard',
        path: '/admin',
        icon: LayoutDashboard,
        roles: ['admin', 'dev', 'vendedor'],
      },
    ],
  },
  {
    label: 'Comercial & clientes',
    items: [
      {
        name: 'Vendas internas',
        path: '/admin/vendas',
        icon: ShoppingCart,
        roles: ['admin', 'dev', 'vendedor'],
      },
      {
        name: 'Clientes',
        path: '/admin/clientes',
        icon: UserCog,
        roles: ['admin', 'dev'],
      },
      {
        name: 'Clientes e negociações',
        path: '/admin/jornada',
        icon: Users,
        roles: ['admin', 'dev', 'vendedor'],
      },
      {
        name: 'Solicitações',
        path: '/admin/solicitacoes',
        icon: ClipboardCheck,
        roles: ['admin', 'dev', 'vendedor'],
      },
      {
        name: 'Cupons',
        path: '/admin/cupons',
        icon: Ticket,
        roles: ['admin', 'dev'],
      },
    ],
  },
  {
    label: 'Operação da excursão',
    items: [
      {
        name: 'Viagens e pacotes',
        path: '/admin/eventos',
        icon: PartyPopper,
        roles: ['admin', 'dev'],
      },
      {
        name: 'Transporte e lugares',
        path: '/admin/onibus',
        icon: BusFront,
        roles: ['admin', 'dev'],
      },
      {
        name: 'Hospedagem e quartos',
        path: '/admin/hospedagem',
        icon: BedDouble,
        roles: ['admin', 'dev'],
      },
      {
        name: 'Reservas',
        path: '/admin/reservas',
        icon: CalendarDays,
        roles: ['admin', 'dev', 'vendedor'],
      },
      {
        name: 'Contratos',
        path: '/admin/contratos',
        icon: FileText,
        roles: ['admin', 'dev', 'vendedor'],
      },
      {
        name: 'Galeria e vídeos',
        path: '/admin/conteudo',
        icon: ImagePlus,
        roles: ['admin', 'dev'],
      },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      {
        name: 'Pagamentos',
        path: '/admin/pagamentos',
        icon: CreditCard,
        roles: ['admin', 'dev'],
      },
      {
        name: 'Boletos bancários',
        path: '/admin/boletos',
        icon: WalletCards,
        roles: ['admin', 'dev'],
      },
      {
        name: 'Comissões',
        path: '/admin/comissoes',
        icon: Percent,
        roles: ['admin', 'dev'],
      },
    ],
  },
  {
    label: 'Gestão',
    items: [
      {
        name: 'Relatórios',
        path: '/admin/relatorios',
        icon: BarChart3,
        roles: ['admin', 'dev'],
      },
      {
        name: 'Configurações',
        path: '/admin/configuracoes',
        icon: Settings,
        roles: ['admin', 'dev'],
      },
    ],
  },
  {
    label: 'Sistema & segurança',
    items: [
      {
        name: 'Minha conta',
        path: '/admin/minha-conta',
        icon: UserRoundCog,
        roles: ['admin', 'dev', 'vendedor'],
      },
      {
        name: 'Equipe & Acessos',
        path: '/admin/equipe',
        icon: ShieldCheck,
        roles: ['admin', 'dev'],
      },
      {
        name: 'Gateway',
        path: '/admin/gateway',
        icon: KeyRound,
        roles: ['dev'],
      },
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
    <div className="admin-shell flex min-h-screen w-full min-w-0 overflow-x-clip bg-[#F7F4EE]">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[258px] shrink-0 flex-col bg-[linear-gradient(180deg,#073F50_0%,#062F3D_100%)] text-white md:flex">
        <div className="flex h-[78px] shrink-0 items-center border-b border-white/10 px-5">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <div className="shrink-0 rounded-full bg-white p-1.5 shadow-sm">
              <img src={iconUrl} alt="Comitiva" className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <span className="block truncate font-editorial text-2xl font-bold leading-6">Comitivas</span>
              <span className="mt-0.5 block text-[9px] font-extrabold uppercase tracking-[0.2em] text-white/50">Painel {papelLabel}</span>
            </div>
          </Link>
        </div>

        <div className="admin-scrollbar flex-1 overflow-y-auto px-3 py-4">
          <nav className="space-y-5" aria-label="Navegação administrativa">
            {gruposVisiveis.map((group, groupIndex) => (
              <section key={group.label} aria-labelledby={`admin-nav-${groupIndex}`} className={clsx(groupIndex > 0 && 'border-t border-white/8 pt-4')}>
                <p id={`admin-nav-${groupIndex}`} className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(`${item.path}/`));

                    return (
                      <Link key={item.path} to={item.path} aria-current={isActive ? 'page' : undefined} className={clsx('group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm transition-colors', isActive ? 'bg-white/12 font-semibold text-white shadow-sm before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-[#F07A5F]' : 'text-white/72 hover:bg-white/7 hover:text-white')}>
                        <Icon size={18} className={clsx('shrink-0 transition-colors', isActive ? 'text-[#F49A84]' : 'text-white/62 group-hover:text-white')} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-black/5 p-3">
          <Link to="/admin/minha-conta" className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/[0.08]" title="Editar minha conta">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DF6248] font-bold">{user?.nome.charAt(0)}</div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{user?.nome}</p>
              <p className="truncate text-xs text-gray-400">{user?.email}</p>
            </div>
            <UserRoundCog size={16} className="text-white/45" />
          </Link>
          <Link to="/" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-gray-300 transition-colors hover:bg-white/5 hover:text-white">
            <ArrowLeft size={20} />
            Voltar ao site
          </Link>
          <button onClick={handleLogout} className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-gray-300 transition-colors hover:bg-white/5 hover:text-white">
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[#F7F4EE]">
        <header className="flex h-[68px] items-center justify-between border-b border-[#182D3B]/10 bg-white px-4 sm:px-6 md:hidden">
          <span className="font-editorial text-2xl font-bold text-[#073F50]">
            Comitivas <small className="font-sans text-[10px] uppercase tracking-wider text-slate-400">{papelLabel}</small>
          </span>
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
                      return (
                        <Link key={item.path} to={item.path} onClick={() => setMenuAberto(false)} className={clsx('flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold', isActive ? 'bg-[#DF6248] text-white' : 'text-[#073F50] hover:bg-[#F8F5EF]')}>
                          <Icon size={17} />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>
          </div>
        )}

        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8 xl:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
