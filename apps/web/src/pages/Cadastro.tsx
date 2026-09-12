import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth, api } from '../contexts/AuthContext';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@ui/index';
import { destinoSeguro, lerLeadId, lerLeadIntentToken, lerReferenciaVendedor, salvarReferenciaVendedor } from '../utils/checkoutIntent';
import { buscarEnderecoPorCep, formatarCep } from '../utils/cep';

export default function Cadastro() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
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
    senha: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cepBuscando, setCepBuscando] = useState(false);
  const [cepMensagem, setCepMensagem] = useState('');
  const { user, isLoading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = destinoSeguro(searchParams.get('redirect'), '/');
  const referenciaNoDestino = new URLSearchParams(redirect.includes('?') ? redirect.slice(redirect.indexOf('?') + 1) : '').get('ref');
  const referenciaVendedor = searchParams.get('ref') || referenciaNoDestino || lerReferenciaVendedor();
  useEffect(() => {
    if (referenciaVendedor) salvarReferenciaVendedor(referenciaVendedor);
  }, [referenciaVendedor]);

  useEffect(() => {
    if (!authLoading && user) {
      const destinoPadrao = ['admin', 'dev', 'vendedor'].includes(user.tipo) ? '/admin' : '/minha-conta';
      navigate(redirect || destinoPadrao, { replace: true });
    }
  }, [authLoading, navigate, redirect, user]);

  const preencherEnderecoPorCep = async (valor: string) => {
    const cep = valor.replace(/\D/g, '');
    if (cep.length !== 8) {
      setCepMensagem('');
      return;
    }
    setCepBuscando(true);
    setCepMensagem('Consultando CEP...');
    try {
      const endereco = await buscarEnderecoPorCep(cep);
      setFormData((atual) => ({
        ...atual,
        cep: formatarCep(endereco.cep),
        logradouro: endereco.logradouro,
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        estado: endereco.estado,
      }));
      setCepMensagem('Endereço localizado. Confira e informe número e complemento.');
    } catch (err: any) {
      setCepMensagem(err?.message || 'Não foi possível localizar este CEP.');
    } finally {
      setCepBuscando(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const valor = e.target.name === 'cep' ? formatarCep(e.target.value) : e.target.value;
    setFormData((atual) => ({ ...atual, [e.target.name]: valor }));
    if (e.target.name === 'cep') void preencherEnderecoPorCep(valor);
  };

  const validateStep1 = () => {
    if (!formData.nome || !formData.email || !formData.cpf || !formData.telefone || !formData.sexo || !formData.senha) {
      setError('Preencha nome, e-mail, CPF, telefone, sexo e senha');
      return false;
    }
    if (formData.senha.length < 8) {
      setError('Senha deve ter pelo menos 8 caracteres');
      return false;
    }
    const cpf = formData.cpf.replace(/\D/g, '');
    if (cpf.length !== 11) {
      setError('Informe um CPF válido com 11 dígitos');
      return false;
    }
    const telefone = formData.telefone.replace(/\D/g, '');
    if (telefone.length < 10 || telefone.length > 13) {
      setError('Informe um telefone válido com DDD');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.data_nascimento || !formData.cep || !formData.logradouro || !formData.numero || !formData.bairro || !formData.cidade || !formData.estado) {
      setError('Informe a data de nascimento e o endereço completo. Consulte o CEP e informe o número.');
      return false;
    }
    if (new Date(`${formData.data_nascimento}T12:00:00Z`).getTime() >= Date.now()) {
      setError('Informe uma data de nascimento válida');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setError('');
    if (validateStep1()) {
      setStep(2);
    }
  };

  const finalizarCadastro = async () => {
    if (!validateStep2()) return;
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/auth/cadastro', {
        nome: formData.nome,
        email: formData.email,
        cpf: formData.cpf,
        telefone: formData.telefone,
        sexo: formData.sexo,
        data_nascimento: formData.data_nascimento,
        cep: formData.cep,
        logradouro: formData.logradouro,
        numero: formData.numero,
        complemento: formData.complemento,
        bairro: formData.bairro,
        cidade: formData.cidade,
        estado: formData.estado,
        senha: formData.senha,
        lead_id: lerLeadId() || undefined,
        lead_intent_token: lerLeadIntentToken() || undefined,
        vendedor_ref: referenciaVendedor || undefined,
      });
      if (response.data.email_confirmacao_necessaria) {
        navigate(`/confirmar-email?email=${encodeURIComponent(formData.email)}&redirect=${encodeURIComponent(redirect)}`, { replace: true });
      } else {
        login(response.data.usuario);
        navigate(redirect, { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao cadastrar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await finalizarCadastro();
  };

  if (authLoading || user) {
    return <div className="px-4 py-16 text-center text-sm text-slate-500">Verificando sua conta…</div>;
  }

  return (
    <div className="flex justify-center items-center py-12 px-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            {step === 1 ? 'Criar Conta - Dados Básicos' : 'Criar Conta - Dados Contratuais'}
          </CardTitle>
          <p className="text-center text-sm text-gray-600 mt-2">Passo {step} de 2</p>
          {step === 2 && <p className="mt-2 text-center text-xs text-gray-500">Somente os dados necessários para sua reserva e contrato.</p>}
        </CardHeader>
        <CardContent>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">{error}</div>}
          
          <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }} className="space-y-4">
            {step === 1 ? (
              <>
                <Input label="Nome completo *" name="nome" autoComplete="name" value={formData.nome} onChange={handleChange} required />
                <Input label="E-mail *" type="email" name="email" autoComplete="email" inputMode="email" value={formData.email} onChange={handleChange} required />
                <Input label="CPF *" name="cpf" autoComplete="off" inputMode="numeric" maxLength={14} value={formData.cpf} onChange={handleChange} placeholder="000.000.000-00" required />
                <Input label="Telefone *" name="telefone" autoComplete="tel" inputMode="tel" value={formData.telefone} onChange={handleChange} placeholder="(00) 00000-0000" required />
                <label className="block text-sm font-semibold text-slate-700">Sexo *<select name="sexo" value={formData.sexo} onChange={handleChange} required className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">Selecione</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>
                <Input label="Senha *" type="password" name="senha" autoComplete="new-password" value={formData.senha} onChange={handleChange} required minLength={8} />
              </>
            ) : (
              <>
                <Input label="Data de nascimento *" type="date" name="data_nascimento" value={formData.data_nascimento} onChange={handleChange} required />
                <div className="sm:col-span-2"><Input label="CEP *" name="cep" autoComplete="postal-code" inputMode="numeric" maxLength={9} value={formData.cep} onChange={handleChange} placeholder="00000-000" required />{cepMensagem && <p className={`mt-1 text-xs ${cepBuscando ? 'text-slate-500' : 'text-emerald-700'}`}>{cepMensagem}</p>}</div>
                <div className="sm:col-span-2"><Input label="Logradouro *" name="logradouro" autoComplete="street-address" value={formData.logradouro} onChange={handleChange} placeholder="Rua, avenida, estrada..." required /></div>
                <Input label="Número *" name="numero" autoComplete="address-line2" value={formData.numero} onChange={handleChange} required />
                <Input label="Complemento" name="complemento" autoComplete="address-line3" value={formData.complemento} onChange={handleChange} placeholder="Apartamento, bloco, casa..." />
                <Input label="Bairro *" name="bairro" autoComplete="address-level3" value={formData.bairro} onChange={handleChange} required />
                <Input label="Cidade *" name="cidade" autoComplete="address-level2" value={formData.cidade} onChange={handleChange} required />
                <Input label="Estado *" name="estado" autoComplete="address-level1" maxLength={2} value={formData.estado} onChange={handleChange} placeholder="UF" required />
              </>
            )}
            
            <div className="flex gap-4">
              {step === 2 && (
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                  Voltar
                </Button>
              )}
              <Button type="submit" className={step === 1 ? "w-full" : "flex-1"} isLoading={isLoading}>
                {step === 1 ? 'Próximo' : 'Cadastrar'}
              </Button>
            </div>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-600">
            Já tem uma conta? <Link to={`/login?redirect=${encodeURIComponent(redirect)}`} className="text-primary hover:underline">Entrar</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
