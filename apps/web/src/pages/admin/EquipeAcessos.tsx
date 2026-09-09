import { useEffect, useState } from 'react';
import { Copy, Edit3, KeyRound, Link2, Power, RefreshCw, RotateCcw, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api, useAuth } from '../../contexts/AuthContext';

type Usuario = {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  tipo: 'dev' | 'admin' | 'vendedor';
  ativo: boolean;
  equipe_nome?: string | null;
  gestor_id?: string | null;
  ultimo_acesso_em?: string | null;
  criado_em: string;
};
type Convite = {
  id: string;
  papel: string;
  email_destino: string | null;
  expira_em: string;
  usado_em: string | null;
  revogado_em: string | null;
  criado_em: string;
};

const selectClass = 'admin-field';

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
  const [form, setForm] = useState({
    papel: 'vendedor',
    email: '',
    horas_validade: '72',
  });
  const [manual, setManual] = useState({
    nome: '',
    email: '',
    telefone: '',
    equipe_nome: '',
    tipo: 'vendedor',
  });

  const carregar = async () => {
    setErro('');
    try {
      const resposta = await api.get('/admin/dev/equipe');
      setEquipe(resposta.data.equipe || []);
      setConvites(resposta.data.convites || []);
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível carregar a equipe.');
    }
  };
  useEffect(() => {
    void carregar();
  }, []);

  const criarConvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    setMensagem('');
    setUltimoLink('');
    try {
      const resposta = await api.post('/admin/dev/convites', {
        papel: form.papel,
        email: form.email.trim() || undefined,
        horas_validade: Number(form.horas_validade),
      });
      setUltimoLink(resposta.data.convite.link);
      setMensagem('Convite criado. Copie o link e envie ao novo usuário.');
      setForm({ ...form, email: '' });
      await carregar();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Erro ao gerar convite.');
    } finally {
      setSalvando(false);
    }
  };

  const criarManual = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    setMensagem('');
    setSenhaGerada('');
    try {
      const resposta = await api.post('/admin/usuarios', manual);
      setSenhaGerada(resposta.data.senha_gerada || '');
      setMensagem('Acesso criado e adicionado à equipe.');
      setManual({
        nome: '',
        email: '',
        telefone: '',
        equipe_nome: manual.equipe_nome,
        tipo: 'vendedor',
      });
      await carregar();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível criar o acesso.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarEdicao = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editando) return;
    setSalvando(true);
    setErro('');
    try {
      await api.put(`/admin/usuarios/${editando.id}`, {
        nome: editando.nome,
        email: editando.email,
        telefone: editando.telefone,
        equipe_nome: editando.equipe_nome,
      });
      setEditando(null);
      setMensagem('Dados da equipe atualizados.');
      await carregar();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível atualizar o acesso.');
    } finally {
      setSalvando(false);
    }
  };

  const alterarStatus = async (usuario: Usuario) => {
    const acao = usuario.ativo ? 'desativar' : 'reativar';
    if (!confirm(`Deseja ${acao} ${usuario.nome}? As sessões atuais serão encerradas.`)) return;
    try {
      await api.patch(`/admin/usuarios/${usuario.id}/status`, {
        ativo: !usuario.ativo,
      });
      setMensagem(`Acesso ${usuario.ativo ? 'desativado' : 'reativado'}.`);
      await carregar();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível alterar o acesso.');
    }
  };

  const excluir = async (usuario: Usuario) => {
    if (!confirm(`Excluir ${usuario.nome}? Se houver registros, o acesso será arquivado para preservar o histórico.`)) return;
    try {
      const resposta = await api.delete(`/admin/usuarios/${usuario.id}`);
      setMensagem(resposta.data.mensagem || 'Acesso atualizado.');
      await carregar();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível excluir ou arquivar o acesso.');
    }
  };

  const revogar = async (id: string) => {
    if (!confirm('Revogar este convite?')) return;
    try {
      await api.patch(`/admin/dev/convites/${id}/revogar`);
      await carregar();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível revogar o convite.');
    }
  };
  const reemitir = async (id: string) => {
    try {
      const resposta = await api.post(`/admin/dev/convites/${id}/reemitir`, {
        horas_validade: 72,
      });
      setUltimoLink(resposta.data.convite.link);
      setMensagem('Novo link emitido; o link anterior foi revogado.');
      await carregar();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível reemitir o convite.');
    }
  };

  const gerarLinkVendedor = async (vendedorId: string) => {
    setGerandoLink(vendedorId);
    setErro('');
    try {
      const resposta = await api.post('/jornada/gerar-link', {
        vendedor_id: vendedorId,
      });
      setLinksVendedores((atual) => ({
        ...atual,
        [vendedorId]: resposta.data.url_rastreio,
      }));
      setMensagem('Link individual do vendedor criado.');
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível gerar o link do vendedor.');
    } finally {
      setGerandoLink(null);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Administração comercial</p>
          <h1 className="admin-title">Equipe e acessos</h1>
          <p className="admin-subtitle">Gerencie perfis, convites e links individuais de vendas.</p>
        </div>
        <Button variant="outline" onClick={() => void carregar()}>
          <RefreshCw size={16} className="mr-2" />
          Atualizar
        </Button>
      </div>
      {erro && <div className="rounded-lg bg-red-50 p-4 text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-lg bg-blue-50 p-4 text-blue-700">{mensagem}</div>}
      {senhaGerada && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Senha temporária:</strong> <code className="mx-2 rounded bg-white px-2 py-1">{senhaGerada}</code>
          <button type="button" className="font-semibold underline" onClick={() => navigator.clipboard.writeText(senhaGerada)}>
            Copiar
          </button>
          <p className="mt-2 text-xs">Ela é exibida somente agora. Oriente a troca pelo fluxo de redefinição de senha.</p>
        </div>
      )}
      {ultimoLink && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
          <Link2 size={18} className="text-primary" />
          <code className="min-w-0 flex-1 break-all text-xs">{ultimoLink}</code>
          <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(ultimoLink)}>
            <Copy size={15} className="mr-2" />
            Copiar
          </Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="admin-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus size={20} className="text-[#DF6248]" />
              Adicionar manualmente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={criarManual} className="grid gap-3 sm:grid-cols-2">
              <Input required label="Nome" value={manual.nome} onChange={(e) => setManual({ ...manual, nome: e.target.value })} />
              <Input required label="E-mail" type="email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
              <Input label="Telefone" value={manual.telefone} onChange={(e) => setManual({ ...manual, telefone: e.target.value })} />
              <Input label="Equipe / grupo" value={manual.equipe_nome} onChange={(e) => setManual({ ...manual, equipe_nome: e.target.value })} />
              <div>
                <label className="mb-1 block text-sm font-medium">Perfil</label>
                <select className={selectClass} value={manual.tipo} onChange={(e) => setManual({ ...manual, tipo: e.target.value })}>
                  <option value="vendedor">Vendedor</option>
                  {user?.tipo === 'dev' && <option value="admin">Administrador</option>}
                  {user?.tipo === 'dev' && <option value="dev">DEV</option>}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={salvando} className="w-full">
                  Criar acesso
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card className="admin-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound size={20} className="text-[#DF6248]" />
              Novo convite
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={criarConvite} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Perfil</label>
                <select className={selectClass} value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
                  <option value="vendedor">Vendedor</option>
                  {user?.tipo === 'dev' && <option value="admin">Administrador</option>}
                  {user?.tipo === 'dev' && <option value="dev">DEV</option>}
                </select>
              </div>
              <Input label="E-mail específico (opcional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Validade (horas)" type="number" min={1} max={168} value={form.horas_validade} onChange={(e) => setForm({ ...form, horas_validade: e.target.value })} />
              <div className="flex items-end">
                <Button type="submit" disabled={salvando} className="w-full">
                  Gerar link
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {editando && (
        <Card>
          <CardHeader>
            <CardTitle>Editar acesso</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={salvarEdicao} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <Input required label="Nome" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
              <Input required label="E-mail" type="email" value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              <Input label="Telefone" value={editando.telefone || ''} onChange={(e) => setEditando({ ...editando, telefone: e.target.value })} />
              <Input label="Equipe / grupo" disabled={editando.tipo !== 'vendedor'} value={editando.equipe_nome || ''} onChange={(e) => setEditando({ ...editando, equipe_nome: e.target.value })} />
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={salvando}>
                  Salvar
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="admin-card overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users size={20} className="text-[#DF6248]" />
            Equipe interna
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="px-5 py-3">Nome</th>
                  <th className="px-5 py-3">Perfil</th>
                  <th className="px-5 py-3">Equipe</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Último acesso</th>
                  <th className="px-5 py-3">Link de vendas</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {equipe.map((usuario) => {
                  const podeGerenciar = usuario.id !== user?.id && (usuario.tipo === 'vendedor' || user?.tipo === 'dev');
                  return (
                    <tr key={usuario.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium">{usuario.nome}</p>
                        <p className="text-xs text-gray-500">{usuario.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${usuario.tipo === 'dev' ? 'bg-slate-900 text-white' : usuario.tipo === 'admin' ? 'bg-primary/10 text-primary' : 'bg-blue-50 text-blue-700'}`}>
                          <Shield size={12} className="mr-1 inline" />
                          {usuario.tipo.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-4">{usuario.equipe_nome || '—'}</td>
                      <td className="px-5 py-4">{usuario.ativo ? 'Ativo' : 'Inativo'}</td>
                      <td className="px-5 py-4 text-gray-500">{usuario.ultimo_acesso_em ? new Date(usuario.ultimo_acesso_em).toLocaleString('pt-BR') : 'Ainda não entrou'}</td>
                      <td className="px-5 py-4">
                        {usuario.tipo === 'vendedor' && (
                          <div className="flex min-w-[190px] items-center gap-2">
                            <Button size="sm" type="button" variant="outline" disabled={gerandoLink === usuario.id || !usuario.ativo} onClick={() => void gerarLinkVendedor(usuario.id)}>
                              <Link2 size={14} className="mr-1" />
                              {gerandoLink === usuario.id ? 'Gerando...' : 'Gerar link'}
                            </Button>
                            {linksVendedores[usuario.id] && (
                              <button type="button" title="Copiar link" onClick={() => navigator.clipboard.writeText(linksVendedores[usuario.id])} className="rounded p-2 text-primary hover:bg-primary/10">
                                <Copy size={15} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          {podeGerenciar && (
                            <>
                              <button type="button" title="Editar" onClick={() => setEditando(usuario)} className="rounded p-2 text-gray-500 hover:bg-gray-100">
                                <Edit3 size={16} />
                              </button>
                              <button type="button" title={usuario.ativo ? 'Desativar' : 'Reativar'} onClick={() => void alterarStatus(usuario)} className="rounded p-2 text-gray-500 hover:bg-gray-100">
                                {usuario.ativo ? <Power size={16} /> : <RotateCcw size={16} />}
                              </button>
                              <button type="button" title="Excluir ou arquivar" onClick={() => void excluir(usuario)} className="rounded p-2 text-red-600 hover:bg-red-50">
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="admin-card overflow-hidden">
        <CardHeader>
          <CardTitle>Convites</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="px-5 py-3">Perfil</th>
                  <th className="px-5 py-3">E-mail</th>
                  <th className="px-5 py-3">Validade</th>
                  <th className="px-5 py-3">Situação</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {convites.map((convite) => {
                  const expirado = new Date(convite.expira_em).getTime() <= Date.now();
                  const situacao = convite.usado_em ? 'Utilizado' : convite.revogado_em ? 'Revogado' : expirado ? 'Expirado' : 'Pendente';
                  return (
                    <tr key={convite.id}>
                      <td className="px-5 py-4 font-medium">{convite.papel}</td>
                      <td className="px-5 py-4">{convite.email_destino || 'Livre'}</td>
                      <td className="px-5 py-4">{new Date(convite.expira_em).toLocaleString('pt-BR')}</td>
                      <td className="px-5 py-4">{situacao}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {!convite.usado_em && (
                            <Button size="sm" variant="outline" onClick={() => void reemitir(convite.id)}>
                              <RotateCcw size={14} className="mr-1" />
                              Reemitir
                            </Button>
                          )}
                          {situacao === 'Pendente' && (
                            <button onClick={() => void revogar(convite.id)} title="Revogar" className="rounded p-2 text-red-600 hover:bg-red-50">
                              <Trash2 size={17} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
