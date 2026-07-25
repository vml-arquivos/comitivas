import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileText } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';
import { destinoSeguro } from '../../utils/checkoutIntent';

const estadoInicial = {
  nome: '',
  cpf: '',
  rg: '',
  telefone: '',
  data_nascimento: '',
  estado_civil: '',
  profissao: '',
  endereco: '',
  nacionalidade: 'Brasileira',
};

export default function DadosCadastrais() {
  const [form, setForm] = useState(estadoInicial);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = destinoSeguro(searchParams.get('redirect'), '/minhas-reservas');

  useEffect(() => {
    api.get('/auth/perfil')
      .then((response) => {
        const usuario = response.data.usuario;
        setForm({
          nome: usuario.nome || '',
          cpf: usuario.cpf || '',
          rg: usuario.rg || '',
          telefone: usuario.telefone || '',
          data_nascimento: usuario.data_nascimento ? String(usuario.data_nascimento).slice(0, 10) : '',
          estado_civil: usuario.estado_civil || '',
          profissao: usuario.profissao || '',
          endereco: usuario.endereco || '',
          nacionalidade: usuario.nacionalidade || 'Brasileira',
        });
      })
      .catch((err) => setError(err.response?.data?.erro || 'Não foi possível carregar seus dados.'))
      .finally(() => setIsLoading(false));
  }, []);

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
          <p className="mt-2 text-sm text-slate-200">Preencha agora para receber seu contrato completo. Você pode continuar mesmo com algum campo em branco.</p>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Input label="Nome completo" name="nome" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /></div>
            <Input label="CPF" name="cpf" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} />
            <Input label="RG" name="rg" value={form.rg} onChange={(event) => setForm({ ...form, rg: event.target.value })} />
            <Input label="WhatsApp" name="telefone" value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} />
            <Input label="Data de nascimento" type="date" name="data_nascimento" value={form.data_nascimento} onChange={(event) => setForm({ ...form, data_nascimento: event.target.value })} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Estado civil</label>
              <select name="estado_civil" value={form.estado_civil} onChange={(event) => setForm({ ...form, estado_civil: event.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Não informado</option>
                <option value="Solteiro(a)">Solteiro(a)</option>
                <option value="Casado(a)">Casado(a)</option>
                <option value="Divorciado(a)">Divorciado(a)</option>
                <option value="Viúvo(a)">Viúvo(a)</option>
                <option value="União Estável">União estável</option>
              </select>
            </div>
            <Input label="Profissão" name="profissao" value={form.profissao} onChange={(event) => setForm({ ...form, profissao: event.target.value })} />
            <div className="sm:col-span-2"><Input label="Endereço completo" name="endereco" value={form.endereco} onChange={(event) => setForm({ ...form, endereco: event.target.value })} placeholder="Logradouro, número, complemento, bairro, cidade/UF e CEP" /></div>
            <Input label="Nacionalidade" name="nacionalidade" value={form.nacionalidade} onChange={(event) => setForm({ ...form, nacionalidade: event.target.value })} />
            <div className="flex items-end text-xs leading-5 text-slate-500"><CheckCircle2 size={16} className="mr-2 shrink-0 text-emerald-600" />Se algum dado ficar em branco, o contrato será gerado com “________” nesse campo.</div>
            <div className="mt-3 flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => navigate(redirect)}>Preencher depois</Button>
              <Button type="submit" isLoading={isSaving}>Salvar e continuar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
