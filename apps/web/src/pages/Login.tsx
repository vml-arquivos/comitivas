import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth, api } from '../contexts/AuthContext';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@ui/index';
import { destinoSeguro } from '../utils/checkoutIntent';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = destinoSeguro(searchParams.get('redirect'), '/');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/auth/login', { email, senha });
      login(response.data.token, response.data.usuario);
      navigate(redirect, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Entrar na Comitiva</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">{error}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input 
              label="E-mail" 
              type="email" 
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
            <Input 
              label="Senha" 
              type="password" 
              name="password"
              autoComplete="current-password"
              value={senha} 
              onChange={(e) => setSenha(e.target.value)} 
              required 
            />
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Entrar
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-600">
            Não tem uma conta? <Link to={`/cadastro?redirect=${encodeURIComponent(redirect)}`} className="text-primary hover:underline">Cadastre-se</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
