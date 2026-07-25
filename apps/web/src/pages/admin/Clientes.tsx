import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, Button, Input } from '@ui/index';
import { Plus, X, Pencil, Power, Search } from 'lucide-react';

interface Usuario {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  rg: string | null;
  telefone: string | null;
  tipo: 'cliente' | 'vendedor' | 'admin';
  data_nascimento: string | null;
  estado_civil: string | null;
  profissao: string | null;
  endereco: string | null;
  nacionalidade: string | null;
  ativo: boolean;
  criado_em: string;
}

const TIPO_LABEL: Record<string, string> = {
  cliente: 'Cliente',
  vendedor: 'Vendedor',
  admin: 'Administrador',
};

const FORM_VAZIO = {
  nome: '',
  email: '',
  cpf: '',
  rg: '',
  telefone: '',
  tipo: 'cliente' as 'cliente' | 'vendedor' | 'admin',
  data_nascimento: '',
  estado_civil: '',
  profissao: '',
  endereco: '',
  nacionalidade: 'Brasileira',
  senha: '',
};

export default function Clientes() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtroTipo, setFiltroTipo] = useState<string>('');
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
      rg: usuario.rg || '',
      telefone: usuario.telefone || '',
      tipo: usuario.tipo,
      data_nascimento: usuario.data_nascimento ? usuario.data_nascimento.substring(0, 10) : '',
      estado_civil: usuario.estado_civil || '',
      profissao: usuario.profissao || '',
      endereco: usuario.endereco || '',
      nacionalidade: usuario.nacionalidade || 'Brasileira',
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

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro(null);
    setAvisoSenhaGerada(null);

    if (!form.nome.trim() || !form.email.trim()) {
      setFormErro('Nome e e-mail são obrigatórios.');
      return;
    }

    setSalvando(true);
    try {
      const payload: any = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        cpf: form.cpf.trim() || undefined,
        rg: form.rg.trim() || undefined,
        telefone: form.telefone.trim() || undefined,
        tipo: form.tipo,
        data_nascimento: form.data_nascimento || undefined,
        estado_civil: form.estado_civil.trim() || undefined,
        profissao: form.profissao.trim() || undefined,
        endereco: form.endereco.trim() || undefined,
        nacionalidade: form.nacionalidade.trim() || undefined,
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
      const response = await api.patch(`/admin/usuarios/${usuario.id}/status`, { ativo: !usuario.ativo });
      setUsuarios((prev) => prev.map((u) => (u.id === usuario.id ? response.data.usuario : u)));
    } catch (err: any) {
      alert(err.response?.data?.erro || `Erro ao ${acao} usuário.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Clientes & Usuários</h1>
        <Button onClick={mostrarForm ? fecharForm : abrirNovo} className="flex items-center gap-2">
          {mostrarForm ? <X size={16} /> : <Plus size={16} />}
          {mostrarForm ? 'Cancelar' : 'Novo Cadastro'}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleBuscar} className="flex-1 flex gap-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou CPF"
          />
          <Button type="submit" variant="outline" className="flex items-center gap-2 shrink-0">
            <Search size={16} /> Buscar
          </Button>
        </form>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todos os tipos</option>
          <option value="cliente">Clientes</option>
          <option value="vendedor">Vendedores</option>
          <option value="admin">Administradores</option>
        </select>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>}

      {mostrarForm && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSalvar} className="space-y-4">
              <h2 className="font-semibold text-gray-900">
                {editandoId ? 'Editar cadastro' : 'Novo cadastro'}
              </h2>

              {formErro && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{formErro}</div>}
              {avisoSenhaGerada && (
                <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm">
                  Cadastro criado. Senha temporária gerada: <strong>{avisoSenhaGerada}</strong>
                  <br />Repasse essa senha ao usuário e oriente a troca no primeiro acesso.
                  <div className="mt-2">
                    <Button type="button" variant="outline" onClick={fecharForm}>Fechar</Button>
                  </div>
                </div>
              )}

              {!avisoSenhaGerada && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Nome completo"
                      value={form.nome}
                      onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                    />
                    <Input
                      label="E-mail"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                    <Input
                      label="CPF"
                      value={form.cpf}
                      onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
                      placeholder="Somente números"
                    />
                    <Input
                      label="RG"
                      value={form.rg}
                      onChange={(e) => setForm((f) => ({ ...f, rg: e.target.value }))}
                    />
                    <Input
                      label="Telefone / WhatsApp"
                      value={form.telefone}
                      onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                    />
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de usuário</label>
                      <select
                        value={form.tipo}
                        onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as any }))}
                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="cliente">Cliente</option>
                        <option value="vendedor">Vendedor</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                    <Input
                      label="Data de nascimento"
                      type="date"
                      value={form.data_nascimento}
                      onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))}
                    />
                    <Input
                      label="Estado civil"
                      value={form.estado_civil}
                      onChange={(e) => setForm((f) => ({ ...f, estado_civil: e.target.value }))}
                    />
                    <Input
                      label="Profissão"
                      value={form.profissao}
                      onChange={(e) => setForm((f) => ({ ...f, profissao: e.target.value }))}
                    />
                    <Input
                      label="Nacionalidade"
                      value={form.nacionalidade}
                      onChange={(e) => setForm((f) => ({ ...f, nacionalidade: e.target.value }))}
                    />
                    <Input
                      label="Endereço"
                      value={form.endereco}
                      onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                      className="md:col-span-2"
                    />
                    <Input
                      label={editandoId ? 'Nova senha (opcional)' : 'Senha (opcional — gera uma automática)'}
                      type="text"
                      value={form.senha}
                      onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                      placeholder="Mín. 8 caracteres"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={salvando}>
                      {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Criar cadastro'}
                    </Button>
                    <Button type="button" variant="outline" onClick={fecharForm}>Cancelar</Button>
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Nome</th>
                  <th className="px-6 py-4 font-medium">E-mail</th>
                  <th className="px-6 py-4 font-medium">CPF</th>
                  <th className="px-6 py-4 font-medium">Tipo</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Carregando...</td>
                  </tr>
                )}
                {!isLoading && usuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{usuario.nome}</td>
                    <td className="px-6 py-4">{usuario.email}</td>
                    <td className="px-6 py-4">{usuario.cpf || '-'}</td>
                    <td className="px-6 py-4">{TIPO_LABEL[usuario.tipo] || usuario.tipo}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        usuario.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => abrirEdicao(usuario)}
                        className="text-gray-500 hover:text-primary transition-colors p-1"
                        title="Editar cadastro"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleAlternarStatus(usuario)}
                        className="text-gray-500 hover:text-red-600 transition-colors p-1"
                        title={usuario.ativo ? 'Desativar acesso' : 'Reativar acesso'}
                      >
                        <Power size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoading && usuarios.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Nenhum cadastro encontrado</td>
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
