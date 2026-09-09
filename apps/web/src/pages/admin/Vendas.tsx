import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@ui/index';
import { Calculator, CheckCircle2, FileSignature, Plus, RefreshCw, Search, ShoppingCart, UserPlus } from 'lucide-react';

type Cliente = {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
};
type Evento = { id: string; nome: string; local: string; ativo: boolean };
type Lote = {
  id: string;
  evento_id: string;
  nome: string;
  vagas_disponíveis: number;
  valor_base: string;
  ativo: boolean;
};
type Pacote = {
  id: string;
  lote_id: string;
  nome: string;
  descricao: string | null;
  valor_total: string;
  modalidade_hospedagem: string | null;
  disponibilidade: string | null;
  ativo: boolean;
};
type Item = {
  id: string;
  nome: string;
  descricao: string | null;
  valor: string;
  tipo: string;
  ativo: boolean;
};
type Venda = {
  id: string;
  status: string;
  checkout_estado: string;
  valor_total: string;
  cliente_nome: string;
  cliente_email: string;
  vendedor_nome: string | null;
  evento_nome: string;
  lote_nome: string;
  pacote_nome: string | null;
  criado_em: string;
  pagamento: {
    status: string;
    status_reconciliado: string;
    metodo: string;
  } | null;
  contrato: { status: string; versao: number } | null;
};
type Vendedor = { id: string; nome: string; email: string };

const dinheiro = (valor: number | string | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0));
const statusLabel: Record<string, string> = {
  pacote_montado: 'Pacote montado',
  checkout_iniciado: 'Checkout iniciado',
  aguardando_pagamento: 'Aguardando pagamento',
  contrato_gerado: 'Contrato gerado',
  cliente_confirmado: 'Cliente confirmado',
  abandonado: 'Abandonado',
};
const FORM_CLIENTE = {
  nome: '',
  email: '',
  cpf: '',
  telefone: '',
  data_nascimento: '',
  endereco: '',
  senha: '',
};

export default function Vendas() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [formCliente, setFormCliente] = useState(FORM_CLIENTE);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [pacoteId, setPacoteId] = useState('');
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [cupom, setCupom] = useState('');
  const [calculo, setCalculo] = useState<any>(null);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarVendas = async () => {
    const response = await api.get('/admin/vendas/reservas');
    setVendas(response.data.reservas || []);
  };

  useEffect(() => {
    const iniciar = async () => {
      setCarregando(true);
      try {
        const [eventosResponse, vendedoresResponse] = await Promise.all([api.get('/eventos'), user?.tipo === 'admin' || user?.tipo === 'dev' ? api.get('/admin/usuarios?tipo=vendedor&limite=100') : Promise.resolve({ data: { usuarios: [] } })]);
        setEventos((eventosResponse.data.eventos || []).filter((item: Evento) => item.ativo));
        setVendedores(
          (vendedoresResponse.data.usuarios || []).map((item: Vendedor) => ({
            id: item.id,
            nome: item.nome,
            email: item.email,
          }))
        );
        await carregarVendas();
      } catch (err: any) {
        setErro(err.response?.data?.erro || 'Não foi possível carregar a operação comercial.');
      } finally {
        setCarregando(false);
      }
    };
    void iniciar();
  }, [user?.tipo]);

  const buscarClientes = async () => {
    try {
      const response = await api.get('/admin/vendas/clientes', {
        params: { busca: buscaCliente.trim(), limite: 20 },
      });
      setClientes(response.data.clientes || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível buscar clientes.');
    }
  };

  const selecionarEvento = async (id: string) => {
    setEventoId(id);
    setLoteId('');
    setPacoteId('');
    setCalculo(null);
    if (!id) {
      setLotes([]);
      return;
    }
    try {
      const response = await api.get(`/lotes/evento/${id}`);
      setLotes(response.data.lotes || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar os lotes.');
    }
  };

  const selecionarLote = async (id: string) => {
    setLoteId(id);
    setPacoteId('');
    setCalculo(null);
    if (!id) {
      setPacotes([]);
      setItens([]);
      return;
    }
    try {
      const [pacotesResponse, itensResponse] = await Promise.all([api.get(`/pacotes/lotes/${id}/pacotes`), api.get(`/pacotes/lotes/${id}/itens`)]);
      setPacotes(pacotesResponse.data.pacotes || []);
      setItens(itensResponse.data.itens || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar modalidades e adicionais.');
    }
  };

  const payload = useMemo(
    () => ({
      usuario_id: cliente?.id,
      vendedor_id: vendedorId || undefined,
      lote_id: loteId,
      pacote_id: pacoteId || undefined,
      cupom_codigo: cupom.trim() || undefined,
      itens: itens
        .filter((item) => (quantidades[item.id] || 0) > 0)
        .map((item) => ({
          id: item.id,
          nome: item.nome,
          tipo: item.tipo,
          valor: Number(item.valor),
          quantidade: quantidades[item.id],
        })),
    }),
    [cliente, vendedorId, loteId, pacoteId, cupom, itens, quantidades]
  );

  const calcular = async () => {
    setErro(null);
    setMensagem(null);
    if (!cliente || !loteId) {
      setErro('Selecione o cliente e o lote antes de calcular.');
      return;
    }
    setSalvando(true);
    try {
      const response = await api.post('/admin/vendas/calcular', payload);
      setCalculo(response.data);
    } catch (err: any) {
      setCalculo(null);
      setErro(err.response?.data?.erro || 'Não foi possível calcular esta venda.');
    } finally {
      setSalvando(false);
    }
  };

  const criarCliente = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro(null);
    setSenhaGerada(null);
    setSalvando(true);
    try {
      const response = await api.post('/admin/vendas/clientes', {
        ...formCliente,
        vendedor_id: vendedorId || undefined,
      });
      const novo = response.data.usuario as Cliente;
      setCliente(novo);
      setClientes([novo]);
      setSenhaGerada(response.data.senha_gerada || null);
      setFormCliente(FORM_CLIENTE);
      setMostrarCadastro(false);
      setMensagem('Cliente criado e selecionado para a venda.');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível criar o cliente.');
    } finally {
      setSalvando(false);
    }
  };

  const reservar = async () => {
    setErro(null);
    setMensagem(null);
    if (!calculo) {
      setErro('Calcule o preço antes de reservar.');
      return;
    }
    setSalvando(true);
    try {
      const response = await api.post('/admin/vendas/reservar', payload);
      setMensagem(`${response.data.mensagem}. Reserva ${response.data.reserva_id} criada; o cliente deve concluir contrato e pagamento.`);
      setCalculo(null);
      await carregarVendas();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível registrar a venda.');
    } finally {
      setSalvando(false);
    }
  };

  const eventoSelecionado = eventos.find((item) => item.id === eventoId);
  const loteSelecionado = lotes.find((item) => item.id === loteId);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Operação comercial</p>
          <h1 className="admin-title">Nova venda interna</h1>
          <p className="admin-subtitle">Cadastre ou selecione o cliente, monte o pacote, aplique uma promoção configurada e reserve a vaga. O contrato e o pagamento continuam dependendo da validação eletrônica do cliente.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void carregarVendas()} className="flex items-center gap-2">
          <RefreshCw size={16} /> Atualizar vendas
        </Button>
      </div>
      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      {mensagem && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="mr-2 inline" size={17} />
          {mensagem}
          {senhaGerada && (
            <>
              <br />
              <strong>Senha temporária:</strong> {senhaGerada} — entregue ao cliente por canal seguro.
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart size={20} className="text-primary" /> Composição da venda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">1. Cliente</h2>
                <Button type="button" variant="outline" onClick={() => setMostrarCadastro((value) => !value)} className="flex items-center gap-2">
                  <UserPlus size={16} /> {mostrarCadastro ? 'Fechar cadastro' : 'Novo cliente'}
                </Button>
              </div>
              {!mostrarCadastro && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void buscarClientes();
                  }}
                  className="flex gap-2"
                >
                  <Input value={buscaCliente} onChange={(event) => setBuscaCliente(event.target.value)} placeholder="Nome, e-mail ou CPF" className="flex-1" />
                  <Button type="submit" variant="outline" className="flex items-center gap-2">
                    <Search size={16} /> Buscar
                  </Button>
                </form>
              )}
              {mostrarCadastro && (
                <form onSubmit={criarCliente} className="grid grid-cols-1 gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 md:grid-cols-2">
                  <Input
                    label="Nome completo"
                    required
                    value={formCliente.nome}
                    onChange={(event) =>
                      setFormCliente((form) => ({
                        ...form,
                        nome: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="E-mail"
                    required
                    type="email"
                    value={formCliente.email}
                    onChange={(event) =>
                      setFormCliente((form) => ({
                        ...form,
                        email: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="CPF"
                    required
                    placeholder="Somente números"
                    value={formCliente.cpf}
                    onChange={(event) =>
                      setFormCliente((form) => ({
                        ...form,
                        cpf: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Telefone / WhatsApp"
                    required
                    value={formCliente.telefone}
                    onChange={(event) =>
                      setFormCliente((form) => ({
                        ...form,
                        telefone: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Data de nascimento"
                    required
                    type="date"
                    value={formCliente.data_nascimento}
                    onChange={(event) =>
                      setFormCliente((form) => ({
                        ...form,
                        data_nascimento: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Endereço completo"
                    required
                    value={formCliente.endereco}
                    onChange={(event) =>
                      setFormCliente((form) => ({
                        ...form,
                        endereco: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Senha (opcional)"
                    type="password"
                    value={formCliente.senha}
                    onChange={(event) =>
                      setFormCliente((form) => ({
                        ...form,
                        senha: event.target.value,
                      }))
                    }
                  />
                  <div className="flex items-end">
                    <Button type="submit" disabled={salvando} className="w-full">
                      {salvando ? 'Salvando...' : 'Cadastrar cliente'}
                    </Button>
                  </div>
                </form>
              )}
              {!mostrarCadastro && clientes.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-gray-200 p-2">
                  {clientes.map((item) => (
                    <button type="button" key={item.id} onClick={() => setCliente(item)} className={`w-full rounded-lg border p-3 text-left transition ${cliente?.id === item.id ? 'border-primary bg-primary/5' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'}`}>
                      <span className="font-medium text-gray-900">{item.nome}</span>
                      <span className="block text-xs text-gray-500">
                        {item.email} · CPF {item.cpf || 'não informado'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {cliente && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  <strong>Cliente selecionado:</strong> {cliente.nome} · {cliente.email}
                  <button
                    type="button"
                    onClick={() => {
                      setCliente(null);
                      setCalculo(null);
                    }}
                    className="ml-3 text-xs font-semibold underline"
                  >
                    Trocar
                  </button>
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-5 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Vendedor responsável</label>
                <select className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" value={vendedorId} onChange={(event) => setVendedorId(event.target.value)} disabled={user?.tipo === 'vendedor'}>
                  <option value="">Sem atribuição de vendedor</option>
                  {user?.tipo === 'vendedor' && <option value={user.id}>{user.nome} (você)</option>}
                  {(user?.tipo === 'admin' || user?.tipo === 'dev') &&
                    vendedores.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} — {item.email}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-end text-sm text-gray-500">A comissão seguirá a regra ativa do vendedor e será congelada na reserva.</div>
            </section>

            <section className="space-y-4 border-t border-gray-100 pt-5">
              <h2 className="font-semibold text-gray-900">2. Evento e pacote</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Excursão</label>
                  <select className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" value={eventoId} onChange={(event) => void selecionarEvento(event.target.value)}>
                    <option value="">Selecione uma excursão</option>
                    {eventos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} — {item.local}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Lote / período</label>
                  <select className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" value={loteId} onChange={(event) => void selecionarLote(event.target.value)} disabled={!eventoId}>
                    <option value="">Selecione o lote</option>
                    {lotes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} — {item.vagas_disponíveis} vagas
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Modalidade / pacote</label>
                <select
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={pacoteId}
                  onChange={(event) => {
                    setPacoteId(event.target.value);
                    setCalculo(null);
                  }}
                  disabled={!loteId}
                >
                  <option value="">Usar valor-base do lote ({dinheiro(loteSelecionado?.valor_base)})</option>
                  {pacotes
                    .filter((item) => item.ativo && item.disponibilidade !== 'esgotado')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} — {dinheiro(item.valor_total)}
                      </option>
                    ))}
                </select>
              </div>
            </section>

            {itens.length > 0 && (
              <section className="space-y-3 border-t border-gray-100 pt-5">
                <h2 className="font-semibold text-gray-900">3. Adicionais</h2>
                {itens.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.nome}</p>
                      <p className="text-xs text-gray-500">
                        {item.descricao || item.tipo} · {dinheiro(item.valor)}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={quantidades[item.id] || 0}
                      onChange={(event) => {
                        setQuantidades((state) => ({
                          ...state,
                          [item.id]: Math.max(0, Number(event.target.value) || 0),
                        }));
                        setCalculo(null);
                      }}
                      className="w-24"
                    />
                  </div>
                ))}
              </section>
            )}
            <section className="space-y-3 border-t border-gray-100 pt-5">
              <h2 className="font-semibold text-gray-900">4. Promoção configurada</h2>
              <Input
                label="Código do cupom (opcional)"
                value={cupom}
                onChange={(event) => {
                  setCupom(event.target.value);
                  setCalculo(null);
                }}
                placeholder="Digite um cupom criado pelo administrador"
              />
              <p className="text-xs text-gray-500">O servidor valida evento, pacote, vendedor, valor mínimo, validade e limite por cliente.</p>
            </section>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" disabled={salvando} onClick={() => void calcular()} className="flex items-center gap-2">
                <Calculator size={17} /> Calcular preço
              </Button>
              <Button type="button" disabled={salvando || !calculo} onClick={() => void reservar()}>
                {salvando ? 'Processando...' : 'Reservar vaga e registrar venda'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo autoritativo</CardTitle>
            </CardHeader>
            <CardContent>
              {!calculo ? (
                <p className="text-sm text-gray-500">O resumo aparecerá após o cálculo no servidor.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span>Base</span>
                    <strong>{dinheiro(calculo.valor_base)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Adicionais</span>
                    <strong>{dinheiro(calculo.subtotal - calculo.valor_base)}</strong>
                  </div>
                  <div className="flex justify-between text-green-700">
                    <span>Desconto promocional</span>
                    <strong>- {dinheiro(calculo.desconto_cupom)}</strong>
                  </div>
                  <div className="border-t pt-3 text-lg font-bold">
                    <div className="flex justify-between">
                      <span>Total da reserva</span>
                      <span>{dinheiro(calculo.valor_total)}</span>
                    </div>
                  </div>
                  <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">A reserva segura a vaga por 30 minutos. O cliente ainda deverá revisar o contrato oficial, confirmar por OTP e concluir o pagamento.</p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Últimas vendas internas</CardTitle>
            </CardHeader>
            <CardContent>
              {carregando ? (
                <p className="text-sm text-gray-500">Carregando...</p>
              ) : vendas.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma venda interna registrada.</p>
              ) : (
                <div className="space-y-3">
                  {vendas.slice(0, 8).map((venda) => (
                    <div key={venda.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">{venda.cliente_nome}</p>
                          <p className="text-xs text-gray-500">
                            {venda.evento_nome} · {venda.pacote_nome || venda.lote_nome}
                          </p>
                          {venda.vendedor_nome && <p className="mt-1 text-xs font-semibold text-primary">Vendedor: {venda.vendedor_nome}</p>}
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{statusLabel[venda.status] || venda.status}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <span>{dinheiro(venda.valor_total)}</span>
                        <div className="flex gap-2">
                          <Link className="font-semibold text-primary hover:underline" to={`/admin/contratos?reserva=${encodeURIComponent(venda.id)}`}>
                            <FileSignature size={14} className="mr-1 inline" />
                            Contrato
                          </Link>
                          <span>{venda.pagamento?.status_reconciliado || 'sem pagamento'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {eventoSelecionado && <p className="text-xs text-gray-400">Operando: {eventoSelecionado.nome} · regras e preços sempre calculados pelo servidor.</p>}
    </div>
  );
}
