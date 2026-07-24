import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, api } from '../contexts/AuthContext';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@ui/index';

export default function Cadastro() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    rg: '',
    telefone: '',
    data_nascimento: '',
    estado_civil: '',
    profissao: '',
    endereco: '',
    nacionalidade: 'Brasileira',
    senha: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const validateStep1 = () => {
    if (!formData.nome || !formData.email || !formData.cpf || !formData.senha) {
      setError('Preencha todos os campos obrigatórios');
      return false;
    }
    if (formData.senha.length < 8) {
      setError('Senha deve ter pelo menos 8 caracteres');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.rg || !formData.data_nascimento || !formData.estado_civil || !formData.profissao || !formData.endereco) {
      setError('Preencha todos os campos obrigatórios');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateStep2()) return;
    
    setIsLoading(true);

    try {
      const response = await api.post('/auth/cadastro', formData);
      login(response.data.token, response.data.usuario);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao cadastrar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center py-12 px-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            {step === 1 ? 'Criar Conta - Dados Básicos' : 'Criar Conta - Dados Contratuais'}
          </CardTitle>
          <p className="text-center text-sm text-gray-600 mt-2">Passo {step} de 2</p>
        </CardHeader>
        <CardContent>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">{error}</div>}
          
          <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }} className="space-y-4">
            {step === 1 ? (
              <>
                <Input label="Nome completo *" name="nome" value={formData.nome} onChange={handleChange} required />
                <Input label="E-mail *" type="email" name="email" value={formData.email} onChange={handleChange} required />
                <Input label="CPF *" name="cpf" value={formData.cpf} onChange={handleChange} placeholder="000.000.000-00" required />
                <Input label="Telefone" name="telefone" value={formData.telefone} onChange={handleChange} placeholder="(00) 00000-0000" />
                <Input label="Senha *" type="password" name="senha" value={formData.senha} onChange={handleChange} required minLength={8} />
              </>
            ) : (
              <>
                <Input label="RG *" name="rg" value={formData.rg} onChange={handleChange} placeholder="00.000.000-0" required />
                <Input label="Data de Nascimento *" type="date" name="data_nascimento" value={formData.data_nascimento} onChange={handleChange} required />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado Civil *</label>
                  <select name="estado_civil" value={formData.estado_civil} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Selecione</option>
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="União Estável">União Estável</option>
                  </select>
                </div>
                <Input label="Profissão *" name="profissao" value={formData.profissao} onChange={handleChange} required />
                <Input label="Endereço Completo *" name="endereco" value={formData.endereco} onChange={handleChange} placeholder="Rua, número, bairro, cidade, estado, CEP" required />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nacionalidade</label>
                  <select name="nacionalidade" value={formData.nacionalidade} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="Brasileira">Brasileira</option>
                    <option value="Estrangeira">Estrangeira</option>
                  </select>
                </div>
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
            Já tem uma conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
