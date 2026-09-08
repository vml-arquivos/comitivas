import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, ShieldCheck, UserPlus } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@ui/index';
import { api, useAuth } from '../contexts/AuthContext';

type Convite = { papel: 'admin' | 'vendedor'; email_destino?: string | null; expira_em: string };

export default function ConviteAcesso() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [convite, setConvite] = useState<Convite | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({ nome: '', email: '', cpf: '', telefone: '', rg: '', data_nascimento: '', estado_civil: '', profissao: '', endereco: '', nacionalidade: 'Brasileira', senha: '', confirmar: '' });

  useEffect(() => {
    if (!token) return;
    api.get(`/auth/convite/${encodeURIComponent(token)}`).then((response) => {
      const dados = response.data.convite as Convite;
      setConvite(dados);
      if (dados.email_destino) setForm((atual) => ({ ...atual, email: dados.email_destino || '' }));
    }).catch((err) => setErro(err.response?.data?.erro || 'Convite inválido ou expirado.')).finally(() => setCarregando(false));
  }, [token]);

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setErro('');
    if (form.senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (form.senha !== form.confirmar) return setErro('As senhas não conferem.');
    setSalvando(true);
    try {
      const response = await api.post(`/auth/convite/${encodeURIComponent(token)}`, {
        nome: form.nome, email: form.email, cpf: form.cpf, telefone: form.telefone, rg: form.rg,
        data_nascimento: form.data_nascimento || undefined, estado_civil: form.estado_civil, profissao: form.profissao,
        endereco: form.endereco, nacionalidade: form.nacionalidade, senha: form.senha,
      });
      login(response.data.usuario);
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível concluir o cadastro.');
    } finally { setSalvando(false); }
  };

  return <div className="mx-auto max-w-3xl py-12">
    <Helmet><title>Convite de acesso | Excursão das Comitivas</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <Card className="overflow-hidden border-[#182D3B]/10 shadow-xl shadow-[#182D3B]/5">
      <div className="bg-[#182D3B] px-7 py-8 text-white sm:px-10">
        <div className="flex items-center gap-3"><ShieldCheck size={30} className="text-[#E5C6A4]" /><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E5C6A4]">Acesso interno seguro</p><h1 className="font-editorial text-3xl font-bold">Convite para o painel</h1></div></div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">Crie sua conta pessoal. Este link é de uso único e concede somente o perfil definido pelo responsável do sistema.</p>
      </div>
      <CardContent className="p-7 sm:p-10">
        {carregando ? <p>Validando convite...</p> : erro && !convite ? <div className="rounded-xl bg-red-50 p-4 text-red-700">{erro}</div> : convite ? <form onSubmit={enviar} className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-600" /><div><p className="font-semibold text-emerald-900">Convite válido</p><p className="text-sm text-emerald-700">Perfil: {convite.papel === 'admin' ? 'Administrador' : 'Vendedor'} · válido até {new Date(convite.expira_em).toLocaleString('pt-BR')}</p></div></div><UserPlus className="text-emerald-700" /></div>
          {erro && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required autoComplete="name" />
            <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={Boolean(convite.email_destino)} autoComplete="email" />
            <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} required inputMode="numeric" />
            <Input label="WhatsApp" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} inputMode="tel" />
            <Input label="RG" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
            <Input label="Data de nascimento" type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
            <Input label="Estado civil" value={form.estado_civil} onChange={(e) => setForm({ ...form, estado_civil: e.target.value })} />
            <Input label="Profissão" value={form.profissao} onChange={(e) => setForm({ ...form, profissao: e.target.value })} />
            <Input label="Nacionalidade" value={form.nacionalidade} onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} />
            <Input label="Endereço" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            <Input label="Crie sua senha" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required autoComplete="new-password" />
            <Input label="Confirme a senha" type="password" value={form.confirmar} onChange={(e) => setForm({ ...form, confirmar: e.target.value })} required autoComplete="new-password" />
          </div>
          <Button type="submit" size="lg" className="w-full" isLoading={salvando}>Criar conta e acessar painel</Button>
        </form> : null}
      </CardContent>
    </Card>
  </div>;
}
