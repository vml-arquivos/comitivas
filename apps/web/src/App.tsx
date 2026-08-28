import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { AdminLayout } from './layouts/AdminLayout';

const Login = lazy(() => import('./pages/Login'));
const PasswordReset = lazy(() => import('./pages/PasswordReset'));
const Cadastro = lazy(() => import('./pages/Cadastro'));
const Eventos = lazy(() => import('./pages/Eventos'));
const Home = lazy(() => import('./pages/publico/Home'));
const Historia = lazy(() => import('./pages/publico/Historia'));
const AvaliacoesPublicas = lazy(() => import('./pages/publico/AvaliacoesPublicas'));
const Regras = lazy(() => import('./pages/publico/Regras'));
const Galeria = lazy(() => import('./pages/publico/Galeria'));
const Legal = lazy(() => import('./pages/publico/Legal'));
const ConfiguradorPacote = lazy(() => import('./pages/cliente/ConfiguradorPacote'));
const Checkout = lazy(() => import('./pages/cliente/Checkout'));
const Confirmacao = lazy(() => import('./pages/cliente/Confirmacao'));
const MinhasReservas = lazy(() => import('./pages/cliente/MinhasReservas'));
const DadosCadastrais = lazy(() => import('./pages/cliente/DadosCadastrais'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Reservas = lazy(() => import('./pages/admin/Reservas'));
const Clientes = lazy(() => import('./pages/admin/Clientes'));
const Contratos = lazy(() => import('./pages/admin/Contratos'));
const Configuracoes = lazy(() => import('./pages/admin/Configuracoes'));
const Cupons = lazy(() => import('./pages/admin/Cupons'));
const Jornada = lazy(() => import('./pages/admin/Jornada'));
const EventosAdmin = lazy(() => import('./pages/admin/Eventos'));
const Relatorios = lazy(() => import('./pages/admin/Relatorios'));

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

function AppRoutes() {
  return (
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
        <Route path="/privacidade" element={<Legal />} />
        <Route path="/termos" element={<Legal />} />
        <Route path="/cancelamento" element={<Legal />} />
        <Route path="/login" element={<Login />} />
        <Route path="/redefinir-senha" element={<PasswordReset />} />
        <Route path="/cadastro" element={<Cadastro />} />
        
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
        <Route path="/minhas-reservas" element={
          <ProtectedRoute>
            <MinhasReservas />
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
        <ProtectedRoute roles={['admin', 'vendedor']}>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="reservas" element={<Reservas />} />
        <Route path="contratos" element={
          <ProtectedRoute roles={['admin']}>
            <Contratos />
          </ProtectedRoute>
        } />
        <Route path="clientes" element={
          <ProtectedRoute roles={['admin']}>
            <Clientes />
          </ProtectedRoute>
        } />
        <Route path="configuracoes" element={
          <ProtectedRoute roles={['admin']}>
            <Configuracoes />
          </ProtectedRoute>
        } />
        <Route path="jornada" element={<Jornada />} />
        <Route path="eventos" element={
          <ProtectedRoute roles={['admin']}>
            <EventosAdmin />
          </ProtectedRoute>
        } />
        <Route path="relatorios" element={
          <ProtectedRoute roles={['admin']}>
            <Relatorios />
          </ProtectedRoute>
        } />
        <Route path="cupons" element={
          <ProtectedRoute roles={['admin']}>
            <Cupons />
          </ProtectedRoute>
        } />
      </Route>
    </Routes>
    </Suspense>
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
