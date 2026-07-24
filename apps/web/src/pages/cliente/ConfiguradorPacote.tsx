import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { Check, Info, TentTree, Wind, Snowflake, Sparkles } from 'lucide-react';

interface PacotePublicado {
  id: string;
  nome: string;
  descricao: string;
  valor_total: string;
  modalidade_hospedagem: 'camping' | 'quarto_ventilador' | 'quarto_ar_condicionado';
}

const modalidadeMeta: Record<PacotePublicado['modalidade_hospedagem'], { label: string; icon: typeof TentTree; destaque: string }> = {
  camping: { label: 'Camping', icon: TentTree, destaque: 'A energia coletiva da comitiva' },
  quarto_ventilador: { label: 'Quarto com ventilador', icon: Wind, destaque: 'Conforto essencial para descansar' },
  quarto_ar_condicionado: { label: 'Quarto com ar-condicionado', icon: Snowflake, destaque: 'A experiência com máximo conforto' },
};

export default function ConfiguradorPacote() {
  const { loteId } = useParams();
  const navigate = useNavigate();
  const [itensDisponiveis, setItensDisponiveis] = useState<any[]>([]);
  const [pacotes, setPacotes] = useState<PacotePublicado[]>([]);
  const [pacoteId, setPacoteId] = useState<string>('');
  const [itensSelecionados, setItensSelecionados] = useState<Record<string, number>>({});
  const [calculo, setCalculo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const carregarConfigurador = async () => {
      if (!loteId) {
        setError('Lote não informado.');
        setIsLoading(false);
        return;
      }
      try {
        const [itensResponse, pacotesResponse] = await Promise.all([
          api.get(`/pacotes/lotes/${loteId}/itens`),
          api.get(`/pacotes/lotes/${loteId}/pacotes`),
        ]);
        const listaPacotes = pacotesResponse.data.pacotes || [];
        setItensDisponiveis(itensResponse.data.itens || []);
        setPacotes(listaPacotes);
        if (listaPacotes.length === 1) setPacoteId(listaPacotes[0].id);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Não foi possível carregar as opções do pacote. Tente novamente.');
        setItensDisponiveis([]);
        setPacotes([]);
      } finally {
        setIsLoading(false);
      }
    };
    carregarConfigurador();
  }, [loteId]);

  const pacoteSelecionado = useMemo(() => pacotes.find((pacote) => pacote.id === pacoteId), [pacotes, pacoteId]);

  useEffect(() => {
    if (isLoading || !loteId || (pacotes.length > 0 && !pacoteId)) {
      setCalculo(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsCalculating(true);
      try {
        const itensPayload = Object.entries(itensSelecionados)
          .filter(([, quantidade]) => quantidade > 0)
          .map(([id, quantidade]) => ({ id, quantidade }));
        const response = await api.post('/pacotes/calcular', { lote_id: loteId, pacote_id: pacoteId || undefined, itens: itensPayload });
        setCalculo(response.data);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao calcular o valor do pacote.');
        setCalculo(null);
      } finally {
        setIsCalculating(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [itensSelecionados, loteId, pacoteId, pacotes.length, isLoading]);

  const toggleItem = (id: string) => {
    setItensSelecionados((prev) => ({ ...prev, [id]: prev[id] ? 0 : 1 }));
  };

  const handleReservar = async () => {
    if (pacotes.length > 0 && !pacoteId) {
      setError('Escolha sua modalidade de hospedagem para continuar.');
      return;
    }
    setIsReserving(true);
    setError('');
    try {
      const itensPayload = Object.entries(itensSelecionados)
        .filter(([, quantidade]) => quantidade > 0)
        .map(([id, quantidade]) => ({ id, quantidade }));
      const response = await api.post('/pacotes/reservar', { lote_id: loteId, pacote_id: pacoteId || undefined, itens: itensPayload });
      navigate(`/checkout/${response.data.reserva_id}`);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao criar reserva. Tente novamente.');
    } finally {
      setIsReserving(false);
    }
  };

  if (isLoading) return <div className="py-16 text-center text-gray-500">Preparando sua experiência...</div>;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-2xl bg-gradient-to-r from-slate-950 to-primary p-7 text-white shadow-xl">
          <div className="flex items-center gap-3 text-amber-300"><Sparkles size={18} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Sua experiência, suas escolhas</span></div>
          <h1 className="mt-3 text-3xl font-bold">Monte seu pacote de viagem</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-200">Defina a hospedagem e complemente a sua reserva. O valor e o contrato serão gerados com base exatamente nas escolhas confirmadas.</p>
        </section>

        {error && <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}

        {pacotes.length > 0 && (
          <section>
            <div className="mb-3"><h2 className="text-xl font-bold text-slate-900">Escolha sua hospedagem</h2><p className="text-sm text-gray-500">A modalidade selecionada será registrada na sua reserva e no contrato.</p></div>
            <div className="grid gap-4 md:grid-cols-3">
              {pacotes.map((pacote) => {
                const meta = modalidadeMeta[pacote.modalidade_hospedagem];
                const Icon = meta?.icon || TentTree;
                const selecionado = pacote.id === pacoteId;
                return <button key={pacote.id} onClick={() => setPacoteId(pacote.id)} className={`relative rounded-2xl border p-5 text-left transition-all ${selecionado ? 'border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20' : 'border-gray-200 bg-white hover:border-primary/40 hover:shadow-md'}`}>
                  {selecionado && <span className="absolute right-3 top-3 rounded-full bg-primary p-1 text-white"><Check size={14} /></span>}
                  <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-3 text-primary"><Icon size={24} /></div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">{meta?.label}</p>
                  <h3 className="mt-1 font-bold text-slate-900">{pacote.nome}</h3>
                  <p className="mt-2 min-h-10 text-sm text-gray-500">{pacote.descricao || meta?.destaque}</p>
                  <p className="mt-4 text-xl font-bold text-slate-900">R$ {Number(pacote.valor_total).toFixed(2)}</p>
                </button>;
              })}
            </div>
          </section>
        )}

        <section>
          <div className="mb-3"><h2 className="text-xl font-bold text-slate-900">Personalize com adicionais</h2><p className="text-sm text-gray-500">Selecione apenas o que deseja incluir na experiência.</p></div>
          <div className="space-y-3">
            {itensDisponiveis.map((item) => {
              const selecionado = Boolean(itensSelecionados[item.id]);
              return <Card key={item.id} className={`cursor-pointer transition-all ${selecionado ? 'border-primary ring-1 ring-primary' : 'hover:border-gray-300'}`} onClick={() => toggleItem(item.id)}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4"><div className={`flex h-6 w-6 items-center justify-center rounded-full border ${selecionado ? 'border-primary bg-primary text-white' : 'border-gray-300'}`}>{selecionado && <Check size={14} />}</div><div><h3 className="font-semibold text-gray-900">{item.nome}</h3><p className="text-sm text-gray-500">{item.descricao}</p></div></div>
                  <div className="font-semibold text-slate-900">+ R$ {Number(item.valor).toFixed(2)}</div>
                </CardContent>
              </Card>
            })}
            {itensDisponiveis.length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">Não há adicionais disponíveis para este lote.</p>}
          </div>
        </section>
      </div>

      <aside className="lg:col-span-1">
        <Card className="sticky top-24 overflow-hidden shadow-xl"><CardHeader className="border-b bg-slate-950 text-white"><CardTitle>Resumo da reserva</CardTitle></CardHeader><CardContent className="space-y-4 p-6">
          <div className="flex justify-between text-sm"><span className="text-gray-600">Hospedagem</span><span className="max-w-40 text-right font-medium">{pacoteSelecionado?.nome || (pacotes.length ? 'Escolha uma opção' : 'Pacote base')}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Valor-base</span><span className="font-medium">R$ {Number(calculo?.valor_base || 0).toFixed(2)}</span></div>
          {Object.entries(itensSelecionados).some(([, qtd]) => qtd > 0) && <div className="space-y-2 border-t pt-4"><p className="text-xs font-bold uppercase text-gray-500">Adicionais</p>{Object.entries(itensSelecionados).filter(([, qtd]) => qtd > 0).map(([id, qtd]) => { const item = itensDisponiveis.find((i) => i.id === id); return item ? <div key={id} className="flex justify-between text-sm"><span className="text-gray-600">{item.nome}</span><span>R$ {(Number(item.valor) * qtd).toFixed(2)}</span></div> : null; })}</div>}
          <div className="border-t pt-4"><div className="flex items-center justify-between"><span className="text-lg font-bold">Total</span><span className="text-2xl font-bold text-primary">{isCalculating ? '...' : `R$ ${Number(calculo?.valor_total || 0).toFixed(2)}`}</span></div></div>
          <Button className="mt-3 w-full" size="lg" onClick={handleReservar} isLoading={isReserving} disabled={isCalculating || (pacotes.length > 0 && !pacoteId)}>Continuar para checkout</Button>
          <div className="flex gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-700"><Info size={16} className="shrink-0" /><p>Os valores são calculados no servidor. Seu contrato refletirá a modalidade e os itens realmente selecionados.</p></div>
        </CardContent></Card>
      </aside>
    </div>
  );
}
