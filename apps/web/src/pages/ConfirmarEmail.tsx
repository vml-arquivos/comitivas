import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api, useAuth } from '../contexts/AuthContext';
import { destinoSeguro } from '../utils/checkoutIntent';

export default function ConfirmarEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const redirect = destinoSeguro(params.get('redirect'), '/eventos');
  const [email, setEmail] = useState(params.get('email') || '');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(false);

  const confirmar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro('');
    setMensagem('');
    setCarregando(true);
    try {
      const response = await api.post('/auth/confirmar-email', { email, codigo });
      login('', response.data.usuario);
      navigate(redirect, { replace: true });
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível confirmar seu e-mail.');
    } finally {
      setCarregando(false);
    }
  };

  const reenviar = async () => {
    setErro('');
    setMensagem('');
    try {
      await api.post('/auth/reenviar-confirmacao', { email });
      setMensagem('Se a conta estiver pendente, um novo código foi enviado.');
    } catch {
      setMensagem('Se a conta estiver pendente, um novo código foi enviado.');
    }
  };

  return <div className="flex justify-center px-4 py-12"><Helmet><title>Confirmar e-mail | Excursão das Comitivas</title><meta name="robots" content="noindex,nofollow" /></Helmet><Card className="w-full max-w-lg"><CardHeader><CardTitle className="text-center text-2xl">Confirme seu e-mail</CardTitle><p className="text-center text-sm text-slate-500">Enviamos um código de 6 dígitos para ativar sua conta e proteger sua reserva.</p></CardHeader><CardContent><form onSubmit={confirmar} className="space-y-4">{erro && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</div>}{mensagem && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{mensagem}</div>}<Input label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><Input label="Código de confirmação" inputMode="numeric" maxLength={6} value={codigo} onChange={(event) => setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))} required /><Button type="submit" className="w-full" isLoading={carregando}>Confirmar e continuar</Button></form><button type="button" className="mt-4 w-full text-sm font-semibold text-primary underline" onClick={reenviar}>Reenviar código</button></CardContent></Card></div>;
}
