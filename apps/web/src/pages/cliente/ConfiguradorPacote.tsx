import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api, useAuth } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { ArrowLeft, ArrowRight, Check, Info, TentTree, Wind, Snowflake, Sparkles, Trash2, UserPlus } from 'lucide-react';
import {
  type ParticipanteCheckout,
  lerIntencaoCheckout,
  lerLeadId,
  lerLeadIntentToken,
  limparIntencaoCheckout,
  lerReferenciaVendedor,
  salvarIntencaoCheckout,
  salvarReferenciaVendedor,
} from '../../utils/checkoutIntent';

interface PacotePublicado {
  id: string;
  nome: string;
  descricao: string;
  valor_total: string;
  modalidade_hospedagem: 'camping' | 'quarto_ventilador' | 'quarto_ar_condicionado';
  forma_contratacao: 'onibus' | 'hospedagem' | 'onibus_hospedagem' | 'livre';
  disponibilidade: 'disponivel' | 'ultimas_vagas' | 'esgotado';
}

const modalidadeMeta: Record<PacotePublicado['modalidade_hospedagem'], { label: string; icon: typeof TentTree; destaque: string }> = {
  camping: { label: 'Camping', icon: TentTree, destaque: 'A energia coletiva da comitiva' },
  quarto_ventilador: { label: 'Quarto com ventilador', icon: Wind, destaque: 'Conforto essencial para descansar' },
  quarto_ar_condicionado: { label: 'Quarto com ar-condicionado', icon: Snowflake, destaque: 'A experiência com máximo conforto' },
};

function formatarMoeda(valor: string | number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

export default function ConfiguradorPacote() {
  const { loteId } = useParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const pacoteSolicitado = searchParams.get('pacote');
  const [pacotes, setPacotes] = useState<PacotePublicado[]>([]);
  const [pacoteId, setPacoteId] = useState<string>('');
  const [grupoHospedagem, setGrupoHospedagem] = useState<'' | 'masculino' | 'feminino'>('');
  const [participantes, setParticipantes] = useState<ParticipanteCheckout[]>([]);
  const [calculo, setCalculo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const referencia = searchParams.get('ref');
    if (referencia) salvarReferenciaVendedor(referencia);
  }, [searchParams]);

  useEffect(() => {
    const carregarConfigurador = async () => {
      if (!loteId) {
        setError('Lote não informado.');
        setIsLoading(false);
        return;
      }
      try {
        const pacotesResponse = await api.get(`/pacotes/lotes/${loteId}/pacotes`);
        const listaPacotes = pacotesResponse.data.pacotes || [];
        setPacotes(listaPacotes);
        const intencaoSalva = lerIntencaoCheckout();
        const pacoteDaUrl = pacoteSolicitado
          ? listaPacotes.find((pacote: PacotePublicado) => pacote.id === pacoteSolicitado && pacote.disponibilidade !== 'esgotado')
          : undefined;
        const pacoteSalvoId = intencaoSalva && intencaoSalva.loteId === loteId ? intencaoSalva.pacoteId : undefined;
        const pacoteSalvoValido = pacoteSalvoId
          ? listaPacotes.some((pacote: PacotePublicado) => pacote.id === pacoteSalvoId && pacote.disponibilidade !== 'esgotado')
          : false;

        if (pacoteDaUrl) {
          setPacoteId(pacoteDaUrl.id);
          if (intencaoSalva && intencaoSalva.loteId === loteId && intencaoSalva.pacoteId === pacoteDaUrl.id) {
            setGrupoHospedagem(intencaoSalva.grupoHospedagem || '');
            setParticipantes(intencaoSalva.participantes || []);
          }
        } else if (pacoteSalvoValido && pacoteSalvoId) {
          setPacoteId(pacoteSalvoId);
          setGrupoHospedagem(intencaoSalva?.grupoHospedagem || '');
          setParticipantes(intencaoSalva?.participantes || []);
        } else if (listaPacotes.length === 1 && listaPacotes[0].disponibilidade !== 'esgotado') {
          setPacoteId(listaPacotes[0].id);
        }
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Não foi possível carregar as opções do pacote. Tente novamente.');
        setPacotes([]);
      } finally {
        setIsLoading(false);
      }
    };
    carregarConfigurador();
  }, [loteId, pacoteSolicitado]);

  const pacoteSelecionado = useMemo(() => pacotes.find((pacote) => pacote.id === pacoteId), [pacotes, pacoteId]);
  const exigeHospedagem = Boolean(
    pacoteSelecionado
    && pacoteSelecionado.modalidade_hospedagem !== 'camping'
    && ['hospedagem', 'onibus_hospedagem', 'livre'].includes(pacoteSelecionado.forma_contratacao),
  );
  useEffect(() => {
    if (isLoading || !loteId || (pacotes.length > 0 && !pacoteId)) {
      setCalculo(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsCalculating(true);
      try {
        const response = await api.post('/pacotes/calcular', { lote_id: loteId, pacote_id: pacoteId || undefined, itens: [] });
        setCalculo(response.data);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao calcular o valor do pacote.');
        setCalculo(null);
      } finally {
        setIsCalculating(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [loteId, pacoteId, pacotes.length, isLoading]);

  const selecionarPacote = (id: string) => {
    setPacoteId(id);
    const leadId = lerLeadId();
    const leadIntentToken = lerLeadIntentToken();
    if (leadId && leadIntentToken && loteId) {
      api.patch(`/publico/leads/${leadId}/intencao`, {
        lote_id: loteId,
        pacote_id: id,
        status: 'interessado',
        lead_intent_token: leadIntentToken,
      }).catch(() => undefined);
    }
  };

  const adicionarParticipante = () => {
    setParticipantes((atuais) => [...atuais, { nome_completo: '', sexo_operacional: grupoHospedagem || undefined }]);
  };

  const atualizarParticipante = (indice: number, campo: keyof ParticipanteCheckout, valor: string) => {
    setParticipantes((atuais) => atuais.map((participante, index) => index === indice ? { ...participante, [campo]: valor } : participante));
  };

  const removerParticipante = (indice: number) => {
    setParticipantes((atuais) => atuais.filter((_, index) => index !== indice));
  };

  const handleReservar = async () => {
    if (authLoading) return;
    if (pacotes.length > 0 && !pacoteId) {
      setError('Escolha sua modalidade de hospedagem para continuar.');
      return;
    }
    if (pacoteSelecionado?.disponibilidade === 'esgotado') {
      setError('Esta modalidade está esgotada. Escolha outra opção para continuar.');
      return;
    }
    if (exigeHospedagem && !grupoHospedagem) {
      setError('Selecione o grupo de hospedagem masculino ou feminino para reservar a vaga correta.');
      return;
    }
    if (participantes.some((participante) => !participante.nome_completo.trim())) {
      setError('Informe o nome completo de cada pessoa adicionada à comitiva.');
      return;
    }
    setError('');
    let leadId = lerLeadId();
    const leadIntentToken = lerLeadIntentToken();
    const intent = {
      loteId: loteId!,
      pacoteId,
      grupoHospedagem: grupoHospedagem || undefined,
      participantes,
      criadoEm: new Date().toISOString(),
    };
    salvarIntencaoCheckout(intent);

    if (!user) {
      if (leadId && leadIntentToken) {
        api.patch(`/publico/leads/${leadId}/intencao`, {
          lote_id: loteId,
          pacote_id: pacoteId,
          status: 'checkout_iniciado',
          lead_intent_token: leadIntentToken,
        }).catch(() => undefined);
      }
      const referencia = searchParams.get('ref') || lerReferenciaVendedor();
      const retorno = `/pacote/${loteId}?retomar=1${pacoteId ? `&pacote=${encodeURIComponent(pacoteId)}` : ''}${referencia ? `&ref=${encodeURIComponent(referencia)}` : ''}`;
      navigate(`/login?redirect=${encodeURIComponent(retorno)}`);
      return;
    }

    setIsReserving(true);
    try {
      const referencia = searchParams.get('ref') || lerReferenciaVendedor();
      if (!leadId && referencia) {
        const origem = await api.post('/jornada/registrar-origem', { codigo_origem: referencia });
        leadId = origem.data.lead_id || undefined;
      }
      const response = await api.post('/pacotes/reservar', {
        lote_id: loteId,
        pacote_id: pacoteId || undefined,
        itens: [],
        grupo_hospedagem: grupoHospedagem || undefined,
        participantes,
        lead_id: leadId || undefined,
        lead_intent_token: leadIntentToken || undefined,
      });
      limparIntencaoCheckout();
      navigate(`/checkout/${response.data.reserva_id}`);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao criar reserva. Tente novamente.');
    } finally {
      setIsReserving(false);
    }
  };

  if (isLoading) return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-[#182D3B]/60 sm:px-6 lg:px-8">Preparando sua experiência...</div>;

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-7 pb-28 sm:px-6 sm:py-12 lg:grid-cols-3 lg:gap-8 lg:px-8 lg:pb-14">
      <Helmet>
        <title>Monte seu pacote | Excursão das Comitivas</title>
        <meta name="description" content="Escolha a modalidade de hospedagem e confira as condições da sua reserva para Barretos." />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="space-y-6 lg:col-span-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#182D3B]/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => navigate('/eventos')} className="inline-flex items-center gap-2 text-sm font-extrabold text-[#851F32] hover:underline"><ArrowLeft size={16}/>Voltar e comparar pacotes</button>
          <div className="flex items-center gap-2 overflow-x-auto text-[11px] font-black uppercase tracking-[.1em] text-slate-400">
            <span className="rounded-full bg-[#851F32] px-3 py-1.5 text-white">1 · Pacote</span><ArrowRight size={13}/><span>2 · Pessoas</span><ArrowRight size={13}/><span>3 · Checkout</span>
          </div>
        </div>
        <section className="rounded-[1.6rem] bg-[#182D3B] p-5 text-white shadow-[0_18px_50px_rgba(24,45,59,0.18)] sm:rounded-[2rem] sm:p-7">
          <div className="flex items-center gap-3 text-[#E3AAB4]"><Sparkles size={18} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Sua experiência, suas escolhas</span></div>
          <h1 className="font-editorial mt-3 text-2xl font-bold tracking-[-0.025em] sm:text-4xl">Monte seu pacote de viagem</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">Escolha seu pacote e, se quiser, identifique as pessoas que viajarão com você.</p>
        </section>

        {error && <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}

        {pacotes.length > 0 && (
          <section>
            <div className="mb-3"><h2 className="text-xl font-bold text-slate-900">Escolha sua hospedagem</h2><p className="text-sm text-gray-500">A modalidade selecionada será registrada na sua reserva e no contrato.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pacotes.map((pacote) => {
                const meta = modalidadeMeta[pacote.modalidade_hospedagem];
                const Icon = meta?.icon || TentTree;
                const selecionado = pacote.id === pacoteId;
                const esgotado = pacote.disponibilidade === 'esgotado';
                return <button key={pacote.id} type="button" aria-pressed={selecionado} disabled={esgotado} onClick={() => selecionarPacote(pacote.id)} className={`relative rounded-2xl border p-4 text-left transition-all sm:p-5 disabled:cursor-not-allowed disabled:opacity-60 ${selecionado ? 'border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20' : 'border-gray-200 bg-white hover:border-primary/40 hover:shadow-md'}`}>
                  {selecionado && <span className="absolute left-3 top-3 rounded-full bg-primary p-1 text-white"><Check size={14} /></span>}
                  {pacote.disponibilidade !== 'disponivel' && <span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-black uppercase ${esgotado ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-800'}`}>{esgotado ? 'Esgotado' : 'Últimas vagas'}</span>}
                  <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-3 text-primary"><Icon size={24} /></div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">{meta?.label}</p>
                  <h3 className="mt-1 font-bold text-slate-900">{pacote.nome}</h3>
                  <p className="mt-2 min-h-10 text-sm text-gray-500">{pacote.descricao || meta?.destaque}</p>
                  <p className="mt-4 text-xl font-bold text-slate-900">{formatarMoeda(pacote.valor_total)}</p>
                </button>;
              })}
            </div>
            {pacoteSelecionado && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><strong>{pacoteSelecionado.nome}</strong> selecionado.</div>}
            {exigeHospedagem && <fieldset className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">Escolha o grupo do quarto</legend>
              <div className="grid grid-cols-2 gap-3">
                {(['feminino', 'masculino'] as const).map((grupo) => {
                  return <button key={grupo} type="button" aria-pressed={grupoHospedagem === grupo} onClick={() => { setGrupoHospedagem(grupo); setParticipantes((atuais) => atuais.map((participante) => ({ ...participante, sexo_operacional: participante.sexo_operacional || grupo }))); }} className={`rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition ${grupoHospedagem === grupo ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/15' : 'border-slate-200 text-slate-700 hover:border-primary/40'}`}>{grupo}</button>;
                })}
              </div>
            </fieldset>}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-bold text-slate-900">Vai viajar com mais alguém?</h2><p className="text-sm text-gray-500">Adicione as pessoas da sua comitiva. Os dados serão identificados no contrato.</p></div>
            <Button type="button" variant="outline" onClick={adicionarParticipante}><UserPlus size={16} className="mr-2" />Adicionar pessoa</Button>
          </div>
          {participantes.length > 0 && <div className="mt-4 space-y-3">
            {participantes.map((participante, indice) => <div key={indice} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-slate-800">Pessoa {indice + 2}</p><button type="button" onClick={() => removerParticipante(indice)} className="rounded-md p-2 text-red-700 hover:bg-red-50" aria-label={`Remover pessoa ${indice + 2}`}><Trash2 size={16} /></button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Nome completo<input value={participante.nome_completo} onChange={(event) => atualizarParticipante(indice, 'nome_completo', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" required /></label>
                <label className="text-xs font-semibold text-slate-600">CPF (opcional)<input value={participante.cpf || ''} onChange={(event) => atualizarParticipante(indice, 'cpf', event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">Data de nascimento<input type="date" value={participante.data_nascimento || ''} onChange={(event) => atualizarParticipante(indice, 'data_nascimento', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">Telefone (opcional)<input value={participante.telefone || ''} onChange={(event) => atualizarParticipante(indice, 'telefone', event.target.value)} inputMode="tel" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">E-mail (opcional)<input type="email" value={participante.email || ''} onChange={(event) => atualizarParticipante(indice, 'email', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
                {exigeHospedagem && <label className="text-xs font-semibold text-slate-600">Grupo<select value={participante.sexo_operacional || grupoHospedagem || ''} onChange={(event) => atualizarParticipante(indice, 'sexo_operacional', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">A definir</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>}
              </div>
            </div>)}
        </div>}
        </section>
      </div>

      <aside className="lg:col-span-1">
        <Card className="sticky top-[104px] overflow-hidden border-[#182D3B]/10 shadow-[0_18px_45px_rgba(24,45,59,0.10)]"><CardHeader className="border-b bg-[#182D3B] text-white"><CardTitle>Resumo da reserva</CardTitle></CardHeader><CardContent className="space-y-4 p-6">
          <div className="flex justify-between text-sm"><span className="text-gray-600">Pacote</span><span className="max-w-40 text-right font-medium">{pacoteSelecionado?.nome || (pacotes.length ? 'Escolha uma opção' : 'Pacote base')}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Valor-base</span><span className="font-medium">{formatarMoeda(calculo?.valor_base || 0)}</span></div>
          <div className="border-t pt-4"><div className="flex items-center justify-between"><span className="text-lg font-bold">Total</span><span className="text-2xl font-bold text-primary">{isCalculating ? '...' : formatarMoeda(calculo?.valor_total || 0)}</span></div></div>
          <Button className="mt-3 w-full" size="lg" onClick={handleReservar} isLoading={isReserving} disabled={isCalculating || (pacotes.length > 0 && !pacoteId) || pacoteSelecionado?.disponibilidade === 'esgotado' || (exigeHospedagem && !grupoHospedagem)}>{user ? 'Continuar para checkout' : 'Continuar'}</Button>
          <div className="flex gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-700"><Info size={16} className="shrink-0" /><p>Na próxima etapa você entra ou cria sua conta. Sua escolha ficará salva para continuar sem recomeçar.</p></div>
        </CardContent></Card>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#182D3B]/10 bg-white/95 p-3 shadow-[0_-12px_34px_rgba(24,45,59,.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-500">{pacoteSelecionado?.nome || 'Escolha um pacote'}</p>
            <p className="text-lg font-black text-[#182D3B]">{isCalculating ? 'Calculando…' : formatarMoeda(calculo?.valor_total || pacoteSelecionado?.valor_total || 0)}</p>
          </div>
          <Button onClick={handleReservar} isLoading={isReserving} disabled={isCalculating || (pacotes.length > 0 && !pacoteId) || pacoteSelecionado?.disponibilidade === 'esgotado' || (exigeHospedagem && !grupoHospedagem)}>{user ? 'Continuar' : 'Continuar'} <ArrowRight size={16}/></Button>
        </div>
      </div>
    </div>
  );
}
