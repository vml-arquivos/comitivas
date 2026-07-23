import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Páginas públicas
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import Eventos from './pages/Eventos';
import Home from './pages/publico/Home';
import Historia from './pages/publico/Historia';
import AvaliacoesPublicas from './pages/publico/AvaliacoesPublicas';

// Páginas do cliente
import ConfiguradorPacote from './pages/cliente/ConfiguradorPacote';
import Checkout from './pages/cliente/Checkout';
import Confirmacao from './pages/cliente/Confirmacao';
import MinhasReservas from './pages/cliente/MinhasReservas';

// Páginas do admin/vendedor
import Dashboard from './pages/admin/Dashboard';
import Reservas from './pages/admin/Reservas';
import Cupons from './pages/admin/Cupons';
import Jornada from './pages/admin/Jornada';

// Proteção de rotas
const ProtectedRoute = ({ children, roles }: { children: React.ReactNode, roles?: string[] }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  
  if (!user) return <Navigate to="/login" replace />;
  
  if (roles && !roles.includes(user.tipo)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Rotas Públicas */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/historia" element={<Historia />} />
        <Route path="/avaliacoes" element={<AvaliacoesPublicas />} />
        <Route path="/eventos" element={<Eventos />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        
        {/* Rotas de Cliente */}
        <Route path="/pacote/:loteId" element={
          <ProtectedRoute>
            <ConfiguradorPacote />
          </ProtectedRoute>
        } />
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
      </Route>

      {/* Rotas Administrativas */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['admin', 'vendedor']}>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="reservas" element={<Reservas />} />
        <Route path="jornada" element={<Jornada />} />
        <Route path="cupons" element={
          <ProtectedRoute roles={['admin']}>
            <Cupons />
          </ProtectedRoute>
        } />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
