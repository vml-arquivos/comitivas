import { useEffect, useState } from 'react';
import { Eraser, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../contexts/AuthContext';
import { Button } from '@ui/index';

type Escopo = {
  reservas: boolean;
  contratos: boolean;
  leads_sem_contato: boolean;
  leads_sem_reserva: boolean;
};

type Props = {
  onConcluido?: () => void;
};

const escopoInicial: Escopo = {
  reservas: true,
  contratos: true,
  leads_sem_contato: true,
  leads_sem_reserva: true,
};

export default function LimpezaDadosIncompletos({ onConcluido }: Props) {
  const [aberto, setAberto] = useState(false);
  const [escopo, setEscopo] = useState<Escopo>(escopoInicial);
  const [resumo, setResumo] = useState({ reservas_incompletas: 0, contratos_pendentes: 0, leads_sem_contato: 0, leads_sem_reserva: 0 });
  const [confirmacao, setConfirmacao] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  const carregarResumo = async () => {
    setCarregando(true);
    setErro('');
    try {
      const response = await api.get('/admin/dados-incompletos/resumo');
      setResumo(response.data);
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível consultar os dados incompletos.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (aberto) void carregarResumo();
  }, [aberto]);

  const executar = async () => {
    if (confirmacao !== 'LIMPAR_DADOS_INCOMPLETOS') {
      setErro('Digite exatamente LIMPAR_DADOS_INCOMPLETOS para confirmar.');
      return;
    }
    if (!Object.values(escopo).some(Boolean)) {
      setErro('Selecione pelo menos um tipo de dado para limpar.');
      return;
    }
    setCarregando(true);
    setErro('');
    setMensagem('');
    try {
      const response = await api.post('/admin/dados-incompletos/limpar', { confirmacao, escopo });
      const resultado = response.data.resultado || {};
      setMensagem(`Limpeza concluída: ${resultado.reservas || 0} reserva(s), ${resultado.contratos || 0} contrato(s) e ${(resultado.leads_sem_contato || 0) + (resultado.leads_sem_reserva || 0)} lead(s) removido(s).`);
      setConfirmacao('');
      await carregarResumo();
      onConcluido?.();
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Não foi possível concluir a limpeza.');
    } finally {
      setCarregando(false);
    }
  };

  const marcar = (campo: keyof Escopo) => setEscopo((atual) => ({ ...atual, [campo]: !atual[campo] }));

  return (
    <section className="admin-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-red-700"><Eraser size={20} /></div>
          <div>
            <p className="admin-eyebrow">Governança comercial</p>
            <h2 className="text-lg font-black text-[#073F50]">Limpeza de dados incompletos</h2>
            <p className="mt-1 text-sm text-slate-500">Remova reservas que não fecharam, minutas pendentes e leads sem aproveitamento.</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => setAberto((atual) => !atual)} className="flex items-center gap-2 text-red-700 hover:border-red-300 hover:bg-red-50">
          <Trash2 size={16} /> {aberto ? 'Fechar limpeza' : 'Limpar dados'}
        </Button>
      </div>

      {aberto && (
        <div className="border-t border-red-100 bg-red-50/40 p-5 sm:p-6">
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <span>Contratos validados/aprovados, aceites eletrônicos, pagamentos efetivados e reservas confirmadas são protegidos automaticamente.</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {([
              ['reservas', 'Reservas incompletas', resumo.reservas_incompletas, 'Checkout iniciado, abandonado ou não concluído'],
              ['contratos', 'Contratos pendentes', resumo.contratos_pendentes, 'Minutas sem validação eletrônica'],
              ['leads_sem_contato', 'Leads sem contato', resumo.leads_sem_contato, 'Sem e-mail, WhatsApp e sem cliente vinculado'],
              ['leads_sem_reserva', 'Leads sem reserva', resumo.leads_sem_reserva, 'Contato que nunca avançou para uma reserva'],
            ] as const).map(([campo, titulo, total, descricao]) => (
              <label key={campo} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${escopo[campo] ? 'border-red-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                <input type="checkbox" checked={escopo[campo]} onChange={() => marcar(campo)} className="mt-1 h-4 w-4 accent-red-700" />
                <span className="min-w-0">
                  <span className="flex items-center justify-between gap-3 font-bold text-slate-800"><span>{titulo}</span><strong className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{total}</strong></span>
                  <span className="mt-1 block text-xs text-slate-500">{descricao}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
              Confirmação obrigatória
              <input value={confirmacao} onChange={(event) => setConfirmacao(event.target.value)} placeholder="Digite LIMPAR_DADOS_INCOMPLETOS" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void carregarResumo()} disabled={carregando} className="flex items-center gap-2"><RefreshCw size={15} /> Atualizar prévia</Button>
              <Button type="button" onClick={() => void executar()} disabled={carregando || confirmacao !== 'LIMPAR_DADOS_INCOMPLETOS'} className="flex items-center gap-2 bg-red-700 hover:bg-red-800"><Trash2 size={15} /> Executar limpeza</Button>
            </div>
          </div>
          {erro && <p className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-800">{erro}</p>}
          {mensagem && <p className="mt-3 rounded-lg bg-emerald-100 p-3 text-sm text-emerald-800">{mensagem}</p>}
        </div>
      )}
    </section>
  );
}
