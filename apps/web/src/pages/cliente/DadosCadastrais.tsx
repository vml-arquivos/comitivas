import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';
import { destinoSeguro } from '../../utils/checkoutIntent';
import { buscarEnderecoPorCep, formatarCep } from '../../utils/cep';

const estadoInicial = {
  nome: '',
  cpf: '',
  telefone: '',
  sexo: '',
  data_nascimento: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
};

export default function DadosCadastrais() {
  const [form, setForm] = useState(estadoInicial);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [cepBuscando, setCepBuscando] = useState(false);
  const [cepMensagem, setCepMensagem] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = destinoSeguro(searchParams.get('redirect'), '/minha-conta');

  useEffect(() => {
    api.get('/auth/perfil')
      .then((response) => {
        const usuario = response.data.usuario;
        setForm({
          nome: usuario.nome || '',
          cpf: usuario.cpf || '',
          telefone: usuario.telefone || '',
          sexo: usuario.sexo || '',
          data_nascimento: usuario.data_nascimento ? String(usuario.data_nascimento).slice(0, 10) : '',
          cep: usuario.cep || '',
          logradouro: usuario.logradouro || '',
          numero: usuario.numero || '',
          complemento: usuario.complemento || '',
          bairro: usuario.bairro || '',
          cidade: usuario.cidade || '',
          estado: usuario.estado || '',
        });
      })
      .catch((err) => setError(err.response?.data?.erro || 'Não foi possível carregar seus dados.'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCepChange = async (valor: string) => {
    const cep = formatarCep(valor);
    setForm((atual) => ({ ...atual, cep }));
    if (cep.replace(/\D/g, '').length !== 8) {
      setCepMensagem('');
      return;
    }
    setCepBuscando(true);
    setCepMensagem('Consultando CEP...');
    try {
      const endereco = await buscarEnderecoPorCep(cep);
      setForm((atual) => ({ ...atual, cep: formatarCep(endereco.cep), logradouro: endereco.logradouro, bairro: endereco.bairro, cidade: endereco.cidade, estado: endereco.estado }));
      setCepMensagem('Endereço localizado. Confira e informe o número.');
    } catch (err: any) {
      setCepMensagem(err?.message || 'Não foi possível localizar este CEP.');
    } finally {
      setCepBuscando(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      await api.put('/auth/perfil', form);
      navigate(redirect, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Não foi possível salvar seus dados.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="py-16 text-center text-slate-500">Carregando seus dados...</div>;

  return (
    <div className="mx-auto max-w-3xl py-6">
      <Card className="overflow-hidden shadow-xl">
        <CardHeader className="border-0 bg-gradient-to-r from-slate-950 to-primary text-white">
          <CardTitle className="flex items-center gap-2 text-2xl"><FileText size={24} />Dados do contrato</CardTitle>
          <p className="mt-2 text-sm text-slate-200">Mantenha os dados essenciais da reserva e do contrato atualizados.</p>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Input label="Nome completo *" name="nome" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} required /></div>
            <Input label="CPF *" name="cpf" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} required />
            <Input label="WhatsApp *" name="telefone" value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} required />
            <label className="block text-sm font-semibold text-slate-700">Sexo *<select name="sexo" value={form.sexo} onChange={(event) => setForm({ ...form, sexo: event.target.value })} required className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">Selecione</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>
            <Input label="Data de nascimento *" type="date" name="data_nascimento" value={form.data_nascimento} onChange={(event) => setForm({ ...form, data_nascimento: event.target.value })} required />
            <div className="sm:col-span-2"><Input label="CEP *" name="cep" value={form.cep} onChange={(event) => void handleCepChange(event.target.value)} inputMode="numeric" maxLength={9} placeholder="00000-000" required />{cepMensagem && <p className={`mt-1 text-xs ${cepBuscando ? 'text-slate-500' : 'text-emerald-700'}`}>{cepMensagem}</p>}</div>
            <div className="sm:col-span-2"><Input label="Logradouro *" name="logradouro" value={form.logradouro} onChange={(event) => setForm({ ...form, logradouro: event.target.value })} placeholder="Rua, avenida, estrada..." required /></div>
            <Input label="Número *" name="numero" value={form.numero} onChange={(event) => setForm({ ...form, numero: event.target.value })} required />
            <Input label="Complemento" name="complemento" value={form.complemento} onChange={(event) => setForm({ ...form, complemento: event.target.value })} placeholder="Apartamento, bloco, casa..." />
            <Input label="Bairro *" name="bairro" value={form.bairro} onChange={(event) => setForm({ ...form, bairro: event.target.value })} required />
            <Input label="Cidade *" name="cidade" value={form.cidade} onChange={(event) => setForm({ ...form, cidade: event.target.value })} required />
            <Input label="Estado *" name="estado" value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value.toUpperCase().slice(0, 2) })} maxLength={2} placeholder="UF" required />
            <div className="mt-3 flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => navigate(redirect)}>Cancelar</Button>
              <Button type="submit" isLoading={isSaving}>Salvar e continuar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
