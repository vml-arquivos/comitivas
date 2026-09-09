import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';
import { destinoSeguro } from '../../utils/checkoutIntent';

const estadoInicial = {
  nome: '',
  cpf: '',
  telefone: '',
  data_nascimento: '',
  endereco: '',
};

export default function DadosCadastrais() {
  const [form, setForm] = useState(estadoInicial);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
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
          data_nascimento: usuario.data_nascimento ? String(usuario.data_nascimento).slice(0, 10) : '',
          endereco: usuario.endereco || '',
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
          <p className="mt-2 text-sm text-slate-200">Mantenha os dados essenciais da reserva e do contrato atualizados.</p>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Input label="Nome completo *" name="nome" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} required /></div>
            <Input label="CPF *" name="cpf" value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} required />
            <Input label="WhatsApp *" name="telefone" value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} required />
            <Input label="Data de nascimento *" type="date" name="data_nascimento" value={form.data_nascimento} onChange={(event) => setForm({ ...form, data_nascimento: event.target.value })} required />
            <div className="sm:col-span-2"><Input label="Endereço completo *" name="endereco" value={form.endereco} onChange={(event) => setForm({ ...form, endereco: event.target.value })} placeholder="Logradouro, número, complemento, bairro, cidade/UF e CEP" required /></div>
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
