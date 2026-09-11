import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';

export default function PasswordReset() {
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() || '';
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const tokenValidoNoFormato = /^[a-f0-9]{64}$/.test(token);

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro('');
    setMensagem('');

    if (!tokenValidoNoFormato) {
      setErro('Este link de redefinição é inválido ou está incompleto. Solicite um novo link.');
      return;
    }
    if (senha.length < 8 || senha !== confirmacao) {
      setErro('Use pelo menos 8 caracteres e confirme a mesma senha.');
      return;
    }

    setCarregando(true);
    try {
      await api.post('/auth/redefinir-senha', { token, senha });
      setMensagem('Senha redefinida com sucesso. Redirecionando para o login…');

      // Remove dados locais de sessão antiga e usa navegação completa com replace.
      // Isso evita retornar ao link de redefinição pelo botão Voltar e também
      // contorna qualquer estado antigo do React/PWA após a troca da senha.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.replace('/login?senha_redefinida=1');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível redefinir a senha.');
      setCarregando(false);
    }
  };

  return (
    <div className="flex justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl text-secondary">Criar nova senha</CardTitle>
        </CardHeader>
        <CardContent>
          {erro && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
          {mensagem && <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{mensagem}</div>}

          {!tokenValidoNoFormato ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-gray-600">O link de redefinição não é válido. Solicite um novo link na tela de login.</p>
              <Link to="/login" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              <Input
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                required
              />
              <Input
                label="Confirmar senha"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmacao}
                onChange={(event) => setConfirmacao(event.target.value)}
                required
              />
              <Button type="submit" className="w-full" isLoading={carregando} disabled={carregando}>
                Redefinir senha
              </Button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-gray-600">
            <Link to="/login" className="font-semibold text-primary hover:underline">Voltar para o login</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
