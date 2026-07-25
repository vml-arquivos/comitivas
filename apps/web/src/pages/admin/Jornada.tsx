import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@ui/index';
import { AlertCircle, Copy, Link as LinkIcon, MessageCircle, RefreshCw, UserCheck } from 'lucide-react';
import { api } from '../../contexts/AuthContext';

type Lead = {
  id: string;
  nome: string;
  whatsapp?: string | null;
  email?: string | null;
  origem: string;
  status: string;
  pacote_nome?: string | null;
  modalidade_hospedagem?: string | null;
  reserva?: {
    id: string;
    status: string;
    valor_total: string;
    atualizado_em: string;
  } | null;
  criado_em: string;
  atualizado_em: string;
};

const colunas = [
  { id: 'interesse', titulo: 'Novos interesses', statuses: ['novo', 'interessado', 'visitante'], estilo: 'bg-slate-50 border-slate-200', badge: 'bg-slate-200 text-slate-700' },
  { id: 'cadastro', titulo: 'Cadastro iniciado', statuses: ['cadastrado', 'pacote_montado'], estilo: 'bg-blue-50 border-blue-200', badge: 'bg-blue-200 text-blue-800' },
  { id: 'checkout', titulo: 'Em checkout', statuses: ['checkout_iniciado', 'aguardando_pagamento'], estilo: 'bg-amber-50 border-amber-200', badge: 'bg-amber-200 text-amber-800' },
  { id: 'confirmado', titulo: 'Confirmados', statuses: ['cliente_confirmado', 'contrato_gerado'], estilo: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-200 text-emerald-800' },
  { id: 'abandonado', titulo: 'Recuperação', statuses: ['abandonado'], estilo: 'bg-red-50 border-red-200', badge: 'bg-red-200 text-red-800' },
];

function tempoRelativo(valor: string) {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(valor).getTime()) / 60000));
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias === 1 ? '' : 's'}`;
}

export default function Jornada() {
  const [link, setLink] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const carregarLeads = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/jornada/leads');
      setLeads(response.data.leads || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar a esteira comercial.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarLeads();
  }, []);

  const gerarLink = async () => {
    setIsGenerating(true);
    setError('');
    try {
      const response = await api.post('/jornada/gerar-link', {});
      setLink(response.data.url_rastreio);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao gerar link.');
    } finally {
      setIsGenerating(false);
    }
  };

  const totalEmAberto = useMemo(() => leads.filter((lead) => !['cliente_confirmado', 'abandonado'].includes(lead.status)).length, [leads]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-950 to-primary p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Dados reais do site e das reservas</p>
          <h1 className="mt-1 text-3xl font-black">Jornada do Cliente</h1>
          <p className="mt-2 text-sm text-slate-200">{leads.length} contatos na esteira · {totalEmAberto} oportunidades em aberto</p>
        </div>
        <Button onClick={carregarLeads} disabled={isLoading} className="bg-white text-slate-950 hover:bg-slate-100"><RefreshCw size={16} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />Atualizar</Button>
      </section>

      {error && <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><LinkIcon size={20} className="text-primary" />Link de vendedor</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mb-3 text-sm text-gray-600">Gere um link rastreável. Quando o visitante deixar o WhatsApp ou criar a conta, ele entra nesta esteira vinculado ao vendedor.</p>
            {link && <Input label="Link gerado" value={link} readOnly />}
          </div>
          {link ? (
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(link)}><Copy size={16} className="mr-2" />Copiar link</Button>
          ) : (
            <Button onClick={gerarLink} isLoading={isGenerating}>Gerar link rastreável</Button>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto pb-4">
        <div className="grid min-w-[1320px] grid-cols-5 gap-4">
          {colunas.map((coluna) => {
            const itens = leads.filter((lead) => coluna.statuses.includes(lead.status));
            return (
              <section key={coluna.id} className={`rounded-2xl border p-3 ${coluna.estilo}`}>
                <h2 className="mb-3 flex items-center justify-between text-sm font-bold text-slate-800">
                  <span>{coluna.titulo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${coluna.badge}`}>{itens.length}</span>
                </h2>
                <div className="space-y-3">
                  {itens.map((lead) => (
                    <article key={lead.id} className="rounded-xl border border-white bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{lead.nome}</p>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{lead.origem.replace(/_/g, ' ')}</p>
                        </div>
                        {coluna.id === 'confirmado' && <UserCheck size={18} className="text-emerald-600" />}
                      </div>
                      {lead.pacote_nome && <p className="mt-3 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{lead.pacote_nome}</p>}
                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                        {lead.whatsapp && <a href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-emerald-700 hover:underline"><MessageCircle size={13} />{lead.whatsapp}</a>}
                        {lead.email && <p className="truncate">{lead.email}</p>}
                        <p>{tempoRelativo(lead.atualizado_em)}</p>
                      </div>
                    </article>
                  ))}
                  {!isLoading && itens.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">Nenhum contato nesta etapa.</p>}
                  {isLoading && <div className="h-24 animate-pulse rounded-xl bg-white/70" />}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
