import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, Button, Input } from '@ui/index';
import { Download, Eye, Plus, X, Pencil, Power, Search, Trash2 } from 'lucide-react';

interface Usuario {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
  tipo: 'cliente' | 'vendedor' | 'admin' | 'dev';
  data_nascimento: string | null;
  endereco: string | null;
  ativo: boolean;
  criado_em: string;
}

const TIPO_LABEL: Record<string, string> = {
  cliente: 'Cliente',
  vendedor: 'Vendedor',
  admin: 'Administrador',
  dev: 'DEV',
};

const FORM_VAZIO = {
  nome: '',
  email: '',
  cpf: '',
  telefone: '',
  tipo: 'cliente' as 'cliente' | 'vendedor' | 'admin' | 'dev',
  data_nascimento: '',
  endereco: '',
  senha: '',
};

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toUpperCase();

export default function Clientes() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtroTipo, setFiltroTipo] = useState<string>('cliente');
  const [busca, setBusca] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);
  const [avisoSenhaGerada, setAvisoSenhaGerada] = useState<string | null>(null);

  const carregar = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (filtroTipo) params.tipo = filtroTipo;
      if (busca.trim()) params.busca = busca.trim();
      const response = await api.get('/admin/usuarios', { params });
      setUsuarios(response.data.usuarios || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar clientes/usuários.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    carregar();
  };

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setFormErro(null);
    setAvisoSenhaGerada(null);
    setMostrarForm(true);
  };

  const abrirEdicao = (usuario: Usuario) => {
    setEditandoId(usuario.id);
    setForm({
      nome: usuario.nome,
      email: usuario.email,
      cpf: usuario.cpf || '',
      telefone: usuario.telefone || '',
      tipo: usuario.tipo,
      data_nascimento: usuario.data_nascimento ? usuario.data_nascimento.substring(0, 10) : '',
      endereco: usuario.endereco || '',
      senha: '',
    });
    setFormErro(null);
    setAvisoSenhaGerada(null);
    setMostrarForm(true);
  };

  const fecharForm = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setFormErro(null);
  };

  useEffect(() => {
    const editarId = searchParams.get('editar');
    if (!editarId || isLoading || mostrarForm) return;
    const usuario = usuarios.find((item) => item.id === editarId);
    if (!usuario) return;
    abrirEdicao(usuario);
    const proximos = new URLSearchParams(searchParams);
    proximos.delete('editar');
    setSearchParams(proximos, { replace: true });
  }, [isLoading, mostrarForm, searchParams, setSearchParams, usuarios]);

  const exportarClientes = () => {
    const params = new URLSearchParams();
    if (busca.trim()) params.set('busca', busca.trim());
    const sufixo = params.toString() ? `?${params.toString()}` : '';
    window.open(`/api/admin/clientes/exportar${sufixo}`, '_blank', 'noopener,noreferrer');
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro(null);
    setAvisoSenhaGerada(null);

    if (!form.nome.trim() || !form.email.trim()) {
      setFormErro('Nome e e-mail são obrigatórios.');
      return;
    }
    if (form.tipo === 'cliente' && (!form.cpf.trim() || !form.telefone.trim() || !form.data_nascimento || !form.endereco.trim())) {
      setFormErro('Para clientes, informe CPF, telefone, data de nascimento e endereço.');
      return;
    }

    setSalvando(true);
    try {
      const payload: any = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        cpf: form.cpf.trim() || undefined,
        telefone: form.telefone.trim() || undefined,
        tipo: form.tipo,
        data_nascimento: form.data_nascimento || undefined,
        endereco: form.endereco.trim() || undefined,
      };
      if (form.senha.trim()) payload.senha = form.senha.trim();

      if (editandoId) {
        const response = await api.put(`/admin/usuarios/${editandoId}`, payload);
        setUsuarios((prev) => prev.map((u) => (u.id === editandoId ? response.data.usuario : u)));
      } else {
        const response = await api.post('/admin/usuarios', payload);
        setUsuarios((prev) => [response.data.usuario, ...prev]);
        if (response.data.senha_gerada) {
          setAvisoSenhaGerada(response.data.senha_gerada);
          return; // mantém o formulário aberto para o admin copiar a senha
        }
      }
      fecharForm();
    } catch (err: any) {
      setFormErro(err.response?.data?.erro || 'Erro ao salvar cadastro.');
    } finally {
      setSalvando(false);
    }
  };

  const handleAlternarStatus = async (usuario: Usuario) => {
    const acao = usuario.ativo ? 'desativar' : 'reativar';
    if (!confirm(`Deseja ${acao} o acesso de ${usuario.nome}?`)) return;
    try {
      const response = await api.patch(`/admin/usuarios/${usuario.id}/status`, {
        ativo: !usuario.ativo,
      });
      setUsuarios((prev) => prev.map((u) => (u.id === usuario.id ? response.data.usuario : u)));
    } catch (err: any) {
      alert(err.response?.data?.erro || `Erro ao ${acao} usuário.`);
    }
  };

  const handleExcluir = async (usuario: Usuario) => {
    if (!confirm(`Excluir ${usuario.nome}? Se houver registros, o usuário será arquivado para preservar o histórico.`)) return;
    try {
      const response = await api.delete(`/admin/usuarios/${usuario.id}`);
      if (response.data.modo === 'excluido') {
        setUsuarios((prev) => prev.filter((item) => item.id !== usuario.id));
      } else {
        setUsuarios((prev) => prev.map((item) => (item.id === usuario.id ? { ...item, ativo: false } : item)));
      }
      alert(response.data.mensagem || 'Operação concluída.');
    } catch (err: any) {
      alert(err.response?.data?.erro || 'Não foi possível excluir ou arquivar o usuário.');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Relacionamento e cadastro</p>
          <h1 className="admin-title">Clientes e negociações</h1>
          <p className="admin-subtitle">Consulte cadastros, abra a ficha completa e acompanhe cada cliente em um só lugar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportarClientes} className="flex items-center gap-2">
            <Download size={16} /> Exportar clientes
          </Button>
          <Button onClick={mostrarForm ? fecharForm : abrirNovo} className="flex items-center gap-2">
            {mostrarForm ? <X size={16} /> : <Plus size={16} />}
            {mostrarForm ? 'Cancelar' : 'Novo cadastro'}
          </Button>
        </div>
      </div>

      <div className="admin-card flex flex-col gap-3 p-4 sm:flex-row">
        <form onSubmit={handleBuscar} className="flex-1 flex gap-2">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou CPF" />
          <Button type="submit" variant="outline" className="flex items-center gap-2 shrink-0">
            <Search size={16} /> Buscar
          </Button>
        </form>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="admin-field sm:w-56">
          <option value="cliente">Clientes</option>
          <option value="">Todos os tipos</option>
          <option value="vendedor">Vendedores</option>
          <option value="admin">Administradores</option>
          {user?.tipo === 'dev' && <option value="dev">DEV</option>}
        </select>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>}

      {mostrarForm && (
        <Card className="admin-card">
          <CardContent className="p-6">
            <form onSubmit={handleSalvar} className="space-y-4">
              <h2 className="font-semibold text-gray-900">{editandoId ? 'Editar cadastro' : 'Novo cadastro'}</h2>

              {formErro && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{formErro}</div>}
              {avisoSenhaGerada && (
                <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm">
                  Cadastro criado. Senha temporária gerada: <strong>{avisoSenhaGerada}</strong>
                  <br />
                  Repasse essa senha ao usuário e oriente a troca no primeiro acesso.
                  <div className="mt-2">
                    <Button type="button" variant="outline" onClick={fecharForm}>
                      Fechar
                    </Button>
                  </div>
                </div>
              )}

              {!avisoSenhaGerada && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Nome completo" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
                    <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                    <Input label="CPF" value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} placeholder="Somente números" />
                    <Input label="Telefone / WhatsApp" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de usuário</label>
                      <select
                        value={form.tipo}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            tipo: e.target.value as any,
                          }))
                        }
                        className="admin-field"
                      >
                        <option value="cliente">Cliente</option>
                        <option value="vendedor">Vendedor</option>
                        {user?.tipo === 'dev' && <option value="admin">Administrador</option>}
                        {user?.tipo === 'dev' && <option value="dev">DEV</option>}
                      </select>
                    </div>
                    <Input
                      label="Data de nascimento"
                      type="date"
                      value={form.data_nascimento}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          data_nascimento: e.target.value,
                        }))
                      }
                    />
                    <Input label="Endereço" value={form.endereco} onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))} className="md:col-span-2" />
                    <Input label={editandoId ? 'Nova senha (opcional)' : 'Senha (opcional — gera uma automática)'} type="text" value={form.senha} onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))} placeholder="Mín. 8 caracteres" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={salvando}>
                      {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Criar cadastro'}
                    </Button>
                    <Button type="button" variant="outline" onClick={fecharForm}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="admin-card overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>CPF</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  usuarios.map((usuario) => (
                    <tr key={usuario.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf4f5] text-xs font-black text-[#176477]">{iniciais(usuario.nome)}</div>
                          <span className="font-bold text-[#073F50]">{usuario.nome}</span>
                        </div>
                      </td>
                      <td>
                        <div className="text-slate-700">{usuario.email}</div>
                        {usuario.telefone && <div className="mt-0.5 text-xs text-slate-400">{usuario.telefone}</div>}
                      </td>
                      <td>{usuario.cpf || '-'}</td>
                      <td>
                        <span className="admin-status bg-slate-100 text-slate-700">{TIPO_LABEL[usuario.tipo] || usuario.tipo}</span>
                      </td>
                      <td>
                        <span className={`admin-status ${usuario.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{usuario.ativo ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td className="space-x-2 whitespace-nowrap text-right">
                        {usuario.tipo === 'cliente' && (
                          <Link to={`/admin/clientes/${usuario.id}`} className="inline-flex p-1 text-gray-500 transition-colors hover:text-primary" title="Abrir ficha completa" aria-label={`Abrir ficha de ${usuario.nome}`}>
                            <Eye size={18} />
                          </Link>
                        )}
                        <button onClick={() => abrirEdicao(usuario)} className="text-gray-500 hover:text-primary transition-colors p-1" title="Editar cadastro">
                          <Pencil size={18} />
                        </button>
                        <button onClick={() => handleAlternarStatus(usuario)} className="text-gray-500 hover:text-red-600 transition-colors p-1" title={usuario.ativo ? 'Desativar acesso' : 'Reativar acesso'}>
                          <Power size={18} />
                        </button>
                        {usuario.tipo !== 'dev' && usuario.id !== user?.id && (usuario.tipo !== 'admin' || user?.tipo === 'dev') && (
                          <button onClick={() => void handleExcluir(usuario)} className="p-1 text-gray-500 transition-colors hover:text-red-700" title="Excluir ou arquivar">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                {!isLoading && usuarios.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Nenhum cadastro encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
