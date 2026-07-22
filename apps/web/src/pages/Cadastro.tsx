import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, api } from '../contexts/AuthContext';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@ui/index';

export default function Cadastro() {
  const [formData, setFormData] = useState({ nome: '', email: '', cpf: '', telefone: '', senha: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/auth/cadastro', formData);
      login(response.data.token, response.data.usuario);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao cadastrar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Criar Conta</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">{error}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Nome completo" name="nome" value={formData.nome} onChange={handleChange} required />
            <Input label="E-mail" type="email" name="email" value={formData.email} onChange={handleChange} required />
            <Input label="CPF" name="cpf" value={formData.cpf} onChange={handleChange} placeholder="000.000.000-00" />
            <Input label="Telefone" name="telefone" value={formData.telefone} onChange={handleChange} placeholder="(00) 00000-0000" />
            <Input label="Senha" type="password" name="senha" value={formData.senha} onChange={handleChange} required minLength={8} />
            
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Cadastrar
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-600">
            Já tem uma conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
