import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, Button, Input } from '@ui/index';
import { Eye, Download, FileSignature, X, FileText, RefreshCw } from 'lucide-react';

interface ContratoLinha {
  reserva_id: string;
  status_reserva: string;
  valor_total: string;
  forma_pagamento: string | null;
  quantidade_parcelas: number | null;
  contrato_pdf_url: string | null;
  aceite_timestamp: string | null;
  aceite_ip: string | null;
  criado_em: string;
  cliente_nome: string;
  cliente_email: string;
  cliente_cpf: string | null;
  evento_nome: string;
  lote_nome: string;
  contrato_gerado: boolean;
}

type FormularioContrato = {
  contratante: {
    nome: string;
    cpf: string;
    rg: string;
    nacionalidade: string;
    estado_civil: string;
    profissao: string;
    nascimento: string;
    endereco: string;
    telefone: string;
    email: string;
  };
  hospedagem: { check_in: string; check_out: string; modalidade: string; local: string };
  transporte: {
    rodoviario_incluido: boolean;
    local_embarque: string;
    ponto_referencia: string;
    data_saida: string;
    horario_saida: string;
    data_retorno: string;
    horario_retorno: string;
    veiculo: string;
  };
  bagagem: { limite_kg: string };
  seguro: { seguradora: string; apolice: string; cobertura: string; telefone: string };
  uso_imagem: { autorizado: boolean; prazo_anos: string };
  observacoes_especificas: string;
};

const FORMA_LABEL: Record<string, string> = { pix: 'PIX à vista', boleto: 'Boleto parcelado' };
const inputClass = 'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const sectionClass = 'rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-4';

function formularioInicial(contrato: ContratoLinha): FormularioContrato {
  return {
    contratante: {
      nome: contrato.cliente_nome || '', cpf: contrato.cliente_cpf || '', rg: '', nacionalidade: 'Brasileira', estado_civil: '', profissao: '', nascimento: '', endereco: '', telefone: '', email: contrato.cliente_email || '',
    },
    hospedagem: { check_in: '', check_out: '', modalidade: '', local: '' },
    transporte: { rodoviario_incluido: false, local_embarque: '', ponto_referencia: '', data_saida: '', horario_saida: '', data_retorno: '', horario_retorno: '', veiculo: '' },
    bagagem: { limite_kg: '' },
    seguro: { seguradora: '', apolice: '', cobertura: '', telefone: '' },
    uso_imagem: { autorizado: false, prazo_anos: '3' },
    observacoes_especificas: '',
  };
}

export default function Contratos() {
  const [searchParams] = useSearchParams();
  const [contratos, setContratos] = useState<ContratoLinha[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'' | 'gerados' | 'pendentes'>('');
  const [busca, setBusca] = useState('');
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);

  const [contratoAtual, setContratoAtual] = useState<ContratoLinha | null>(null);
  const [formulario, setFormulario] = useState<FormularioContrato | null>(null);
  const [formaPagamentoContrato, setFormaPagamentoContrato] = useState<'pix' | 'boleto'>('pix');
  const [parcelasContrato, setParcelasContrato] = useState('1');
  const [salvandoContrato, setSalvandoContrato] = useState(false);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [erroContrato, setErroContrato] = useState<string | null>(null);

  const carregar = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filtro) params.status = filtro;
      const response = await api.get('/admin/contratos', { params });
      setContratos(response.data.contratos || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar contratos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void carregar(); }, [filtro]);

  const contratosFiltrados = useMemo(() => contratos.filter((c) => {
    if (!busca.trim()) return true;
    const termo = busca.trim().toLowerCase();
    return c.cliente_nome?.toLowerCase().includes(termo) || c.cliente_email?.toLowerCase().includes(termo) || (c.cliente_cpf || '').includes(termo) || c.evento_nome?.toLowerCase().includes(termo) || c.reserva_id.toLowerCase().includes(termo);
  }), [contratos, busca]);

  const handleDownload = async (reservaId: string, clienteNome?: string) => {
    try {
      const response = await api.get(`/contratos/download/${reservaId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `contrato-${(clienteNome || 'comitiva').replace(/\s+/g, '-').toLowerCase()}-${reservaId.substring(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.erro || 'Contrato ainda não disponível para esta reserva.');
    }
  };

  const abrirGerarContrato = (contrato: ContratoLinha) => {
    setContratoAtual(contrato);
    setFormulario(formularioInicial(contrato));
    setFormaPagamentoContrato((contrato.forma_pagamento === 'boleto' ? 'boleto' : 'pix'));
    setParcelasContrato(String(contrato.quantidade_parcelas || 1));
    setPreviewHtml('');
    setErroContrato(null);
  };

  useEffect(() => {
    const reservaId = searchParams.get('reserva');
    if (!isLoading && reservaId && !contratoAtual) {
      const contrato = contratos.find((item) => item.reserva_id === reservaId);
      if (contrato) abrirGerarContrato(contrato);
    }
  }, [contratos, contratoAtual, isLoading, searchParams]);

  const fecharGerarContrato = () => {
    setContratoAtual(null);
    setFormulario(null);
    setPreviewHtml('');
    setErroContrato(null);
  };

  const atualizarFormulario = <K extends keyof FormularioContrato>(secao: K, campo: string, valor: string | boolean) => {
    setFormulario((atual) => atual ? ({ ...atual, [secao]: { ...(atual[secao] as object), [campo]: valor } }) : atual);
  };

  const obterPayload = () => ({
    metodo_pagamento: formaPagamentoContrato,
    quantidade_parcelas: formaPagamentoContrato === 'pix' ? 1 : Math.max(1, parseInt(parcelasContrato, 10) || 1),
    formulario,
  });

  const handlePreview = async () => {
    if (!contratoAtual || !formulario) return;
    setErroContrato(null);
    setCarregandoPreview(true);
    try {
      const response = await api.post(`/admin/contratos/preview/${contratoAtual.reserva_id}`, { formulario });
      setPreviewHtml(response.data.html || '');
    } catch (err: any) {
      setErroContrato(err.response?.data?.erro || 'Não foi possível gerar o preview.');
    } finally {
      setCarregandoPreview(false);
    }
  };

  const handleGerarContrato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contratoAtual || !formulario) return;
    setErroContrato(null);
    setSalvandoContrato(true);
    try {
      await api.post(`/admin/contratos/gerar/${contratoAtual.reserva_id}`, obterPayload());
      setAcaoMsg('Contrato preparado no modelo oficial e aguardando validação eletrônica do cliente.');
      fecharGerarContrato();
      await carregar();
    } catch (err: any) {
      setErroContrato(err.response?.data?.erro || 'Erro ao gerar contrato.');
    } finally {
      setSalvandoContrato(false);
    }
  };

  const input = (label: string, secao: keyof FormularioContrato, campo: string, type = 'text', placeholder?: string) => {
    const valor = formulario?.[secao] && typeof formulario[secao] === 'object' ? String((formulario[secao] as Record<string, unknown>)[campo] ?? '') : '';
    return <Input label={label} type={type} placeholder={placeholder} value={valor} onChange={(e) => atualizarFormulario(secao, campo, e.target.value)} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Contratos</h1><p className="text-sm text-gray-500">Modelo oficial 2026.1 com formulário de campos editáveis e preview antes da geração.</p></div>
        <Button type="button" variant="outline" onClick={() => void carregar()} className="flex items-center gap-2"><RefreshCw size={16} /> Atualizar</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, e-mail, CPF, evento ou reserva" className="flex-1" /><select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={inputClass}><option value="">Todos os status</option><option value="gerados">Contrato gerado</option><option value="pendentes">Sem contrato</option></select></div>
      {error && <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}
      {acaoMsg && <div className="rounded-lg bg-blue-50 p-4 text-blue-700">{acaoMsg}</div>}

      {contratoAtual && formulario && (
        <Card><CardContent className="p-6"><form onSubmit={handleGerarContrato} className="space-y-5">
          <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-gray-900">Gerar contrato padrão — reserva {contratoAtual.reserva_id.substring(0, 8)}</h2><p className="mt-1 text-sm text-gray-600">O texto-base segue o documento oficial anexado. Edite somente os dados variáveis; ao gerar, eles serão congelados no snapshot e qualquer alteração futura criará nova versão.</p></div><button type="button" onClick={fecharGerarContrato} className="text-gray-500 hover:text-gray-700" aria-label="Fechar formulário"><X size={18} /></button></div>
          {erroContrato && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erroContrato}</div>}

          <section className={sectionClass}><h3 className="font-semibold text-gray-900">1. Qualificação das partes</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{input('Nome completo', 'contratante', 'nome')}{input('CPF', 'contratante', 'cpf', 'text', '000.000.000-00')}{input('RG / identidade', 'contratante', 'rg')}{input('Nacionalidade', 'contratante', 'nacionalidade')}{input('Estado civil', 'contratante', 'estado_civil')}{input('Profissão', 'contratante', 'profissao')}{input('Data de nascimento', 'contratante', 'nascimento', 'date')}{input('Telefone / WhatsApp', 'contratante', 'telefone')}{input('E-mail', 'contratante', 'email', 'email')}{input('Endereço completo', 'contratante', 'endereco')}</div></section>

          <section className={sectionClass}><h3 className="font-semibold text-gray-900">2. Hospedagem e serviços</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{input('Check-in', 'hospedagem', 'check_in', 'date')}{input('Check-out', 'hospedagem', 'check_out', 'date')}{input('Local de hospedagem', 'hospedagem', 'local', 'text', 'Chácara Recanto Novo Encantado ou Santa Thereza')}<div><label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="modalidade-hospedagem">Modalidade de hospedagem</label><select id="modalidade-hospedagem" className={inputClass} value={formulario.hospedagem.modalidade} onChange={(e) => atualizarFormulario('hospedagem', 'modalidade', e.target.value)}><option value="">Conforme contratação</option><option value="camping">CAMPING</option><option value="quarto_ventilador">QUARTO COM VENTILADOR COMPARTILHADO</option><option value="quarto_ar_condicionado">QUARTO COM CLIMATIZADOR COMPARTILHADO</option></select></div></div><p className="text-xs text-gray-500">Os serviços padrão permanecem no contrato: hospedagem, café da manhã, almoço, Open Bar das 9h às 19h e translado interno entre a chácara e o Parque do Peão.</p></section>

          <section className={sectionClass}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-gray-900">3. Transporte rodoviário</h3><label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={formulario.transporte.rodoviario_incluido} onChange={(e) => atualizarFormulario('transporte', 'rodoviario_incluido', e.target.checked)} /> Incluir no contrato</label></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{input('Local de embarque', 'transporte', 'local_embarque', 'text', 'Endereço do embarque')}{input('Ponto de referência', 'transporte', 'ponto_referencia')}{input('Data da saída', 'transporte', 'data_saida', 'date')}{input('Horário previsto da saída', 'transporte', 'horario_saida', 'time')}{input('Data prevista para retorno', 'transporte', 'data_retorno', 'date')}{input('Horário previsto do retorno', 'transporte', 'horario_retorno', 'time')}<div><label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="tipo-veiculo">Tipo do veículo</label><select id="tipo-veiculo" className={inputClass} value={formulario.transporte.veiculo} onChange={(e) => atualizarFormulario('transporte', 'veiculo', e.target.value)}><option value="">Não informado</option><option value="Ônibus">Ônibus</option><option value="Micro-ônibus">Micro-ônibus</option><option value="Van">Van</option></select></div>{input('Limite de bagagem principal (kg)', 'bagagem', 'limite_kg', 'number', 'Ex.: 23')}</div></section>

          <section className={sectionClass}><h3 className="font-semibold text-gray-900">4. Seguro de viagem</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{input('Seguradora', 'seguro', 'seguradora')}{input('Número da apólice', 'seguro', 'apolice')}{input('Cobertura', 'seguro', 'cobertura')}{input('Telefone de atendimento', 'seguro', 'telefone')}</div><p className="text-xs text-gray-500">Se não houver seguro adicional, o contrato registrará expressamente a inexistência e aplicará apenas as coberturas obrigatórias.</p></section>

          <section className={sectionClass}><h3 className="font-semibold text-gray-900">5. Pagamento e uso de imagem</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="forma-pagamento">Forma de pagamento</label><select id="forma-pagamento" className={inputClass} value={formaPagamentoContrato} onChange={(e) => { const forma = e.target.value as 'pix' | 'boleto'; setFormaPagamentoContrato(forma); if (forma === 'pix') setParcelasContrato('1'); }}><option value="pix">PIX à vista</option><option value="boleto">Boleto parcelado</option></select></div><Input label="Quantidade de parcelas" type="number" min={1} max={20} disabled={formaPagamentoContrato === 'pix'} value={formaPagamentoContrato === 'pix' ? '1' : parcelasContrato} onChange={(e) => setParcelasContrato(e.target.value)} /><label className="flex items-center gap-2 text-sm font-medium text-gray-700 md:col-span-2"><input type="checkbox" checked={formulario.uso_imagem.autorizado} onChange={(e) => atualizarFormulario('uso_imagem', 'autorizado', e.target.checked)} /> Autorizar uso de imagem por 3 anos para divulgação institucional</label></div></section>

          <section className={sectionClass}><h3 className="font-semibold text-gray-900">6. Observações específicas</h3><textarea value={formulario.observacoes_especificas} onChange={(e) => setFormulario((atual) => atual ? ({ ...atual, observacoes_especificas: e.target.value }) : atual)} rows={3} maxLength={500} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Opcional. Será incorporado ao snapshot do contrato." /></section>

          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={carregandoPreview} onClick={() => void handlePreview()}>{carregandoPreview ? 'Montando preview...' : 'Visualizar preview'}</Button><Button type="submit" disabled={salvandoContrato}>{salvandoContrato ? 'Gerando...' : 'Gerar e congelar contrato'}</Button><Button type="button" variant="outline" onClick={fecharGerarContrato}>Cancelar</Button></div>
          {previewHtml && <div className="rounded-xl border border-gray-300 bg-white p-2"><div className="mb-2 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><span>Preview do modelo oficial</span><span>Somente leitura</span></div><iframe title="Preview do contrato" srcDoc={previewHtml} sandbox="allow-same-origin" className="h-[720px] w-full rounded-lg border border-gray-200" /></div>}
        </form></CardContent></Card>
      )}

      <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 uppercase text-gray-700"><tr><th className="px-6 py-4 font-medium">Cliente</th><th className="px-6 py-4 font-medium">Evento / Lote</th><th className="px-6 py-4 font-medium">Valor</th><th className="px-6 py-4 font-medium">Pagamento</th><th className="px-6 py-4 font-medium">Status</th><th className="px-6 py-4 text-right font-medium">Ações</th></tr></thead><tbody className="divide-y divide-gray-200">{isLoading && <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Carregando...</td></tr>}{!isLoading && contratosFiltrados.map((c) => <tr key={c.reserva_id} className="hover:bg-gray-50"><td className="px-6 py-4"><div className="font-medium text-gray-900">{c.cliente_nome}</div><div className="text-xs text-gray-500">{c.cliente_email}</div></td><td className="px-6 py-4"><div>{c.evento_nome}</div><div className="text-xs text-gray-500">{c.lote_nome}</div></td><td className="px-6 py-4">R$ {c.valor_total}</td><td className="px-6 py-4">{c.forma_pagamento ? <>{FORMA_LABEL[c.forma_pagamento] || c.forma_pagamento}{(c.quantidade_parcelas || 1) > 1 ? ` — ${c.quantidade_parcelas}x` : ''}</> : <span className="text-gray-400">Não definida</span>}</td><td className="px-6 py-4"><span className={`rounded-full px-2 py-1 text-xs font-medium ${c.contrato_gerado ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{c.contrato_gerado ? 'Contrato gerado' : 'Sem contrato'}</span></td><td className="space-x-2 whitespace-nowrap px-6 py-4 text-right">{c.contrato_gerado ? <><button onClick={() => void handleDownload(c.reserva_id)} className="p-1 text-gray-500 transition-colors hover:text-primary" title="Visualizar / baixar PDF"><Eye size={18} /></button><button onClick={() => void handleDownload(c.reserva_id, c.cliente_nome)} className="p-1 text-gray-500 transition-colors hover:text-primary" title="Baixar PDF"><Download size={18} /></button></> : <button onClick={() => abrirGerarContrato(c)} className="p-1 text-gray-500 transition-colors hover:text-primary" title="Abrir formulário do contrato padrão"><FileSignature size={18} /></button>}</td></tr>)}{!isLoading && contratosFiltrados.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500"><div className="flex flex-col items-center gap-2"><FileText size={24} className="text-gray-300" />Nenhum contrato encontrado</div></td></tr>}</tbody></table></div></CardContent></Card>
    </div>
  );
}
