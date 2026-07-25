import { useState } from 'react';
import { CheckCircle2, MessageCircle, Send } from 'lucide-react';
import { Button, Input, WhatsAppCTA } from '@ui/index';
import { api } from '../contexts/AuthContext';
import { salvarLeadId } from '../utils/checkoutIntent';

const OPCOES = [
  { value: '', label: 'Quero conhecer todas as opções' },
  { value: 'camping', label: 'Camping' },
  { value: 'quarto_ventilador', label: 'Quarto com ventilador' },
  { value: 'quarto_ar_condicionado', label: 'Quarto com ar-condicionado' },
];

export default function LeadCapture() {
  const [form, setForm] = useState({
    nome: '',
    whatsapp: '',
    pacote_interesse: '',
    consentimento_whatsapp: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sucesso, setSucesso] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await api.post('/publico/leads', {
        ...form,
        origem: 'landing_page',
        pagina: '/',
        codigo_origem: new URLSearchParams(window.location.search).get('ref') || undefined,
      });
      salvarLeadId(response.data.lead_id);
      setSucesso(true);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Não foi possível registrar seu contato. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (sucesso) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto text-emerald-600" size={42} />
        <h3 className="mt-4 text-2xl font-black text-slate-900">Seu interesse foi registrado.</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
          Agora abra a conversa para receber as informações da excursão e confirmar a disponibilidade da modalidade escolhida.
        </p>
        <WhatsAppCTA
          mensagem={`Olá! Sou ${form.nome} e quero receber as informações completas da Excursão das Comitivas${form.pacote_interesse ? ` sobre ${OPCOES.find((opcao) => opcao.value === form.pacote_interesse)?.label}` : ''}.`}
          label="Abrir conversa no WhatsApp"
          size="lg"
          className="mt-6"
        />
      </div>
    );
  }

  return (
    <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="bg-gradient-to-br from-slate-950 via-[#4a1017] to-primary p-8 text-white sm:p-10">
        <MessageCircle size={34} className="text-[#ff9fa6]" />
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[#ffb0b5]">Atendimento personalizado</p>
        <h3 className="mt-3 text-3xl font-black leading-tight">Receba o roteiro completo pelo WhatsApp.</h3>
        <p className="mt-5 text-sm leading-6 text-slate-200">
          Deixe seu contato para a equipe apresentar datas, disponibilidade, condições de pagamento e a modalidade que melhor combina com você.
        </p>
        <ul className="mt-7 space-y-3 text-sm text-slate-100">
          <li className="flex gap-2"><CheckCircle2 size={18} className="shrink-0 text-[#ff9fa6]" />Informação sem compromisso</li>
          <li className="flex gap-2"><CheckCircle2 size={18} className="shrink-0 text-[#ff9fa6]" />Atendimento humano da nossa equipe</li>
          <li className="flex gap-2"><CheckCircle2 size={18} className="shrink-0 text-[#ff9fa6]" />Escolhas registradas para você continuar depois</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 p-8 sm:p-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Quero saber mais</p>
          <h3 className="mt-2 text-2xl font-black text-secondary">Fale com a Excursão das Comitivas</h3>
        </div>
        {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <Input label="Seu nome *" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} required autoComplete="name" />
        <Input label="WhatsApp com DDD *" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} required inputMode="tel" autoComplete="tel" placeholder="(61) 99999-9999" />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Modalidade de maior interesse</label>
          <select
            value={form.pacote_interesse}
            onChange={(event) => setForm({ ...form, pacote_interesse: event.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {OPCOES.map((opcao) => <option key={opcao.value} value={opcao.value}>{opcao.label}</option>)}
          </select>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
          <input
            type="checkbox"
            checked={form.consentimento_whatsapp}
            onChange={(event) => setForm({ ...form, consentimento_whatsapp: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            required
          />
          Autorizo a Excursão das Comitivas a entrar em contato pelo WhatsApp para atender este pedido. Posso solicitar a interrupção do contato a qualquer momento.
        </label>
        <Button type="submit" size="lg" className="w-full" isLoading={isLoading}>
          Salvar contato e continuar <Send size={17} className="ml-2" />
        </Button>
      </form>
    </div>
  );
}
