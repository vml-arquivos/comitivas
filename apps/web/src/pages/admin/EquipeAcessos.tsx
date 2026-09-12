import { useEffect, useMemo, useState } from 'react';
import { Copy, Edit3, KeyRound, Link2, Mail, Power, RefreshCw, RotateCcw, Search, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { Button, Input } from '@ui/index';
import { api, useAuth } from '../../contexts/AuthContext';
import { AdminModal } from '../../components/admin/AdminModal';

type Usuario = {
  id: string; nome: string; email: string; telefone?: string | null;
  tipo: 'dev' | 'admin' | 'vendedor'; ativo: boolean;
  equipe_nome?: string | null; gestor_id?: string | null;
  ultimo_acesso_em?: string | null; criado_em: string;
};
type Convite = {
  id: string; papel: string; email_destino: string | null; expira_em: string;
  usado_em: string | null; revogado_em: string | null; criado_em: string;
};

const perfilClasses: Record<string, string> = { dev: 'bg-slate-900 text-white', admin: 'bg-sky-50 text-sky-700', vendedor: 'bg-emerald-50 text-emerald-700' };
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase();

export default function EquipeAcessos() {
  const { user } = useAuth();
  const [equipe, setEquipe] = useState<Usuario[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ultimoLink, setUltimoLink] = useState('');
  const [senhaGerada, setSenhaGerada] = useState('');
  const [linksVendedores, setLinksVendedores] = useState<Record<string, string>>({});
  const [gerandoLink, setGerandoLink] = useState<string | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [modal, setModal] = useState<'manual' | 'convite' | null>(null);
  const [aba, setAba] = useState<'equipe' | 'convites'>('equipe');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState({ papel: 'vendedor', email: '', horas_validade: '72' });
  const [manual, setManual] = useState({ nome: '', email: '', telefone: '', equipe_nome: '', tipo: 'vendedor' });

  const carregar = async () => {
    setErro('');
    try {
      const resposta = await api.get('/admin/dev/equipe');
      setEquipe(resposta.data.equipe || []);
      setConvites(resposta.data.convites || []);
    } catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível carregar a equipe.'); }
  };
  useEffect(() => { void carregar(); }, []);

  const equipeFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? equipe.filter((item) => `${item.nome} ${item.email} ${item.equipe_nome || ''}`.toLowerCase().includes(termo)) : equipe;
  }, [busca, equipe]);
  const pendentes = convites.filter((convite) => !convite.usado_em && !convite.revogado_em && new Date(convite.expira_em).getTime() > Date.now()).length;

  const criarConvite = async (event: React.FormEvent) => {
    event.preventDefault(); setSalvando(true); setErro(''); setMensagem(''); setUltimoLink('');
    try {
      const resposta = await api.post('/admin/dev/convites', { papel: form.papel, email: form.email.trim() || undefined, horas_validade: Number(form.horas_validade) });
      setUltimoLink(resposta.data.convite.link); setMensagem('Convite criado. Copie o link e envie ao novo usuário.');
      setForm({ ...form, email: '' }); setModal(null); setAba('convites'); await carregar();
    } catch (error: any) { setErro(error.response?.data?.erro || 'Erro ao gerar convite.'); }
    finally { setSalvando(false); }
  };
  const criarManual = async (event: React.FormEvent) => {
    event.preventDefault(); setSalvando(true); setErro(''); setMensagem(''); setSenhaGerada('');
    try {
      const resposta = await api.post('/admin/usuarios', manual);
      setSenhaGerada(resposta.data.senha_gerada || ''); setMensagem('Acesso criado e adicionado à equipe.');
      setManual({ nome: '', email: '', telefone: '', equipe_nome: manual.equipe_nome, tipo: 'vendedor' }); setModal(null); await carregar();
    } catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível criar o acesso.'); }
    finally { setSalvando(false); }
  };
  const salvarEdicao = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editando) return; setSalvando(true); setErro('');
    try {
      await api.put(`/admin/usuarios/${editando.id}`, { nome: editando.nome, email: editando.email, telefone: editando.telefone, tipo: editando.tipo, equipe_nome: editando.equipe_nome });
      setEditando(null); setMensagem('Dados da equipe atualizados.'); await carregar();
    } catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível atualizar o acesso.'); }
    finally { setSalvando(false); }
  };
  const alterarStatus = async (usuario: Usuario) => {
    const acao = usuario.ativo ? 'desativar' : 'reativar';
    if (!confirm(`Deseja ${acao} ${usuario.nome}? As sessões atuais serão encerradas.`)) return;
    try { await api.patch(`/admin/usuarios/${usuario.id}/status`, { ativo: !usuario.ativo }); setMensagem(`Acesso ${usuario.ativo ? 'desativado' : 'reativado'}.`); await carregar(); }
    catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível alterar o acesso.'); }
  };
  const excluir = async (usuario: Usuario) => {
    if (!confirm(`Excluir ${usuario.nome}? Se houver registros, o acesso será arquivado para preservar o histórico.`)) return;
    try { const resposta = await api.delete(`/admin/usuarios/${usuario.id}`); setMensagem(resposta.data.mensagem || 'Acesso atualizado.'); await carregar(); }
    catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível excluir ou arquivar o acesso.'); }
  };
  const revogar = async (id: string) => {
    if (!confirm('Revogar este convite?')) return;
    try { await api.patch(`/admin/dev/convites/${id}/revogar`); await carregar(); }
    catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível revogar o convite.'); }
  };
  const reemitir = async (id: string) => {
    try { const resposta = await api.post(`/admin/dev/convites/${id}/reemitir`, { horas_validade: 72 }); setUltimoLink(resposta.data.convite.link); setMensagem('Novo link emitido; o link anterior foi revogado.'); await carregar(); }
    catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível reemitir o convite.'); }
  };
  const gerarLinkVendedor = async (vendedorId: string) => {
    setGerandoLink(vendedorId); setErro('');
    try { const resposta = await api.post('/jornada/gerar-link', { vendedor_id: vendedorId }); setLinksVendedores((atual) => ({ ...atual, [vendedorId]: resposta.data.url_rastreio })); setMensagem('Link individual do vendedor criado.'); }
    catch (error: any) { setErro(error.response?.data?.erro || 'Não foi possível gerar o link do vendedor.'); }
    finally { setGerandoLink(null); }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div><p className="admin-eyebrow">Gestão de acessos</p><h1 className="admin-title">Equipe e acessos</h1><p className="admin-subtitle">Usuários, vendedores, convites e links individuais em um único painel.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setModal('convite')}><Mail size={16} className="mr-2" />Gerar convite</Button>
          <Button type="button" onClick={() => setModal('manual')}><UserPlus size={16} className="mr-2" />Novo usuário</Button>
          <button type="button" onClick={() => void carregar()} aria-label="Atualizar" className="admin-icon-button"><RefreshCw size={17} /></button>
        </div>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{mensagem}</div>}
      {senhaGerada && <div className="admin-card flex flex-wrap items-center gap-3 p-4 text-sm"><KeyRound size={18} className="text-amber-600" /><span>Senha temporária:</span><code className="rounded-lg bg-amber-50 px-3 py-1.5 font-bold text-amber-900">{senhaGerada}</code><button type="button" className="font-bold text-[#DF6248]" onClick={() => navigator.clipboard.writeText(senhaGerada)}>Copiar</button></div>}
      {ultimoLink && <div className="admin-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><Link2 size={18} className="text-[#DF6248]" /><code className="min-w-0 flex-1 break-all text-xs">{ultimoLink}</code><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(ultimoLink)}><Copy size={15} className="mr-2" />Copiar</Button></div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="admin-metric-card flex items-center gap-4"><span className="admin-icon-bubble bg-emerald-50 text-emerald-700"><Users size={21} /></span><div><p className="text-xs text-slate-500">Membros ativos</p><strong className="text-2xl text-[#073F50]">{equipe.filter((item) => item.ativo).length}</strong></div></div>
        <div className="admin-metric-card flex items-center gap-4"><span className="admin-icon-bubble bg-sky-50 text-sky-700"><UserPlus size={21} /></span><div><p className="text-xs text-slate-500">Vendedores</p><strong className="text-2xl text-[#073F50]">{equipe.filter((item) => item.tipo === 'vendedor' && item.ativo).length}</strong></div></div>
        <div className="admin-metric-card flex items-center gap-4"><span className="admin-icon-bubble bg-amber-50 text-amber-700"><Mail size={21} /></span><div><p className="text-xs text-slate-500">Convites pendentes</p><strong className="text-2xl text-[#073F50]">{pendentes}</strong></div></div>
      </div>

      <section className="admin-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex gap-6">
            <button type="button" onClick={() => setAba('equipe')} className={`admin-tab ${aba === 'equipe' ? 'admin-tab-active' : ''}`}>Equipe <span>{equipe.length}</span></button>
            <button type="button" onClick={() => setAba('convites')} className={`admin-tab ${aba === 'convites' ? 'admin-tab-active' : ''}`}>Convites <span>{convites.length}</span></button>
          </div>
          {aba === 'equipe' && <label className="relative mb-3 w-full sm:max-w-xs"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input className="admin-field pl-10" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar nome, e-mail ou equipe" /></label>}
        </div>
        <div className="overflow-x-auto">
          {aba === 'equipe' ? (
            <table className="admin-table">
              <thead><tr><th>Membro</th><th>Função</th><th>Equipe</th><th>Último acesso</th><th>Status</th><th>Link de vendas</th><th className="text-right">Ações</th></tr></thead>
              <tbody>{equipeFiltrada.map((usuario) => {
                const podeGerenciar = usuario.id !== user?.id && (user?.tipo === 'dev' || ['admin', 'vendedor'].includes(usuario.tipo));
                return <tr key={usuario.id}>
                  <td><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#eaf4f5] text-xs font-black text-[#176477]">{iniciais(usuario.nome)}</span><div><strong className="block text-[#073F50]">{usuario.nome}</strong><span className="text-xs text-slate-400">{usuario.email}</span></div></div></td>
                  <td><span className={`admin-status ${perfilClasses[usuario.tipo] || 'bg-slate-100'}`}><Shield size={12} />{usuario.tipo === 'admin' ? 'Administrador' : usuario.tipo === 'vendedor' ? 'Vendedor' : 'DEV'}</span></td>
                  <td>{usuario.equipe_nome || '—'}</td><td className="text-slate-500">{usuario.ultimo_acesso_em ? new Date(usuario.ultimo_acesso_em).toLocaleString('pt-BR') : 'Ainda não entrou'}</td>
                  <td><span className={`admin-status ${usuario.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{usuario.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td>{usuario.tipo === 'vendedor' && <div className="flex items-center gap-2"><Button size="sm" type="button" variant="outline" disabled={gerandoLink === usuario.id || !usuario.ativo} onClick={() => void gerarLinkVendedor(usuario.id)}><Link2 size={14} className="mr-1" />{gerandoLink === usuario.id ? 'Gerando...' : 'Gerar link'}</Button>{linksVendedores[usuario.id] && <button type="button" aria-label="Copiar link" onClick={() => navigator.clipboard.writeText(linksVendedores[usuario.id])} className="admin-icon-button"><Copy size={15} /></button>}</div>}</td>
                  <td><div className="flex justify-end gap-1">{podeGerenciar && <><button type="button" title="Editar" onClick={() => setEditando(usuario)} className="admin-row-action"><Edit3 size={16} /></button><button type="button" title={usuario.ativo ? 'Desativar' : 'Reativar'} onClick={() => void alterarStatus(usuario)} className="admin-row-action">{usuario.ativo ? <Power size={16} /> : <RotateCcw size={16} />}</button><button type="button" title="Excluir ou arquivar" onClick={() => void excluir(usuario)} className="admin-row-action text-red-600"><Trash2 size={16} /></button></>}</div></td>
                </tr>;
              })}{equipeFiltrada.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">Nenhum membro encontrado.</td></tr>}</tbody>
            </table>
          ) : (
            <table className="admin-table"><thead><tr><th>Perfil</th><th>E-mail</th><th>Validade</th><th>Situação</th><th className="text-right">Ações</th></tr></thead><tbody>{convites.map((convite) => {
              const expirado = new Date(convite.expira_em).getTime() <= Date.now(); const situacao = convite.usado_em ? 'Utilizado' : convite.revogado_em ? 'Revogado' : expirado ? 'Expirado' : 'Pendente';
              return <tr key={convite.id}><td className="font-semibold">{convite.papel}</td><td>{convite.email_destino || 'Link livre'}</td><td>{new Date(convite.expira_em).toLocaleString('pt-BR')}</td><td><span className={`admin-status ${situacao === 'Pendente' ? 'bg-amber-50 text-amber-700' : situacao === 'Utilizado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{situacao}</span></td><td><div className="flex justify-end gap-2">{!convite.usado_em && <Button size="sm" variant="outline" onClick={() => void reemitir(convite.id)}><RotateCcw size={14} className="mr-1" />Reemitir</Button>}{situacao === 'Pendente' && <button type="button" onClick={() => void revogar(convite.id)} title="Revogar" className="admin-row-action text-red-600"><Trash2 size={17} /></button>}</div></td></tr>;
            })}</tbody></table>
          )}
        </div>
      </section>

      <AdminModal aberto={modal === 'manual'} titulo="Novo usuário" descricao="Cadastre um membro diretamente e defina seu perfil de acesso." fechar={() => setModal(null)}>
        <form onSubmit={criarManual} className="grid gap-4 sm:grid-cols-2"><Input required label="Nome completo" value={manual.nome} onChange={(e) => setManual({ ...manual, nome: e.target.value })} /><Input required label="E-mail" type="email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} /><Input label="Telefone" value={manual.telefone} onChange={(e) => setManual({ ...manual, telefone: e.target.value })} /><Input label="Equipe / grupo" value={manual.equipe_nome} onChange={(e) => setManual({ ...manual, equipe_nome: e.target.value })} /><div><label className="mb-1 block text-sm font-medium">Perfil</label><select className="admin-field" value={manual.tipo} onChange={(e) => setManual({ ...manual, tipo: e.target.value })}><option value="vendedor">Vendedor</option>{user?.tipo === 'dev' && <option value="admin">Administrador</option>}{user?.tipo === 'dev' && <option value="dev">DEV</option>}</select></div><div className="flex items-end justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? 'Criando...' : 'Criar acesso'}</Button></div></form>
      </AdminModal>
      <AdminModal aberto={modal === 'convite'} titulo="Gerar convite" descricao="O link expira e só pode ser utilizado uma vez." fechar={() => setModal(null)}>
        <form onSubmit={criarConvite} className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">Perfil</label><select className="admin-field" value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}><option value="vendedor">Vendedor</option>{user?.tipo === 'dev' && <option value="admin">Administrador</option>}{user?.tipo === 'dev' && <option value="dev">DEV</option>}</select></div><Input label="E-mail específico (opcional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><Input label="Validade (horas)" type="number" min={1} max={168} value={form.horas_validade} onChange={(e) => setForm({ ...form, horas_validade: e.target.value })} /><div className="flex items-end justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? 'Gerando...' : 'Gerar link'}</Button></div></form>
      </AdminModal>
      <AdminModal aberto={Boolean(editando)} titulo="Editar acesso" descricao="Atualize apenas os dados necessários deste membro." fechar={() => setEditando(null)}>
        {editando && <form onSubmit={salvarEdicao} className="grid gap-4 sm:grid-cols-2"><Input required label="Nome" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} /><Input required label="E-mail" type="email" value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} /><Input label="Telefone" value={editando.telefone || ''} onChange={(e) => setEditando({ ...editando, telefone: e.target.value })} /><div><label className="mb-1 block text-sm font-medium">Cargo</label><select className="admin-field" value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as Usuario['tipo'] })}><option value="vendedor">Vendedor</option><option value="admin">Administrador</option>{user?.tipo === 'dev' && <option value="dev">DEV</option>}</select></div><Input label="Equipe / grupo" disabled={editando.tipo !== 'vendedor'} value={editando.equipe_nome || ''} onChange={(e) => setEditando({ ...editando, equipe_nome: e.target.value })} /><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button><Button type="submit" disabled={salvando}>Salvar</Button></div></form>}
      </AdminModal>
    </div>
  );
}
