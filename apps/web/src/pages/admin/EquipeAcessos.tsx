import { useEffect, useState } from 'react';
import { Copy, Link2, RefreshCw, Shield, Trash2, UserPlus, Users, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api, useAuth } from '../../contexts/AuthContext';

type Usuario = { id: string; nome: string; email: string; tipo: 'dev' | 'admin' | 'vendedor'; ativo: boolean; criado_em: string };
type Convite = { id: string; papel: string; email_destino: string | null; expira_em: string; usado_em: string | null; revogado_em: string | null; criado_em: string };

export default function EquipeAcessos() {
  const { user } = useAuth();
  const [equipe, setEquipe] = useState<Usuario[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ultimoLink, setUltimoLink] = useState('');
  const [form, setForm] = useState({ papel: 'admin', email: '', horas_validade: '72' });

  const carregar = async () => {
    setErro('');
    try {
      const r = await api.get('/admin/dev/equipe');
      setEquipe(r.data.equipe || []);
      setConvites(r.data.convites || []);
    } catch (e: any) {
      setErro(e.response?.data?.erro || 'Não foi possível carregar a equipe.');
    }
  };

  useEffect(() => { void carregar(); }, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    setMensagem('');
    try {
      const r = await api.post('/admin/dev/convites', {
        papel: form.papel,
        email: form.email.trim() || undefined,
        horas_validade: Number(form.horas_validade),
      });
      setUltimoLink(r.data.convite.link);
      setMensagem('Convite criado. Copie o link e envie ao novo usuário.');
      setForm({ ...form, email: '' });
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível gerar o convite.');
    } finally {
      setSalvando(false);
    }
  };

  const revogar = async (id: string) => {
    if (!confirm('Revogar este convite?')) return;
    try {
      await api.patch(`/admin/dev/convites/${id}/revogar`);
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível revogar o convite.');
    }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Acessos</p>
        <h1 className="text-3xl font-bold text-secondary">Equipe & Acessos</h1>
        <p className="mt-1 text-sm text-gray-500">Gerencie administradores, vendedores e convites permitidos para o seu perfil.</p>
      </div>
      <Button variant="outline" onClick={() => void carregar()}><RefreshCw size={16} className="mr-2" />Atualizar</Button>
    </div>
    {erro && <div className="rounded-lg bg-red-50 p-4 text-red-700">{erro}</div>}
    {mensagem && <div className="rounded-lg bg-blue-50 p-4 text-blue-700">{mensagem}</div>}

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus size={20} />Novo convite</CardTitle></CardHeader><CardContent>
      <form onSubmit={criar} className="grid gap-4 md:grid-cols-[180px_1fr_160px_auto]">
        <div><label className="mb-1 block text-sm font-medium">Perfil</label><select className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm" value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}><option value="admin">Administrador</option><option value="vendedor">Vendedor</option></select></div>
        <Input label="E-mail específico (opcional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Validade (horas)" type="number" min={1} max={168} value={form.horas_validade} onChange={(e) => setForm({ ...form, horas_validade: e.target.value })} />
        <div className="flex items-end"><Button type="submit" disabled={salvando} className="w-full">Gerar link</Button></div>
      </form>
      {ultimoLink && <div className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center"><Link2 size={18} className="text-primary" /><code className="min-w-0 flex-1 break-all text-xs">{ultimoLink}</code><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(ultimoLink)}><Copy size={15} className="mr-2" />Copiar</Button></div>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users size={20} />Equipe interna</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="px-5 py-3">Nome</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Perfil</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Criado</th><th className="px-5 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y">{equipe.map((u) => <tr key={u.id}><td className="px-5 py-4 font-medium">{u.nome}</td><td className="px-5 py-4">{u.email}</td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${u.tipo === 'dev' ? 'bg-slate-900 text-white' : u.tipo === 'admin' ? 'bg-primary/10 text-primary' : 'bg-blue-50 text-blue-700'}`}><Shield size={12} className="mr-1 inline" />{u.tipo === 'admin' ? 'ADMIN' : u.tipo === 'vendedor' ? 'VENDEDOR' : 'DEV'}</span></td><td className="px-5 py-4">{u.ativo ? 'Ativo' : 'Inativo'}</td><td className="px-5 py-4 text-gray-500">{new Date(u.criado_em).toLocaleDateString('pt-BR')}</td><td className="px-5 py-4 text-right"><Link to={`/admin/clientes?tipo=${u.tipo}&editar=${u.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><Pencil size={15} />Editar</Link></td></tr>)}</tbody></table></div></CardContent></Card>

    <Card><CardHeader><CardTitle>Convites</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="px-5 py-3">Perfil</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Validade</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y">{convites.map((c) => { const expirado = new Date(c.expira_em).getTime() <= Date.now(); const situacao = c.usado_em ? 'Utilizado' : c.revogado_em ? 'Revogado' : expirado ? 'Expirado' : 'Pendente'; return <tr key={c.id}><td className="px-5 py-4 font-medium">{c.papel === 'admin' ? 'Administrador' : 'Vendedor'}</td><td className="px-5 py-4">{c.email_destino || 'Livre'}</td><td className="px-5 py-4">{new Date(c.expira_em).toLocaleString('pt-BR')}</td><td className="px-5 py-4">{situacao}</td><td className="px-5 py-4 text-right">{situacao === 'Pendente' && <button onClick={() => void revogar(c.id)} title="Revogar" className="text-red-600"><Trash2 size={17} /></button>}</td></tr>; })}</tbody></table></div></CardContent></Card>

    {user?.tipo === 'admin' && <p className="text-xs text-gray-500">Você vê somente os acessos que pode administrar.</p>}
  </div>;
}
