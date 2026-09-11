import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth, api } from '../contexts/AuthContext';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@ui/index';
import { destinoSeguro } from '../utils/checkoutIntent';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recuperacao, setRecuperacao] = useState(false);
  const [recuperacaoLoading, setRecuperacaoLoading] = useState(false);
  const [recuperacaoMensagem, setRecuperacaoMensagem] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = destinoSeguro(searchParams.get('redirect'), '');
  const senhaRedefinida = searchParams.get('senha_redefinida') === '1';

  const destinoPorPapel = (usuario: { tipo: string }) =>
    ['admin', 'dev', 'vendedor'].includes(usuario.tipo) ? '/admin' : '/minha-conta';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRecuperacaoMensagem('');
    setIsLoading(true);
    try {
      const response = await api.post('/auth/login', { email, senha });
      login(response.data.usuario);
      navigate(redirect || destinoPorPapel(response.data.usuario), { replace: true });
    } catch (err: any) {
      if (err.response?.status === 403 && err.response?.data?.email_confirmacao_necessaria) {
        navigate(`/confirmar-email?email=${encodeURIComponent(email)}${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ''}`, { replace: true });
        return;
      }
      setError(err.response?.data?.erro || 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  const solicitarRecuperacao = async () => {
    setError('');
    setRecuperacaoMensagem('');
    const emailNormalizado = email.trim();
    if (!emailNormalizado) {
      setError('Informe seu e-mail para receber o link de redefinição.');
      return;
    }

    setRecuperacaoLoading(true);
    try {
      await api.post('/auth/esqueci-senha', { email: emailNormalizado });
      setRecuperacaoMensagem('Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha. Verifique também a caixa de spam.');
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError(err.response?.data?.erro || 'Muitas solicitações de recuperação. Aguarde alguns minutos e tente novamente.');
      } else {
        // Mantém resposta neutra para não revelar se uma conta existe.
        setRecuperacaoMensagem('Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha. Verifique também a caixa de spam.');
      }
    } finally {
      setRecuperacaoLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl text-secondary">Entrar na Comitiva</CardTitle>
        </CardHeader>
        <CardContent>
          {senhaRedefinida && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm font-medium text-green-700">Senha redefinida com sucesso. Entre com sua nova senha.</div>}
          {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          {recuperacaoMensagem && <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700">{recuperacaoMensagem}</div>}

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
            <Button type="submit" className="w-full" isLoading={isLoading} disabled={recuperacaoLoading}>
              Entrar
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setRecuperacao((aberta) => !aberta);
              setError('');
              setRecuperacaoMensagem('');
            }}
            className="mt-4 block w-full text-center text-sm font-semibold text-primary hover:underline"
          >
            Esqueci minha senha
          </button>

          {recuperacao && (
            <div className="mt-3 space-y-2">
              <p className="text-center text-xs text-gray-500">Informe o e-mail acima para receber um link de redefinição.</p>
              <button
                type="button"
                onClick={() => void solicitarRecuperacao()}
                disabled={recuperacaoLoading || isLoading}
                className="block w-full rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recuperacaoLoading ? 'Enviando…' : 'Enviar link de recuperação'}
              </button>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-gray-600">
            Não tem uma conta?{' '}
            <Link to={`/cadastro${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="text-primary hover:underline">
              Cadastre-se
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
