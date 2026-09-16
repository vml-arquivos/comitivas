import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, Button, Input } from '@ui/index';
import { CalendarDays, ChevronDown, ChevronUp, ImagePlus, MapPin, PackagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';

interface Evento {
  id: string;
  nome: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  local: string;
  ativo: boolean;
}

interface Lote {
  id: string;
  evento_id: string;
  nome: string;
  descricao?: string | null;
  vagas_totais: number;
  vagas_disponíveis: number;
  data_inicio: string;
  data_fim: string;
  data_embarque?: string | null;
  data_retorno?: string | null;
  local_embarque?: string | null;
  local_hospedagem?: string | null;
}

type Foto = {
  id: string;
  url_foto: string;
  legenda?: string | null;
  alt_text?: string | null;
  ordem?: number | null;
  capa?: boolean;
};

type PeriodoPacote = {
  id: string;
  pacote_id: string;
  nome: string;
  descricao?: string | null;
  data_inicio: string;
  data_fim: string;
  data_embarque?: string | null;
  data_retorno?: string | null;
  ordem?: number;
  ativo: boolean;
};

type Modalidade = 'camping' | 'quarto_ventilador' | 'quarto_ar_condicionado';
type Disponibilidade = 'disponivel' | 'ultimas_vagas' | 'esgotado';
type FormaContratacao = 'onibus' | 'hospedagem' | 'onibus_hospedagem' | 'livre';

interface Pacote {
  id: string;
  lote_id: string;
  nome: string;
  descricao?: string | null;
  valor_total: string;
  itens_selecionados?: unknown[];
  modalidade_hospedagem: Modalidade;
  disponibilidade: Disponibilidade;
  contrato_modelo: string;
  forma_contratacao: FormaContratacao;
  onibus_config?: Array<{ id: string; nome: string; capacidade: number }>;
  configuracao_pagamento?: {
    formas_permitidas?: string[];
    boleto_parcelas_maximo?: number;
    credito_parcelas_maximo?: number;
    credito_taxa_percentual?: number;
    credito_juros_mensal_percentual?: number;
    prazo_seguranca_dias?: number;
    multa_atraso_percentual?: number;
    juros_mora_mensal_percentual?: number;
  };
  data_limite_pagamento?: string | null;
  ativo: boolean;
  fotos?: Foto[];
  periodos?: PeriodoPacote[];
}

const modalidades: Record<Modalidade, { titulo: string; descricao: string }> = {
  camping: { titulo: 'Camping', descricao: 'Vivência coletiva na estrutura de camping da excursão.' },
  quarto_ventilador: { titulo: 'Quarto com ventilador', descricao: 'Hospedagem em quarto com ventilador.' },
  quarto_ar_condicionado: { titulo: 'Quarto com ar-condicionado', descricao: 'Hospedagem em quarto com ar-condicionado.' },
};

const formaLabels: Record<FormaContratacao, string> = {
  onibus_hospedagem: 'Transporte + hospedagem',
  hospedagem: 'Somente hospedagem',
  onibus: 'Somente transporte',
  livre: 'Configuração legada',
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function dataSaoPauloIso(valor: string, fimDoDia = false) {
  return new Date(`${valor}T${fimDoDia ? '23:59:00' : '00:00:00'}-03:00`).toISOString();
}

function dataHoraSaoPauloIso(valor: string) {
  return new Date(`${valor}:00-03:00`).toISOString();
}

function partesData(valor: string) {
  return Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(valor)).map((parte) => [parte.type, parte.value]));
}

function paraDataInput(valor?: string | null) {
  if (!valor) return '';
  const parte = partesData(valor);
  return `${parte.year}-${parte.month}-${parte.day}`;
}

function paraDataHoraInput(valor?: string | null) {
  if (!valor) return '';
  const parte = partesData(valor);
  return `${parte.year}-${parte.month}-${parte.day}T${parte.hour}:${parte.minute}`;
}

function disponibilidadeLabel(valor: Disponibilidade) {
  return valor === 'esgotado' ? 'Esgotado' : valor === 'ultimas_vagas' ? 'Últimas vagas' : 'Disponível';
}

function modeloContrato(forma: FormaContratacao) {
  if (forma === 'onibus') return 'transporte';
  if (forma === 'hospedagem') return 'hospedagem';
  if (forma === 'onibus_hospedagem') return 'hospedagem_transporte';
  return 'auto';
}

const vazioEvento = { nome: '', descricao: '', dataInicio: '', dataFim: '', local: '' };
const vazioLote = {
  nome: '', descricao: '', vagas: '', dataInicio: '', dataFim: '', dataEmbarque: '', dataRetorno: '',
  localEmbarque: '', localHospedagem: '',
};
const vazioPacote = {
  nome: '', descricao: '', valorTotal: '', modalidade: 'quarto_ventilador' as Modalidade, disponibilidade: 'disponivel' as Disponibilidade,
  formaContratacao: 'onibus_hospedagem' as FormaContratacao, quantidadeOnibus: '1', capacidadeOnibus: '44',
  formasPagamento: ['pix', 'boleto'], boletoParcelas: '11', creditoParcelas: '10', creditoTaxa: '0', creditoJurosMensal: '0',
  prazoSegurancaDias: '0', multaAtraso: '2', jurosMoraMensal: '1', dataLimitePagamento: '',
};
const vazioPeriodo = { nome: '', descricao: '', dataInicio: '', dataFim: '', dataEmbarque: '', dataRetorno: '', ordem: '' };

export default function EventosAdmin() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lotesPorEvento, setLotesPorEvento] = useState<Record<string, Lote[]>>({});
  const [pacotesPorLote, setPacotesPorLote] = useState<Record<string, Pacote[]>>({});
  const [fotosPorEvento, setFotosPorEvento] = useState<Record<string, Foto[]>>({});
  const [fotosPorPacote, setFotosPorPacote] = useState<Record<string, Foto[]>>({});
  const [periodosPorPacote, setPeriodosPorPacote] = useState<Record<string, PeriodoPacote[]>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [loteAberto, setLoteAberto] = useState<string | null>(null);
  const [pacotesAbertos, setPacotesAbertos] = useState<string | null>(null);
  const [galeriaPacoteAberta, setGaleriaPacoteAberta] = useState<string | null>(null);
  const [periodosPacoteAberto, setPeriodosPacoteAberto] = useState<string | null>(null);
  const [periodoEditando, setPeriodoEditando] = useState<string | null>(null);
  const [mostrarFormEvento, setMostrarFormEvento] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<string | null>(null);
  const [loteEditando, setLoteEditando] = useState<string | null>(null);
  const [pacoteEditando, setPacoteEditando] = useState<string | null>(null);
  const [eventoForm, setEventoForm] = useState(vazioEvento);
  const [loteForm, setLoteForm] = useState(vazioLote);
  const [pacoteForm, setPacoteForm] = useState(vazioPacote);
  const [periodoForm, setPeriodoForm] = useState(vazioPeriodo);
  const [fotoEvento, setFotoEvento] = useState<{ arquivo: File | null; legenda: string }>({ arquivo: null, legenda: '' });
  const [fotoPacote, setFotoPacote] = useState<{ pacoteId: string; arquivo: File | null; legenda: string }>({ pacoteId: '', arquivo: null, legenda: '' });
  const [fotoEventoKey, setFotoEventoKey] = useState(0);
  const [fotoPacoteKey, setFotoPacoteKey] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const erroDaApi = (err: any, fallback: string) => err?.response?.data?.erro || fallback;
  const limparFeedback = () => { setErro(null); setMensagem(null); };

  const carregarEventos = async () => {
    try {
      setErro(null);
      const resposta = await api.get('/eventos');
      setEventos(resposta.data.eventos || []);
    } catch (err: any) {
      setErro(erroDaApi(err, 'Não foi possível carregar as excursões.'));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregarEventos(); }, []);

  const carregarLotes = async (eventoId: string) => {
    const resposta = await api.get(`/lotes/evento/${eventoId}`);
    setLotesPorEvento((atual) => ({ ...atual, [eventoId]: resposta.data.lotes || [] }));
  };

  const carregarPacotes = async (loteId: string) => {
    const resposta = await api.get(`/pacotes/lotes/${loteId}/pacotes`);
    const lista = (resposta.data.pacotes || []) as Pacote[];
    setPacotesPorLote((atual) => ({ ...atual, [loteId]: lista }));
    setFotosPorPacote((atual) => Object.fromEntries([
      ...Object.entries(atual),
      ...lista.filter((pacote) => Array.isArray(pacote.fotos)).map((pacote) => [pacote.id, pacote.fotos || []]),
    ]));
    setPeriodosPorPacote((atual) => Object.fromEntries([
      ...Object.entries(atual),
      ...lista.filter((pacote) => Array.isArray(pacote.periodos)).map((pacote) => [pacote.id, pacote.periodos || []]),
    ]));
  };

  const carregarFotosEvento = async (eventoId: string) => {
    const resposta = await api.get(`/eventos/${eventoId}/fotos`);
    setFotosPorEvento((atual) => ({ ...atual, [eventoId]: resposta.data.fotos || [] }));
  };

  const carregarFotosPacote = async (pacoteId: string) => {
    const resposta = await api.get(`/pacotes/${pacoteId}/fotos`);
    setFotosPorPacote((atual) => ({ ...atual, [pacoteId]: resposta.data.fotos || [] }));
  };

  const carregarPeriodosPacote = async (pacoteId: string) => {
    const resposta = await api.get(`/pacotes/${pacoteId}/periodos`);
    setPeriodosPorPacote((atual) => ({ ...atual, [pacoteId]: resposta.data.periodos || [] }));
  };

  const alternarEvento = async (eventoId: string) => {
    limparFeedback();
    if (expandido === eventoId) { setExpandido(null); return; }
    setExpandido(eventoId);
    try { await Promise.all([carregarLotes(eventoId), carregarFotosEvento(eventoId)]); }
    catch (err: any) { setErro(erroDaApi(err, 'Não foi possível carregar os detalhes da excursão.')); }
  };

  const salvarEvento = async (e: FormEvent) => {
    e.preventDefault();
    limparFeedback();
    if (!eventoForm.nome.trim() || !eventoForm.local.trim() || !eventoForm.dataInicio || !eventoForm.dataFim) {
      setErro('Informe nome, destino e as duas datas da excursão.'); return;
    }
    if (eventoForm.dataInicio > eventoForm.dataFim) { setErro('A data de saída deve ser anterior à data de retorno.'); return; }
    setSalvando(true);
    try {
      const payload = { nome: eventoForm.nome.trim(), descricao: eventoForm.descricao.trim(), local: eventoForm.local.trim(), data_inicio: dataSaoPauloIso(eventoForm.dataInicio), data_fim: dataSaoPauloIso(eventoForm.dataFim, true) };
      const resposta = eventoEditando ? await api.put(`/eventos/${eventoEditando}`, payload) : await api.post('/eventos', payload);
      if (eventoEditando) setEventos((atual) => atual.map((item) => item.id === eventoEditando ? resposta.data.evento : item));
      else setEventos((atual) => [resposta.data.evento, ...atual]);
      setMensagem(eventoEditando ? 'Excursão atualizada.' : 'Excursão criada. Agora adicione um lote e os pacotes.');
      setEventoForm(vazioEvento); setEventoEditando(null); setMostrarFormEvento(false);
    } catch (err: any) { setErro(erroDaApi(err, 'Não foi possível salvar a excursão.')); }
    finally { setSalvando(false); }
  };

  const salvarLote = async (e: FormEvent, eventoId: string) => {
    e.preventDefault();
    limparFeedback();
    if (!loteForm.nome.trim() || !loteForm.vagas || !loteForm.dataInicio || !loteForm.dataFim) {
      setErro('Informe o nome do lote, a quantidade de vagas e o período.'); return;
    }
    if (loteForm.dataInicio > loteForm.dataFim) { setErro('O início do lote deve ser anterior ao fim.'); return; }
    setSalvando(true);
    try {
      const existente = loteEditando ? (lotesPorEvento[eventoId] || []).find((item) => item.id === loteEditando) : null;
      const vagas = Number(loteForm.vagas);
      const ocupadas = existente ? Math.max(0, Number(existente.vagas_totais) - Number(existente.vagas_disponíveis)) : 0;
      if (!Number.isInteger(vagas) || vagas < 1 || vagas < ocupadas) { setErro(`A capacidade deve ser inteira e não pode ser menor que ${ocupadas} vaga(s) já ocupada(s).`); return; }
      const payload = {
        evento_id: eventoId, nome: loteForm.nome.trim(), descricao: loteForm.descricao.trim(), vagas_totais: vagas,
        vagas_disponiveis: vagas - ocupadas, data_inicio: dataSaoPauloIso(loteForm.dataInicio), data_fim: dataSaoPauloIso(loteForm.dataFim, true),
        data_embarque: loteForm.dataEmbarque ? dataHoraSaoPauloIso(loteForm.dataEmbarque) : undefined,
        data_retorno: loteForm.dataRetorno ? dataHoraSaoPauloIso(loteForm.dataRetorno) : undefined,
        local_embarque: loteForm.localEmbarque.trim() || undefined, local_hospedagem: loteForm.localHospedagem.trim() || undefined,
        ...(existente ? {} : { valor_base: 0 }),
      };
      if (loteEditando) await api.put(`/lotes/${loteEditando}`, payload); else await api.post('/lotes', payload);
      await carregarLotes(eventoId);
      setMensagem(loteEditando ? 'Lote atualizado.' : 'Lote criado. Agora cadastre os pacotes e os preços.');
      setLoteForm(vazioLote); setLoteEditando(null); setLoteAberto(null);
    } catch (err: any) { setErro(erroDaApi(err, 'Não foi possível salvar o lote.')); }
    finally { setSalvando(false); }
  };

  const abrirPacotes = async (loteId: string) => {
    limparFeedback();
    setPacotesAbertos(loteId);
    setPacoteEditando(null);
    setPeriodosPacoteAberto(null);
    setPacoteForm(vazioPacote);
    try { await carregarPacotes(loteId); }
    catch (err: any) { setErro(erroDaApi(err, 'Não foi possível carregar os pacotes.')); }
  };

  const salvarPacote = async (e: FormEvent, loteId: string) => {
    e.preventDefault();
    limparFeedback();
    if (!pacoteForm.nome.trim() || !pacoteForm.valorTotal || Number(pacoteForm.valorTotal) <= 0) {
      setErro('Informe o nome e o preço do pacote.'); return;
    }
    if (pacoteForm.formasPagamento.length === 0) { setErro('Selecione ao menos uma forma de pagamento.'); return; }
    setSalvando(true);
    try {
      const anterior = pacoteEditando ? (pacotesPorLote[loteId] || []).find((item) => item.id === pacoteEditando) : null;
      const payload = {
        lote_id: loteId, nome: pacoteForm.nome.trim(), descricao: pacoteForm.descricao.trim() || modalidades[pacoteForm.modalidade].descricao,
        valor_total: Number(pacoteForm.valorTotal), itens_selecionados: anterior?.itens_selecionados || [], modalidade_hospedagem: pacoteForm.modalidade,
        disponibilidade: pacoteForm.disponibilidade, contrato_modelo: modeloContrato(pacoteForm.formaContratacao), forma_contratacao: pacoteForm.formaContratacao,
        onibus_config: pacoteForm.formaContratacao.includes('onibus') ? Array.from({ length: Math.max(1, Number(pacoteForm.quantidadeOnibus) || 1) }, (_, indice) => ({ id: `onibus-${indice + 1}`, nome: `Ônibus ${indice + 1}`, capacidade: Math.max(1, Number(pacoteForm.capacidadeOnibus) || 1) })) : [],
        configuracao_pagamento: {
          formas_permitidas: pacoteForm.formasPagamento, boleto_parcelas_maximo: Math.max(1, Number(pacoteForm.boletoParcelas) || 1), credito_parcelas_maximo: Math.max(1, Number(pacoteForm.creditoParcelas) || 1),
          credito_taxa_percentual: Math.max(0, Number(pacoteForm.creditoTaxa) || 0), credito_juros_mensal_percentual: Math.max(0, Number(pacoteForm.creditoJurosMensal) || 0), prazo_seguranca_dias: Math.max(0, Number(pacoteForm.prazoSegurancaDias) || 0),
          multa_atraso_percentual: Math.max(0, Number(pacoteForm.multaAtraso) || 0), juros_mora_mensal_percentual: Math.max(0, Number(pacoteForm.jurosMoraMensal) || 0),
        },
        data_limite_pagamento: pacoteForm.dataLimitePagamento ? dataSaoPauloIso(pacoteForm.dataLimitePagamento, true) : undefined,
      };
      const resposta = pacoteEditando ? await api.put(`/pacotes/${pacoteEditando}`, payload) : await api.post('/pacotes', payload);
      const pacoteSalvo = resposta.data.pacote as Pacote;
      await carregarPacotes(loteId);
      setMensagem(pacoteEditando ? 'Pacote atualizado.' : 'Pacote criado. Você pode criar novo pacote ou adicionar fotos agora.');
      setPacoteForm(vazioPacote); setPacoteEditando(null);
      if (pacoteSalvo?.id) await carregarFotosPacote(pacoteSalvo.id).catch(() => undefined);
    } catch (err: any) { setErro(erroDaApi(err, 'Não foi possível salvar o pacote.')); }
    finally { setSalvando(false); }
  };

  const abrirPeriodosPacote = async (pacoteId: string) => {
    limparFeedback();
    const abrir = periodosPacoteAberto !== pacoteId;
    setPeriodosPacoteAberto(abrir ? pacoteId : null);
    setPeriodoEditando(null);
    setPeriodoForm(vazioPeriodo);
    if (abrir) {
      try { await carregarPeriodosPacote(pacoteId); }
      catch (err: any) { setErro(erroDaApi(err, 'Não foi possível carregar os períodos do pacote.')); }
    }
  };

  const salvarPeriodo = async (e: FormEvent, pacoteId: string) => {
    e.preventDefault();
    limparFeedback();
    if (!periodoForm.nome.trim() || !periodoForm.dataInicio || !periodoForm.dataFim) { setErro('Informe o nome e o intervalo do período.'); return; }
    if (periodoForm.dataInicio > periodoForm.dataFim) { setErro('A data inicial deve ser anterior à data final.'); return; }
    if (periodoForm.dataEmbarque && periodoForm.dataRetorno && periodoForm.dataEmbarque > periodoForm.dataRetorno) { setErro('A saída deve ocorrer antes do retorno.'); return; }
    setSalvando(true);
    try {
      const payload = {
        nome: periodoForm.nome.trim(), descricao: periodoForm.descricao.trim() || undefined,
        data_inicio: dataSaoPauloIso(periodoForm.dataInicio), data_fim: dataSaoPauloIso(periodoForm.dataFim, true),
        data_embarque: periodoForm.dataEmbarque ? dataHoraSaoPauloIso(periodoForm.dataEmbarque) : null,
        data_retorno: periodoForm.dataRetorno ? dataHoraSaoPauloIso(periodoForm.dataRetorno) : null,
        ordem: periodoForm.ordem ? Number(periodoForm.ordem) : undefined,
      };
      if (periodoEditando) await api.put(`/pacotes/${pacoteId}/periodos/${periodoEditando}`, payload);
      else await api.post(`/pacotes/${pacoteId}/periodos`, payload);
      await carregarPeriodosPacote(pacoteId);
      setPeriodoForm(vazioPeriodo); setPeriodoEditando(null);
      setMensagem(periodoEditando ? 'Período atualizado.' : 'Período adicionado ao pacote.');
    } catch (err: any) { setErro(erroDaApi(err, 'Não foi possível salvar o período.')); }
    finally { setSalvando(false); }
  };

  const editarPeriodo = (periodo: PeriodoPacote) => {
    setPeriodoEditando(periodo.id);
    setPeriodoForm({ nome: periodo.nome, descricao: periodo.descricao || '', dataInicio: paraDataInput(periodo.data_inicio), dataFim: paraDataInput(periodo.data_fim), dataEmbarque: paraDataHoraInput(periodo.data_embarque), dataRetorno: paraDataHoraInput(periodo.data_retorno), ordem: String(periodo.ordem ?? '') });
  };

  const excluirPeriodo = async (pacoteId: string, periodoId: string) => {
    if (!window.confirm('Excluir este período? Se houver reservas, ele será apenas desativado para preservar o histórico.')) return;
    try {
      limparFeedback();
      const resposta = await api.delete(`/pacotes/${pacoteId}/periodos/${periodoId}`);
      await carregarPeriodosPacote(pacoteId);
      setMensagem(resposta.data.mensagem || 'Período removido.');
    } catch (err: any) { setErro(erroDaApi(err, 'Não foi possível excluir o período.')); }
  };

  const editarEvento = (evento: Evento) => {
    limparFeedback(); setEventoEditando(evento.id); setEventoForm({ nome: evento.nome, descricao: evento.descricao || '', dataInicio: paraDataInput(evento.data_inicio), dataFim: paraDataInput(evento.data_fim), local: evento.local }); setMostrarFormEvento(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editarLote = (eventoId: string, lote: Lote) => {
    limparFeedback(); setLoteEditando(lote.id); setLoteAberto(eventoId); setLoteForm({ nome: lote.nome, descricao: lote.descricao || '', vagas: String(lote.vagas_totais), dataInicio: paraDataInput(lote.data_inicio), dataFim: paraDataInput(lote.data_fim), dataEmbarque: paraDataHoraInput(lote.data_embarque), dataRetorno: paraDataHoraInput(lote.data_retorno), localEmbarque: lote.local_embarque || '', localHospedagem: lote.local_hospedagem || '' });
  };

  const editarPacote = (loteId: string, pacote: Pacote) => {
    const pagamento = pacote.configuracao_pagamento || {};
    limparFeedback(); setPacotesAbertos(loteId); setPacoteEditando(pacote.id); setGaleriaPacoteAberta(null); setPeriodosPacoteAberto(pacote.id); setPacoteForm({
      nome: pacote.nome, descricao: pacote.descricao || '', valorTotal: String(pacote.valor_total), modalidade: pacote.modalidade_hospedagem, disponibilidade: pacote.disponibilidade,
      formaContratacao: pacote.forma_contratacao || 'onibus_hospedagem', quantidadeOnibus: String(pacote.onibus_config?.length || 1), capacidadeOnibus: String(pacote.onibus_config?.[0]?.capacidade || 44),
      formasPagamento: pagamento.formas_permitidas || ['pix', 'boleto'], boletoParcelas: String(pagamento.boleto_parcelas_maximo || 1), creditoParcelas: String(pagamento.credito_parcelas_maximo || 10), creditoTaxa: String(pagamento.credito_taxa_percentual || 0), creditoJurosMensal: String(pagamento.credito_juros_mensal_percentual || 0), prazoSegurancaDias: String(pagamento.prazo_seguranca_dias || 0), multaAtraso: String(pagamento.multa_atraso_percentual || 0), jurosMoraMensal: String(pagamento.juros_mora_mensal_percentual || 0), dataLimitePagamento: pacote.data_limite_pagamento ? paraDataInput(pacote.data_limite_pagamento) : '',
    });
    void carregarPeriodosPacote(pacote.id);
    window.setTimeout(() => document.getElementById(`config-pacote-${loteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const excluirEvento = async (eventoId: string) => {
    if (!window.confirm('Excluir esta excursão? Se houver histórico, ela será arquivada para preservar reservas e contratos.')) return;
    try { limparFeedback(); const resposta = await api.delete(`/eventos/${eventoId}`); setMensagem(resposta.data.mensagem || 'Excursão removida.'); setEventos((atual) => atual.filter((item) => item.id !== eventoId)); }
    catch (err: any) { setErro(erroDaApi(err, 'Não foi possível excluir a excursão.')); }
  };

  const excluirLote = async (eventoId: string, loteId: string) => {
    if (!window.confirm('Excluir este lote? Se houver histórico, ele será arquivado.')) return;
    try { limparFeedback(); const resposta = await api.delete(`/lotes/${loteId}`); setMensagem(resposta.data.mensagem || 'Lote removido.'); await carregarLotes(eventoId); }
    catch (err: any) { setErro(erroDaApi(err, 'Não foi possível excluir o lote.')); }
  };

  const excluirPacote = async (loteId: string, pacoteId: string) => {
    if (!window.confirm('Excluir este pacote? Se houver vendas, ele será arquivado para preservar o histórico.')) return;
    try {
      limparFeedback();
      const resposta = await api.delete(`/pacotes/${pacoteId}`);
      setPacotesPorLote((atual) => ({ ...atual, [loteId]: (atual[loteId] || []).filter((item) => item.id !== pacoteId) }));
      setMensagem(resposta.data.mensagem || 'Pacote removido.');
      await carregarPacotes(loteId);
    }
    catch (err: any) { setErro(erroDaApi(err, 'Não foi possível excluir o pacote.')); }
  };

  const enviarFotoEvento = async (e: FormEvent, eventoId: string) => {
    e.preventDefault();
    if (!fotoEvento.arquivo) { setErro('Selecione uma imagem da excursão.'); return; }
    setSalvando(true); limparFeedback();
    try {
      await api.post(`/eventos/${eventoId}/fotos`, fotoEvento.arquivo, { headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(fotoEvento.arquivo.name), 'X-File-Mime': fotoEvento.arquivo.type, 'X-File-Caption': encodeURIComponent(fotoEvento.legenda.trim()), 'X-File-Alt': encodeURIComponent(fotoEvento.legenda.trim()) } });
      await carregarFotosEvento(eventoId); setFotoEvento({ arquivo: null, legenda: '' }); setFotoEventoKey((atual) => atual + 1); setMensagem('Imagem da excursão adicionada.');
    } catch (err: any) { setErro(erroDaApi(err, 'Não foi possível enviar a imagem da excursão.')); }
    finally { setSalvando(false); }
  };

  const enviarFotoPacote = async (e: FormEvent, pacoteId: string) => {
    e.preventDefault();
    if (!fotoPacote.arquivo || fotoPacote.pacoteId !== pacoteId) { setErro('Selecione uma imagem do pacote.'); return; }
    setSalvando(true); limparFeedback();
    try {
      await api.post(`/pacotes/${pacoteId}/fotos`, fotoPacote.arquivo, { headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(fotoPacote.arquivo.name), 'X-File-Mime': fotoPacote.arquivo.type, 'X-File-Caption': encodeURIComponent(fotoPacote.legenda.trim()), 'X-File-Alt': encodeURIComponent(fotoPacote.legenda.trim()) } });
      await carregarFotosPacote(pacoteId); setFotoPacote({ pacoteId: '', arquivo: null, legenda: '' }); setFotoPacoteKey((atual) => atual + 1); setMensagem('Imagem do pacote adicionada.');
    } catch (err: any) { setErro(erroDaApi(err, 'Não foi possível enviar a imagem do pacote.')); }
    finally { setSalvando(false); }
  };

  const removerFotoEvento = async (eventoId: string, fotoId: string) => {
    if (!window.confirm('Remover esta imagem da excursão?')) return;
    try { await api.delete(`/eventos/${eventoId}/fotos/${fotoId}`); await carregarFotosEvento(eventoId); setMensagem('Imagem removida.'); }
    catch (err: any) { setErro(erroDaApi(err, 'Não foi possível remover a imagem.')); }
  };

  const removerFotoPacote = async (pacoteId: string, fotoId: string) => {
    if (!window.confirm('Remover esta imagem do pacote?')) return;
    try { await api.delete(`/pacotes/${pacoteId}/fotos/${fotoId}`); await carregarFotosPacote(pacoteId); setMensagem('Imagem removida.'); }
    catch (err: any) { setErro(erroDaApi(err, 'Não foi possível remover a imagem.')); }
  };

  const renderGaleriaEvento = (eventoId: string) => {
    const fotos = fotosPorEvento[eventoId] || [];
    return (
      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="flex items-center gap-2 font-bold text-slate-900"><ImagePlus size={18} className="text-[#C94F38]" /> Imagens da excursão</h3><p className="mt-1 text-xs text-slate-500">Adicione até cinco imagens principais para a vitrine: destino, grupo e experiência.</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{fotos.length}/5 imagens</span>
        </div>
        <form onSubmit={(e) => void enviarFotoEvento(e, eventoId)} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-[1.2fr_1fr_auto] md:items-end">
          <div><label htmlFor={`foto-evento-${eventoId}`} className="mb-1 block text-sm font-medium text-slate-700">Imagem</label><input key={fotoEventoKey} id={`foto-evento-${eventoId}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFotoEvento({ ...fotoEvento, arquivo: e.target.files?.[0] || null })} className="block h-10 w-full rounded-md border border-slate-300 bg-white text-sm file:mr-3 file:h-full file:border-0 file:bg-slate-100 file:px-3" /></div>
          <Input label="Legenda / texto alternativo" value={fotoEvento.legenda} onChange={(e) => setFotoEvento({ ...fotoEvento, legenda: e.target.value })} placeholder="Ex.: Parque do Peão" />
          <Button type="submit" disabled={salvando}>{salvando ? 'Enviando...' : 'Adicionar imagem'}</Button>
        </form>
        {fotos.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{fotos.map((foto) => <figure key={foto.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={foto.url_foto} alt={foto.alt_text || foto.legenda || 'Imagem da excursão'} className="h-28 w-full object-cover" /><figcaption className="truncate px-2 py-1 text-[11px] text-slate-500">{foto.legenda || 'Sem legenda'}</figcaption><button type="button" onClick={() => void removerFotoEvento(eventoId, foto.id)} className="absolute right-1 top-1 rounded-full bg-white/95 p-1.5 text-slate-500 shadow hover:text-red-600" aria-label="Remover imagem"><Trash2 size={13} /></button></figure>)}</div>}
      </section>
    );
  };

  const renderGaleriaPacote = (pacote: Pacote) => {
    const fotos = fotosPorPacote[pacote.id] || [];
    return <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Imagens do pacote</p><span className="text-xs font-semibold text-slate-500">{fotos.length}/5</span></div>
      <form onSubmit={(e) => void enviarFotoPacote(e, pacote.id)} className="mt-3 grid gap-2 md:grid-cols-[1.2fr_1fr_auto] md:items-end"><div><label htmlFor={`foto-pacote-${pacote.id}`} className="mb-1 block text-xs font-semibold text-slate-600">Imagem</label><input key={fotoPacoteKey} id={`foto-pacote-${pacote.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFotoPacote({ pacoteId: pacote.id, arquivo: e.target.files?.[0] || null, legenda: fotoPacote.legenda })} className="block h-9 w-full rounded-md border border-slate-300 bg-white text-xs file:mr-2 file:h-full file:border-0 file:bg-slate-100 file:px-2" /></div><Input label="Legenda" value={fotoPacote.pacoteId === pacote.id ? fotoPacote.legenda : ''} onChange={(e) => setFotoPacote({ ...fotoPacote, pacoteId: pacote.id, legenda: e.target.value })} placeholder="Ex.: Quarto" /><Button type="submit" variant="outline" disabled={salvando || fotos.length >= 5}>{salvando ? 'Enviando...' : fotos.length >= 5 ? 'Limite atingido' : 'Adicionar'}</Button></form>
      {fotos.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{fotos.map((foto) => <figure key={foto.id} className="relative overflow-hidden rounded-lg border border-slate-200 bg-white"><img src={foto.url_foto} alt={foto.alt_text || foto.legenda || 'Imagem do pacote'} className="h-20 w-full object-cover" /><button type="button" onClick={() => void removerFotoPacote(pacote.id, foto.id)} className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-slate-500 shadow hover:text-red-600" aria-label="Remover imagem"><Trash2 size={12} /></button></figure>)}</div>}
    </div>;
  };

  const renderPeriodosPacote = (pacote: Pacote) => {
    const periodos = periodosPorPacote[pacote.id] || pacote.periodos || [];
    return <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Períodos do pacote</p><p className="mt-1 text-xs text-slate-500">Cadastre finais de semana ou datas diferentes para o cliente escolher no site.</p></div>
        <Button type="button" variant="outline" onClick={() => { setPeriodoEditando(null); setPeriodoForm(vazioPeriodo); }}><Plus size={14} className="mr-1" />Novo período</Button>
      </div>
      <form onSubmit={(e) => void salvarPeriodo(e, pacote.id)} className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-4">
        <Input label="Nome do período" value={periodoForm.nome} onChange={(e) => setPeriodoForm({ ...periodoForm, nome: e.target.value })} placeholder="1º fim de semana" />
        <Input label="Início" type="date" value={periodoForm.dataInicio} onChange={(e) => setPeriodoForm({ ...periodoForm, dataInicio: e.target.value })} />
        <Input label="Fim" type="date" value={periodoForm.dataFim} onChange={(e) => setPeriodoForm({ ...periodoForm, dataFim: e.target.value })} />
        <Input label="Ordem (opcional)" type="number" min={0} value={periodoForm.ordem} onChange={(e) => setPeriodoForm({ ...periodoForm, ordem: e.target.value })} />
        <Input label="Saída (opcional)" type="datetime-local" value={periodoForm.dataEmbarque} onChange={(e) => setPeriodoForm({ ...periodoForm, dataEmbarque: e.target.value })} />
        <Input label="Retorno (opcional)" type="datetime-local" value={periodoForm.dataRetorno} onChange={(e) => setPeriodoForm({ ...periodoForm, dataRetorno: e.target.value })} />
        <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Descrição (opcional)<textarea value={periodoForm.descricao} onChange={(e) => setPeriodoForm({ ...periodoForm, descricao: e.target.value })} rows={2} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" placeholder="Informação apresentada ao cliente" /></label></div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-4"><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : periodoEditando ? 'Salvar período' : 'Adicionar período'}</Button>{periodoEditando && <Button type="button" variant="outline" onClick={() => { setPeriodoEditando(null); setPeriodoForm(vazioPeriodo); }}>Cancelar edição</Button>}</div>
      </form>
      {periodos.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">Nenhum período adicional. O pacote usará as datas do lote.</p> : <div className="mt-3 space-y-2">{periodos.map((periodo) => <div key={periodo.id} className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${periodo.ativo ? 'border-slate-200' : 'border-amber-200 bg-amber-50'}`}><div><p className="text-sm font-bold text-slate-800">{periodo.nome}{!periodo.ativo && <span className="ml-2 text-[10px] uppercase text-amber-700">desativado</span>}</p><p className="text-xs text-slate-500">{new Date(periodo.data_inicio).toLocaleDateString('pt-BR')} a {new Date(periodo.data_fim).toLocaleDateString('pt-BR')}</p>{periodo.descricao && <p className="mt-1 text-xs text-slate-500">{periodo.descricao}</p>}</div><div className="flex gap-1"><button type="button" onClick={() => editarPeriodo(periodo)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" title="Editar período"><Pencil size={15} /></button><button type="button" onClick={() => void excluirPeriodo(pacote.id, periodo.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir período"><Trash2 size={15} /></button></div></div>)}</div>}
    </section>;
  };

  return <div className="admin-page">
    <section className="admin-page-header"><div className="flex w-full flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="admin-eyebrow">Catálogo</p><h1 className="admin-title">Excursões e pacotes</h1><p className="admin-subtitle">Crie a excursão, configure lotes de vagas quando precisar e coloque preço somente nos pacotes.</p></div><Button onClick={() => { limparFeedback(); setEventoEditando(null); setEventoForm(vazioEvento); setMostrarFormEvento((atual) => !atual); }}>{mostrarFormEvento ? <X size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}{mostrarFormEvento ? 'Fechar' : 'Nova excursão'}</Button></div></section>
    {erro && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
    {mensagem && <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{mensagem}</div>}

    {mostrarFormEvento && <Card className="border-[#C94F38]/20 shadow-sm"><CardContent className="p-6"><form onSubmit={(e) => void salvarEvento(e)} className="space-y-4"><div><h2 className="text-lg font-bold text-slate-900">{eventoEditando ? 'Editar excursão' : 'Nova excursão'}</h2><p className="mt-1 text-sm text-slate-500">Cadastre apenas a experiência: nome, destino e período. A excursão não tem preço.</p></div><div className="grid gap-4 md:grid-cols-2"><Input label="Nome da excursão" value={eventoForm.nome} onChange={(e) => setEventoForm({ ...eventoForm, nome: e.target.value })} placeholder="Ex.: Barretos 2027" /><Input label="Destino / local" value={eventoForm.local} onChange={(e) => setEventoForm({ ...eventoForm, local: e.target.value })} placeholder="Barretos — SP" /><Input label="Data de saída" type="date" value={eventoForm.dataInicio} onChange={(e) => setEventoForm({ ...eventoForm, dataInicio: e.target.value })} /><Input label="Data de retorno" type="date" value={eventoForm.dataFim} onChange={(e) => setEventoForm({ ...eventoForm, dataFim: e.target.value })} /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Descrição da experiência <span className="font-normal text-slate-400">(opcional)</span></label><textarea value={eventoForm.descricao} onChange={(e) => setEventoForm({ ...eventoForm, descricao: e.target.value })} rows={3} className="w-full rounded-md border border-slate-300 p-3 text-sm" placeholder="Apresente a excursão para a vitrine." /></div><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : eventoEditando ? 'Salvar excursão' : 'Criar excursão'}</Button></form></CardContent></Card>}

    {carregando && <p className="text-sm text-slate-500">Carregando excursões...</p>}
    {!carregando && eventos.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Nenhuma excursão cadastrada.</div>}
    <div className="space-y-4">{eventos.map((evento) => {
      const lotes = lotesPorEvento[evento.id] || [];
      return <Card key={evento.id} className="overflow-hidden"><CardContent className="p-0"><div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><button type="button" onClick={() => void alternarEvento(evento.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left"><div className="rounded-xl bg-[#fff0eb] p-3 text-[#C94F38]"><CalendarDays size={22} /></div><div className="min-w-0"><h2 className="truncate text-lg font-bold text-slate-900">{evento.nome}</h2><p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin size={14} />{evento.local} · {new Date(evento.data_inicio).toLocaleDateString('pt-BR')} a {new Date(evento.data_fim).toLocaleDateString('pt-BR')}</p></div>{expandido === evento.id ? <ChevronUp className="ml-auto" size={20} /> : <ChevronDown className="ml-auto" size={20} />}</button><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${evento.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{evento.ativo ? 'Publicado' : 'Arquivado'}</span><button type="button" onClick={() => editarEvento(evento)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800" title="Editar excursão"><Pencil size={17} /></button><button type="button" onClick={() => void excluirEvento(evento.id)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir excursão"><Trash2 size={17} /></button></div></div>
        {expandido === evento.id && <div className="border-t border-slate-100 bg-slate-50 p-5">{evento.descricao && <p className="mb-5 max-w-3xl text-sm leading-6 text-slate-600">{evento.descricao}</p>}
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">Lotes e preços</h3><p className="mt-1 text-xs text-slate-500">Opcional: use um lote para o primeiro, segundo ou qualquer condição diferente de vagas. O preço é cadastrado dentro do pacote.</p></div><Button variant="outline" onClick={() => { limparFeedback(); setLoteEditando(null); setLoteForm(vazioLote); setLoteAberto(loteAberto === evento.id ? null : evento.id); }}>{loteAberto === evento.id ? <X size={15} className="mr-2" /> : <Plus size={15} className="mr-2" />}{loteAberto === evento.id ? 'Fechar' : 'Configurar lotes'}</Button></div>
          {loteAberto === evento.id && <form onSubmit={(e) => void salvarLote(e, evento.id)} className="my-5 rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3"><h4 className="font-bold text-slate-900">{loteEditando ? 'Editar lote' : 'Configurar lote'}</h4><p className="mt-1 text-xs text-slate-500">Ex.: 1º lote, 2º lote ou grupo extra. Não informe preço aqui.</p></div><div className="grid gap-3 md:grid-cols-4"><Input label="Nome do lote" value={loteForm.nome} onChange={(e) => setLoteForm({ ...loteForm, nome: e.target.value })} placeholder="1º lote" /><Input label="Vagas" type="number" min={1} value={loteForm.vagas} onChange={(e) => setLoteForm({ ...loteForm, vagas: e.target.value })} /><Input label="Início" type="date" value={loteForm.dataInicio} onChange={(e) => setLoteForm({ ...loteForm, dataInicio: e.target.value })} /><Input label="Fim" type="date" value={loteForm.dataFim} onChange={(e) => setLoteForm({ ...loteForm, dataFim: e.target.value })} /></div><div className="mt-3 grid gap-3 md:grid-cols-2"><Input label="Embarque (opcional)" type="datetime-local" value={loteForm.dataEmbarque} onChange={(e) => setLoteForm({ ...loteForm, dataEmbarque: e.target.value })} /><Input label="Retorno (opcional)" type="datetime-local" value={loteForm.dataRetorno} onChange={(e) => setLoteForm({ ...loteForm, dataRetorno: e.target.value })} /><Input label="Local de embarque (opcional)" value={loteForm.localEmbarque} onChange={(e) => setLoteForm({ ...loteForm, localEmbarque: e.target.value })} /><Input label="Local de hospedagem (opcional)" value={loteForm.localHospedagem} onChange={(e) => setLoteForm({ ...loteForm, localHospedagem: e.target.value })} /></div><Input label="Descrição (opcional)" value={loteForm.descricao} onChange={(e) => setLoteForm({ ...loteForm, descricao: e.target.value })} placeholder="Condição comercial ou observação do lote" /><div className="mt-4 flex gap-2"><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : loteEditando ? 'Salvar lote' : 'Criar lote'}</Button><Button type="button" variant="outline" onClick={() => { setLoteAberto(null); setLoteEditando(null); }}>Cancelar</Button></div></form>}
              <div className="mt-5 space-y-3">{lotes.map((lote) => <div key={lote.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><h4 className="font-bold text-slate-900">{lote.nome}</h4><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{lote.vagas_disponíveis}/{lote.vagas_totais} vagas</span></div><p className="mt-1 text-sm text-slate-500">{new Date(lote.data_inicio).toLocaleDateString('pt-BR')} a {new Date(lote.data_fim).toLocaleDateString('pt-BR')}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => editarLote(evento.id, lote)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800" title="Editar lote"><Pencil size={16} /></button><Button variant="outline" onClick={() => void abrirPacotes(lote.id)}><PackagePlus size={15} className="mr-2" />{pacotesAbertos === lote.id ? 'Fechar pacotes' : 'Configurar Pacotes'}</Button><button type="button" onClick={() => void excluirLote(evento.id, lote.id)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir lote"><Trash2 size={16} /></button></div></div>
            {pacotesAbertos === lote.id && <div className="mt-4 flex flex-col border-t border-slate-100 pt-4"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-bold text-slate-900">Pacotes deste lote</h4><p className="mt-1 text-xs text-slate-500">Cada pacote tem seu próprio preço, modalidade, contratação e galeria.</p></div><Button variant="outline" onClick={() => { setPacoteEditando(null); setPacoteForm(vazioPacote); }}><Plus size={15} className="mr-2" />Criar novo pacote</Button></div>
              <form id={`config-pacote-${lote.id}`} onSubmit={(e) => void salvarPacote(e, lote.id)} className={`rounded-xl border border-[#C94F38]/20 bg-[#fffaf7] p-4 ${pacoteEditando ? 'order-2' : 'order-1'}`}><div className="mb-3"><h5 className="font-bold text-slate-900">{pacoteEditando ? 'Editar pacote' : 'Novo pacote'}</h5><p className="mt-1 text-xs text-slate-500">Campos essenciais ficam aqui. Regras de pagamento e operação estão em configurações avançadas.</p></div><div className="grid gap-3 md:grid-cols-4"><Input label="Nome do pacote" value={pacoteForm.nome} onChange={(e) => setPacoteForm({ ...pacoteForm, nome: e.target.value })} placeholder="Quarto com ar-condicionado" /><Input label="Preço por pessoa (R$)" type="number" min={0.01} step="0.01" value={pacoteForm.valorTotal} onChange={(e) => setPacoteForm({ ...pacoteForm, valorTotal: e.target.value })} placeholder="2600" /><div><label className="mb-1 block text-sm font-medium text-slate-700">Modalidade</label><select value={pacoteForm.modalidade} onChange={(e) => setPacoteForm({ ...pacoteForm, modalidade: e.target.value as Modalidade })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="camping">Camping</option><option value="quarto_ventilador">Quarto com ventilador</option><option value="quarto_ar_condicionado">Quarto com ar-condicionado</option></select></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Disponibilidade</label><select value={pacoteForm.disponibilidade} onChange={(e) => setPacoteForm({ ...pacoteForm, disponibilidade: e.target.value as Disponibilidade })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="disponivel">Disponível</option><option value="ultimas_vagas">Últimas vagas</option><option value="esgotado">Esgotado</option></select></div></div><div className="mt-3 grid gap-3 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-slate-700">O que está incluído</label><select value={pacoteForm.formaContratacao} onChange={(e) => setPacoteForm({ ...pacoteForm, formaContratacao: e.target.value as FormaContratacao })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="onibus_hospedagem">Transporte + hospedagem</option><option value="hospedagem">Somente hospedagem</option><option value="onibus">Somente transporte</option></select></div><Input label="Descrição (opcional)" value={pacoteForm.descricao} onChange={(e) => setPacoteForm({ ...pacoteForm, descricao: e.target.value })} placeholder="Descreva o que o cliente encontrará." /></div><details className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-bold text-slate-800">Configurações avançadas</summary><div className="mt-4 grid gap-3 md:grid-cols-4"><div className="md:col-span-4 flex flex-wrap gap-3 text-xs text-slate-600"><strong>Pagamento:</strong>{['pix', 'boleto', 'credito', 'debito'].map((forma) => <label key={forma} className="flex items-center gap-1"><input type="checkbox" checked={pacoteForm.formasPagamento.includes(forma)} onChange={(e) => setPacoteForm({ ...pacoteForm, formasPagamento: e.target.checked ? [...pacoteForm.formasPagamento, forma] : pacoteForm.formasPagamento.filter((item) => item !== forma) })} />{forma === 'pix' ? 'PIX' : forma === 'boleto' ? 'Boleto' : forma === 'credito' ? 'Cartão de crédito' : 'Cartão de débito'}</label>)}</div><Input label="Limite dos boletos" type="date" value={pacoteForm.dataLimitePagamento} onChange={(e) => setPacoteForm({ ...pacoteForm, dataLimitePagamento: e.target.value })} /><Input label="Máx. parcelas boleto" type="number" min={1} max={36} value={pacoteForm.boletoParcelas} onChange={(e) => setPacoteForm({ ...pacoteForm, boletoParcelas: e.target.value })} /><Input label="Máx. parcelas cartão" type="number" min={1} max={24} value={pacoteForm.creditoParcelas} onChange={(e) => setPacoteForm({ ...pacoteForm, creditoParcelas: e.target.value })} /><Input label="Taxa do cartão (%)" type="number" min={0} max={100} step="0.01" value={pacoteForm.creditoTaxa} onChange={(e) => setPacoteForm({ ...pacoteForm, creditoTaxa: e.target.value })} /><Input label="Juros cartão / mês (%)" type="number" min={0} max={20} step="0.01" value={pacoteForm.creditoJurosMensal} onChange={(e) => setPacoteForm({ ...pacoteForm, creditoJurosMensal: e.target.value })} /><Input label="Segurança antes da viagem (dias)" type="number" min={0} max={365} value={pacoteForm.prazoSegurancaDias} onChange={(e) => setPacoteForm({ ...pacoteForm, prazoSegurancaDias: e.target.value })} /><Input label="Multa por atraso (%)" type="number" min={0} max={100} step="0.01" value={pacoteForm.multaAtraso} onChange={(e) => setPacoteForm({ ...pacoteForm, multaAtraso: e.target.value })} /><Input label="Juros de mora / mês (%)" type="number" min={0} max={20} step="0.01" value={pacoteForm.jurosMoraMensal} onChange={(e) => setPacoteForm({ ...pacoteForm, jurosMoraMensal: e.target.value })} />{pacoteForm.formaContratacao.includes('onibus') && <><Input label="Quantidade de ônibus" type="number" min={1} max={50} value={pacoteForm.quantidadeOnibus} onChange={(e) => setPacoteForm({ ...pacoteForm, quantidadeOnibus: e.target.value })} /><Input label="Lugares por ônibus" type="number" min={1} max={100} value={pacoteForm.capacidadeOnibus} onChange={(e) => setPacoteForm({ ...pacoteForm, capacidadeOnibus: e.target.value })} /></>}</div></details><div className="mt-4 flex flex-wrap gap-2"><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : pacoteEditando ? 'Salvar pacote' : 'Criar pacote'}</Button>{pacoteEditando && <Button type="button" variant="outline" onClick={() => { setPacoteEditando(null); setPacoteForm(vazioPacote); }}>Cancelar edição</Button>}</div></form>
              <div className={`mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${pacoteEditando ? 'order-1' : 'order-2'}`}>{(pacotesPorLote[lote.id] || []).map((pacote) => <article key={pacote.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex gap-3">{(fotosPorPacote[pacote.id] || [])[0] && <img src={(fotosPorPacote[pacote.id] || [])[0].url_foto} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="font-bold text-slate-900">{pacote.nome}</p><p className="text-xs font-medium text-[#C94F38]">{modalidades[pacote.modalidade_hospedagem]?.titulo || pacote.modalidade_hospedagem}</p></div><div className="flex gap-1"><button type="button" onClick={() => editarPacote(lote.id, pacote)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" title="Editar pacote"><Pencil size={15} /></button><button type="button" onClick={() => void excluirPacote(lote.id, pacote.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir pacote"><Trash2 size={15} /></button></div></div><span className={`mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-bold uppercase ${pacote.disponibilidade === 'esgotado' ? 'bg-slate-800 text-white' : pacote.disponibilidade === 'ultimas_vagas' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{disponibilidadeLabel(pacote.disponibilidade)}</span></div></div><p className="mt-3 text-xl font-black text-slate-900">{moeda.format(Number(pacote.valor_total))}</p><p className="mt-1 text-xs text-slate-500">{formaLabels[pacote.forma_contratacao || 'livre']}</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => { setGaleriaPacoteAberta(galeriaPacoteAberta === pacote.id ? null : pacote.id); if (galeriaPacoteAberta !== pacote.id) void carregarFotosPacote(pacote.id); }} className="text-xs font-bold text-[#851F32]">{galeriaPacoteAberta === pacote.id ? 'Fechar imagens' : `Imagens (${(fotosPorPacote[pacote.id] || []).length}/5)`}</button><button type="button" onClick={() => void abrirPeriodosPacote(pacote.id)} className="text-xs font-bold text-[#851F32]">{periodosPacoteAberto === pacote.id ? 'Fechar períodos' : `Períodos (${(periodosPorPacote[pacote.id] || pacote.periodos || []).length})`}</button></div>{galeriaPacoteAberta === pacote.id && renderGaleriaPacote(pacote)}{periodosPacoteAberto === pacote.id && renderPeriodosPacote(pacote)}</article>)}</div>
            </div>}
          </div>)}
          </div>
          {lotes.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhum lote configurado. Configure um lote para publicar pacotes e preços.</div>}
          {renderGaleriaEvento(evento.id)}
        </div>}
      </CardContent></Card>;
    })}</div>
  </div>;
}
