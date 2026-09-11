import { useEffect, useState } from 'react';
import { AtSign, CheckCircle2, KeyRound, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Button, Input } from '@ui/index';
import { api, useAuth } from '../../contexts/AuthContext';

type Perfil = {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  cpf?: string | null;
  endereco?: string | null;
  tipo: 'dev' | 'admin' | 'vendedor' | 'cliente';
};

export default function MinhaContaAdmin() {
  const { user, refreshUser } = useAuth();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [dados, setDados] = useState({ nome: '', telefone: '', cpf: '', endereco: '' });
  const [login, setLogin] = useState({ novo_email: '', confirmar_email: '', senha_atual: '' });
  const [senha, setSenha] = useState({ senha_atual: '', nova_senha: '', confirmar_senha: '' });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState('');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');

  const carregar = async () => {
    setErro('');
    try {
      const resposta = await api.get('/auth/perfil');
      const atual = resposta.data.usuario as Perfil;
      setPerfil(atual);
      setDados({ nome: atual.nome || '', telefone: atual.telefone || '', cpf: atual.cpf || '', endereco: atual.endereco || '' });
      setLogin((valor) => ({ ...valor, novo_email: atual.email || '', confirmar_email: atual.email || '' }));
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível carregar a conta.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const executar = async (tipo: string, acao: () => Promise<unknown>, sucesso: string) => {
    setSalvando(tipo);
    setErro('');
    setMensagem('');
    try {
      await acao();
      await refreshUser();
      await carregar();
      setMensagem(sucesso);
      return true;
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível salvar a alteração.');
      return false;
    } finally {
      setSalvando('');
    }
  };

  const salvarDados = (event: React.FormEvent) => {
    event.preventDefault();
    void executar('dados', () => api.put('/auth/perfil', dados), 'Dados pessoais atualizados.');
  };

  const salvarLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (login.novo_email.trim().toLowerCase() !== login.confirmar_email.trim().toLowerCase()) {
      setErro('A confirmação do novo e-mail não confere.');
      return;
    }
    const alterado = await executar('login', () => api.post('/auth/alterar-login', {
      novo_email: login.novo_email,
      senha_atual: login.senha_atual,
    }), 'E-mail de acesso atualizado. Use o novo e-mail no próximo login.');
    if (alterado) setLogin((valor) => ({ ...valor, senha_atual: '' }));
  };

  const salvarSenha = async (event: React.FormEvent) => {
    event.preventDefault();
    if (senha.nova_senha !== senha.confirmar_senha) {
      setErro('A confirmação da nova senha não confere.');
      return;
    }
    const alterada = await executar('senha', () => api.post('/auth/alterar-senha', {
      senha_atual: senha.senha_atual,
      nova_senha: senha.nova_senha,
    }), 'Senha alterada. As outras sessões foram encerradas.');
    if (alterada) setSenha({ senha_atual: '', nova_senha: '', confirmar_senha: '' });
  };

  if (carregando) return <div className="admin-page text-sm text-slate-500">Carregando sua conta...</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Segurança e acesso</p>
          <h1 className="admin-title">Minha conta</h1>
          <p className="admin-subtitle">Atualize seus dados, o e-mail usado no login e sua senha.</p>
        </div>
        <span className="admin-status bg-[#eaf4f5] px-3 py-2 text-[#176477]"><ShieldCheck size={15} /> Perfil {user?.tipo?.toUpperCase()}</span>
      </div>

      {erro && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      {mensagem && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} />{mensagem}</div>}

      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <aside className="admin-card p-6">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-[#073F50] text-xl font-black text-white">{perfil?.nome?.charAt(0).toUpperCase()}</div>
          <h2 className="mt-4 text-xl font-black text-[#073F50]">{perfil?.nome}</h2>
          <p className="text-sm text-slate-500">{perfil?.email}</p>
          <div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/70 px-4">
            <div className="flex items-center justify-between py-3 text-sm"><span className="text-slate-500">Perfil</span><strong className="text-[#073F50]">{perfil?.tipo.toUpperCase()}</strong></div>
            <div className="flex items-center justify-between py-3 text-sm"><span className="text-slate-500">Telefone</span><strong className="text-[#073F50]">{perfil?.telefone || 'Não informado'}</strong></div>
            <div className="flex items-center justify-between py-3 text-sm"><span className="text-slate-500">Sessão</span><strong className="text-emerald-700">Protegida</strong></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-400">Alterações de login e senha exigem sua senha atual. Nenhuma senha é exibida ou armazenada em texto aberto.</p>
        </aside>

        <div className="space-y-5">
          <section className="admin-card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3"><span className="admin-icon-bubble bg-[#eaf4f5] text-[#176477]"><UserRound size={20} /></span><div><h2 className="font-black text-[#073F50]">Dados pessoais</h2><p className="text-xs text-slate-500">Informações exibidas no painel.</p></div></div>
            <form onSubmit={salvarDados} className="grid gap-4 sm:grid-cols-2">
              <Input required label="Nome completo" value={dados.nome} onChange={(event) => setDados({ ...dados, nome: event.target.value })} />
              <Input label="Telefone / WhatsApp" value={dados.telefone} onChange={(event) => setDados({ ...dados, telefone: event.target.value })} />
              <Input label="CPF" value={dados.cpf} onChange={(event) => setDados({ ...dados, cpf: event.target.value })} />
              <Input label="Endereço" value={dados.endereco} onChange={(event) => setDados({ ...dados, endereco: event.target.value })} />
              <div className="sm:col-span-2 sm:text-right"><Button type="submit" disabled={Boolean(salvando)}><Save size={16} className="mr-2" />{salvando === 'dados' ? 'Salvando...' : 'Salvar dados'}</Button></div>
            </form>
          </section>

          <section className="admin-card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3"><span className="admin-icon-bubble bg-[#fff5df] text-amber-700"><AtSign size={20} /></span><div><h2 className="font-black text-[#073F50]">E-mail de acesso</h2><p className="text-xs text-slate-500">Este endereço será seu novo login.</p></div></div>
            <form onSubmit={salvarLogin} className="grid gap-4 sm:grid-cols-2">
              <Input required type="email" label="Novo e-mail" value={login.novo_email} onChange={(event) => setLogin({ ...login, novo_email: event.target.value })} />
              <Input required type="email" label="Confirmar novo e-mail" value={login.confirmar_email} onChange={(event) => setLogin({ ...login, confirmar_email: event.target.value })} />
              <Input required type="password" autoComplete="current-password" label="Senha atual" value={login.senha_atual} onChange={(event) => setLogin({ ...login, senha_atual: event.target.value })} />
              <div className="flex items-end sm:justify-end"><Button type="submit" disabled={Boolean(salvando)}>{salvando === 'login' ? 'Alterando...' : 'Alterar login'}</Button></div>
            </form>
          </section>

          <section className="admin-card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3"><span className="admin-icon-bubble bg-[#fff0eb] text-[#DF6248]"><KeyRound size={20} /></span><div><h2 className="font-black text-[#073F50]">Alterar senha</h2><p className="text-xs text-slate-500">Ao salvar, as outras sessões serão encerradas.</p></div></div>
            <form onSubmit={salvarSenha} className="grid gap-4 sm:grid-cols-3">
              <Input required type="password" autoComplete="current-password" label="Senha atual" value={senha.senha_atual} onChange={(event) => setSenha({ ...senha, senha_atual: event.target.value })} />
              <Input required type="password" minLength={8} autoComplete="new-password" label="Nova senha" value={senha.nova_senha} onChange={(event) => setSenha({ ...senha, nova_senha: event.target.value })} />
              <Input required type="password" minLength={8} autoComplete="new-password" label="Confirmar senha" value={senha.confirmar_senha} onChange={(event) => setSenha({ ...senha, confirmar_senha: event.target.value })} />
              <div className="sm:col-span-3 sm:text-right"><Button type="submit" disabled={Boolean(salvando)}>{salvando === 'senha' ? 'Alterando...' : 'Alterar senha'}</Button></div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
