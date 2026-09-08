import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { AdminLayout } from './layouts/AdminLayout';

const Login = lazy(() => import('./pages/Login'));
const PasswordReset = lazy(() => import('./pages/PasswordReset'));
const Cadastro = lazy(() => import('./pages/Cadastro'));
const ConfirmarEmail = lazy(() => import('./pages/ConfirmarEmail'));
const ConviteAcesso = lazy(() => import('./pages/ConviteAcesso'));
const Eventos = lazy(() => import('./pages/Eventos'));
const Home = lazy(() => import('./pages/publico/Home'));
const Historia = lazy(() => import('./pages/publico/Historia'));
const AvaliacoesPublicas = lazy(() => import('./pages/publico/AvaliacoesPublicas'));
const Regras = lazy(() => import('./pages/publico/Regras'));
const Galeria = lazy(() => import('./pages/publico/Galeria'));
const Aplicativo = lazy(() => import('./pages/publico/Aplicativo'));
const Legal = lazy(() => import('./pages/publico/Legal'));
const ConfiguradorPacote = lazy(() => import('./pages/cliente/ConfiguradorPacote'));
const Checkout = lazy(() => import('./pages/cliente/Checkout'));
const Confirmacao = lazy(() => import('./pages/cliente/Confirmacao'));
const MinhaConta = lazy(() => import('./pages/cliente/MinhaConta'));
const DadosCadastrais = lazy(() => import('./pages/cliente/DadosCadastrais'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Vendas = lazy(() => import('./pages/admin/Vendas'));
const Reservas = lazy(() => import('./pages/admin/Reservas'));
const Clientes = lazy(() => import('./pages/admin/Clientes'));
const ClienteFicha = lazy(() => import('./pages/admin/ClienteFicha'));
const Contratos = lazy(() => import('./pages/admin/Contratos'));
const Pagamentos = lazy(() => import('./pages/admin/Pagamentos'));
const Configuracoes = lazy(() => import('./pages/admin/Configuracoes'));
const Cupons = lazy(() => import('./pages/admin/Cupons'));
const Jornada = lazy(() => import('./pages/admin/Jornada'));
const EventosAdmin = lazy(() => import('./pages/admin/Eventos'));
const Relatorios = lazy(() => import('./pages/admin/Relatorios'));
const Comissoes = lazy(() => import('./pages/admin/Comissoes'));
const EquipeAcessos = lazy(() => import('./pages/admin/EquipeAcessos'));
const GatewayPagamento = lazy(() => import('./pages/admin/GatewayPagamento'));
const Boletos = lazy(() => import('./pages/admin/Boletos'));
const Conteudo = lazy(() => import('./pages/admin/Conteudo'));

// Proteção de rotas
const ProtectedRoute = ({ children, roles }: { children: React.ReactNode, roles?: string[] }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  
  if (!user) {
    const destino = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(destino)}`} replace />;
  }
  
  if (roles && !roles.includes(user.tipo)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function RouteEffects() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  const indexavel = /^(?:\/$|\/(?:historia|galeria|avaliacoes|regras|eventos|aplicativo|privacidade|termos|cancelamento)\/?$|\/(?:excursao|excursoes)\/[^/]+\/?$)/.test(location.pathname);

  return indexavel ? null : (
    <Helmet>
      <meta name="robots" content="noindex,nofollow" />
    </Helmet>
  );
}

function AppRoutes() {
  return (
    <>
    <RouteEffects />
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#fffaf5] text-sm font-semibold text-secondary">Carregando a experiência da comitiva...</div>}>
    <Routes>
      {/* Rotas Públicas */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/historia" element={<Historia />} />
        <Route path="/galeria" element={<Galeria />} />
        <Route path="/avaliacoes" element={<AvaliacoesPublicas />} />
        <Route path="/regras" element={<Regras />} />
        <Route path="/eventos" element={<Eventos />} />
        <Route path="/aplicativo" element={<Aplicativo />} />
        <Route path="/excursoes/:eventoId" element={<Eventos />} />
        <Route path="/excursao/:eventoSlug" element={<Eventos />} />
        <Route path="/privacidade" element={<Legal />} />
        <Route path="/termos" element={<Legal />} />
        <Route path="/cancelamento" element={<Legal />} />
        <Route path="/login" element={<Login />} />
        <Route path="/redefinir-senha" element={<PasswordReset />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/confirmar-email" element={<ConfirmarEmail />} />
        <Route path="/convite/:token" element={<ConviteAcesso />} />
        
        {/* O configurador é público; a autenticação só é pedida ao reservar. */}
        <Route path="/pacote/:loteId" element={<ConfiguradorPacote />} />
        <Route path="/checkout/:reservaId" element={
          <ProtectedRoute>
            <Checkout />
          </ProtectedRoute>
        } />
        <Route path="/confirmacao/:reservaId" element={
          <ProtectedRoute>
            <Confirmacao />
          </ProtectedRoute>
        } />
        <Route path="/minha-conta" element={
          <ProtectedRoute>
            <MinhaConta />
          </ProtectedRoute>
        } />
        <Route path="/minhas-reservas" element={
          <ProtectedRoute>
            <Navigate to="/minha-conta" replace />
          </ProtectedRoute>
        } />
        <Route path="/meus-dados" element={
          <ProtectedRoute>
            <DadosCadastrais />
          </ProtectedRoute>
        } />
      </Route>

      {/* Rotas Administrativas */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['admin', 'dev', 'vendedor']}>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="vendas" element={<ProtectedRoute roles={['admin', 'dev', 'vendedor']}><Vendas /></ProtectedRoute>} />
        <Route path="reservas" element={<ProtectedRoute roles={['admin', 'dev', 'vendedor']}><Reservas /></ProtectedRoute>} />
        <Route path="contratos" element={
          <ProtectedRoute roles={['admin', 'dev', 'vendedor']}>
            <Contratos />
          </ProtectedRoute>
        } />
        <Route path="pagamentos" element={<ProtectedRoute roles={['admin', 'dev']}><Pagamentos /></ProtectedRoute>} />
        <Route path="boletos" element={<ProtectedRoute roles={['admin', 'dev']}><Boletos /></ProtectedRoute>} />
        <Route path="equipe" element={<ProtectedRoute roles={['admin', 'dev']}><EquipeAcessos /></ProtectedRoute>} />
        <Route path="gateway" element={<ProtectedRoute roles={['dev']}><GatewayPagamento /></ProtectedRoute>} />
        <Route path="clientes" element={
          <ProtectedRoute roles={['admin', 'dev']}>
            <Clientes />
          </ProtectedRoute>
        } />
        <Route path="clientes/:clienteId" element={
          <ProtectedRoute roles={['admin', 'dev']}>
            <ClienteFicha />
          </ProtectedRoute>
        } />
        <Route path="configuracoes" element={
          <ProtectedRoute roles={['admin', 'dev']}>
            <Configuracoes />
          </ProtectedRoute>
        } />
        <Route path="jornada" element={<Jornada />} />
        <Route path="eventos" element={
          <ProtectedRoute roles={['admin', 'dev']}>
            <EventosAdmin />
          </ProtectedRoute>
        } />
        <Route path="conteudo" element={<ProtectedRoute roles={['admin', 'dev']}><Conteudo /></ProtectedRoute>} />
        <Route path="relatorios" element={
          <ProtectedRoute roles={['admin', 'dev']}>
            <Relatorios />
          </ProtectedRoute>
        } />
        <Route path="comissoes" element={
          <ProtectedRoute roles={['admin', 'dev']}>
            <Comissoes />
          </ProtectedRoute>
        } />
        <Route path="cupons" element={
          <ProtectedRoute roles={['admin', 'dev']}>
            <Cupons />
          </ProtectedRoute>
        } />
      </Route>
    </Routes>
    </Suspense>
    </>
  );
}

export function App() {
  return (
    <HelmetProvider>
      <Router>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
    </HelmetProvider>
  );
}

export default App;
