import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { AuthProvider, useAuth } from '../../../apps/web/src/contexts/AuthContext';
import { MainLayout } from '../../../apps/web/src/layouts/MainLayout';
import { AdminLayout } from '../../../apps/web/src/layouts/AdminLayout';

// Importar páginas do web (reutilização de componentes)
import Login from '../../../apps/web/src/pages/Login';
import Cadastro from '../../../apps/web/src/pages/Cadastro';
import Eventos from '../../../apps/web/src/pages/Eventos';
import ConfiguradorPacote from '../../../apps/web/src/pages/cliente/ConfiguradorPacote';
import Checkout from '../../../apps/web/src/pages/cliente/Checkout';
import Confirmacao from '../../../apps/web/src/pages/cliente/Confirmacao';
import MinhasReservas from '../../../apps/web/src/pages/cliente/MinhasReservas';
import Dashboard from '../../../apps/web/src/pages/admin/Dashboard';
import Reservas from '../../../apps/web/src/pages/admin/Reservas';
import Cupons from '../../../apps/web/src/pages/admin/Cupons';
import Jornada from '../../../apps/web/src/pages/admin/Jornada';

import './App.css';

// Proteção de rotas
const ProtectedRoute = ({ children, roles }: { children: React.ReactNode, roles?: string[] }) => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  
  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }
  
  if (roles && !roles.includes(user.tipo)) {
    navigate('/', { replace: true });
    return null;
  }

  return <>{children}</>;
};

// Componente para gerenciar o backButton do Capacitor
function BackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleBackButton = async () => {
      // Se estamos na página raiz, fechar o app
      if (location.pathname === '/') {
        await CapacitorApp.exitApp();
      } else {
        // Caso contrário, voltar uma página
        navigate(-1);
      }
    };

    const listener = CapacitorApp.addListener('backButton', handleBackButton);

    return () => {
      listener.remove();
    };
  }, [navigate, location.pathname]);

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Rotas Públicas */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<Eventos />} />
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
        <BackButtonHandler />
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
