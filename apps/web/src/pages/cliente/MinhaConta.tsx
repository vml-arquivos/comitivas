import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, BedDouble, Calendar, CheckCircle2, CircleDollarSign, Clock3, Download, Eye, FileText, History, LifeBuoy, MapPin, Pencil, Plane, RefreshCcw, RotateCcw, ScanLine, ShieldCheck, Ticket, UploadCloud, UserRound, XCircle } from 'lucide-react';
import { Button, Card, CardContent } from '@ui/index';
import { api } from '../../contexts/AuthContext';

const TABS = [
  ['visao', 'Visão geral'],
  ['pacotes', 'Explorar pacotes'],
  ['viagens', 'Minhas viagens'],
  ['pagamentos', 'Pagamentos'],
  ['contratos', 'Contratos'],
  ['documentos', 'Documentos'],
  ['historico', 'Histórico'],
  ['dados', 'Meus dados'],
  ['atendimento', 'Atendimento'],
] as const;

type TabId = (typeof TABS)[number][0];

function moeda(valor: string | number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(valor) || 0);
}

function data(valor?: string | null, comHora = false) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', comHora ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' }).format(d);
}

function statusReserva(reserva: any) {
  if (reserva.checkout_estado === 'cancelado_cliente') return { label: 'Cancelada', classes: 'bg-red-100 text-red-800' };
  if (reserva.checkout_estado === 'troca_pacote_cliente')
    return {
      label: 'Pacote em alteração',
      classes: 'bg-purple-100 text-purple-800',
    };
  if (reserva.checkout_estado === 'reiniciado_cliente') return { label: 'Reiniciada', classes: 'bg-slate-100 text-slate-700' };
  const map: Record<string, [string, string]> = {
    cliente_confirmado: ['Viagem confirmada', 'bg-emerald-100 text-emerald-800'],
    aguardando_pagamento: ['Aguardando pagamento', 'bg-amber-100 text-amber-800'],
    contrato_gerado: ['Contrato gerado', 'bg-indigo-100 text-indigo-800'],
    checkout_iniciado: ['Checkout iniciado', 'bg-purple-100 text-purple-800'],
    pacote_montado: ['Reserva iniciada', 'bg-blue-100 text-blue-800'],
    abandonado: ['Encerrada', 'bg-slate-100 text-slate-700'],
  };
  const [label, classes] = map[reserva.status] || ['Em andamento', 'bg-slate-100 text-slate-700'];
  return { label, classes };
}

function statusDocumento(status?: string) {
  const mapa: Record<string, { texto: string; classes: string }> = {
    nao_iniciada: { texto: 'Aguardando leitura', classes: 'bg-slate-100 text-slate-700' },
    processando: { texto: 'Conferindo', classes: 'bg-blue-100 text-blue-700' },
    aprovado: { texto: 'Dados conferidos', classes: 'bg-emerald-100 text-emerald-700' },
    rejeitado: { texto: 'Dados divergentes', classes: 'bg-red-100 text-red-700' },
    analise_manual: { texto: 'Em análise', classes: 'bg-amber-100 text-amber-800' },
    erro: { texto: 'Tentar novamente', classes: 'bg-red-100 text-red-700' },
  };
  return mapa[status || 'nao_iniciada'] || mapa.nao_iniciada;
}

function TimelineIcon({ tipo }: { tipo: string }) {
  if (tipo.includes('pagamento')) return <CircleDollarSign size={16} />;
  if (tipo.includes('contrato')) return <FileText size={16} />;
  if (tipo.includes('cancel')) return <XCircle size={16} />;
  if (tipo.includes('atendimento')) return <LifeBuoy size={16} />;
  if (tipo.includes('comunicacao')) return <CheckCircle2 size={16} />;
  return <History size={16} />;
}

export default function MinhaConta() {
  const [portal, setPortal] = useState<any>(null);
  const [ofertas, setOfertas] = useState<any[]>([]);
  const [tab, setTab] = useState<TabId>('visao');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [acaoLoading, setAcaoLoading] = useState('');
  const [assunto, setAssunto] = useState('');
  const [textoAtendimento, setTextoAtendimento] = useState('');
  const [reservaAtendimento, setReservaAtendimento] = useState('');
  const [tipoIdentidade, setTipoIdentidade] = useState('');
  const [arquivoIdentidade, setArquivoIdentidade] = useState<File | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro('');
    try {
      const [portalResp, ofertasResp] = await Promise.all([api.get('/cliente/portal'), api.get('/publico/ofertas').catch(() => ({ data: { eventos: [] } }))]);
      setPortal(portalResp.data);
      setOfertas(ofertasResp.data.eventos || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar sua conta.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const reservaPorId = useMemo(() => new Map((portal?.reservas || []).map((r: any) => [r.id, r])), [portal]);
  const contratosAtivos = useMemo(() => (portal?.contratos || []).filter((c: any) => !c.invalidado_em), [portal]);
  const pacotesPublicados = useMemo(
    () =>
      ofertas.flatMap((evento: any) =>
        (evento.lotes || []).flatMap((lote: any) =>
          (lote.modalidades || []).map((pacote: any) => ({
            ...pacote,
            evento_id: evento.id,
            evento_nome: evento.nome,
            evento_local: evento.local,
            evento_data_inicio: evento.data_inicio,
            lote_id: lote.id,
            lote_nome: lote.nome,
            lote_vagas: lote.vagas_disponiveis,
          }))
        )
      ),
    [ofertas]
  );

  const executarCancelamento = async (reserva: any) => {
    const aviso = 'O cancelamento será registrado para análise da equipe. A reserva e os valores não serão alterados automaticamente. Deseja continuar?';
    if (!window.confirm(aviso)) return;
    const motivo = window.prompt('Informe o motivo do cancelamento:', '') || '';
    if (motivo.trim().length < 5) {
      setErro('Informe o motivo do cancelamento para enviar a solicitação.');
      return;
    }
    setAcaoLoading(`cancel-${reserva.id}`);
    setErro('');
    setMensagem('');
    try {
      const response = await api.post(`/cliente/reservas/${reserva.id}/cancelar`, { motivo });
      setMensagem(response.data.mensagem);
      await carregar();
      setTab('viagens');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível processar o cancelamento.');
    } finally {
      setAcaoLoading('');
    }
  };

  const reconfigurar = async (reserva: any, acao: 'troca_pacote' | 'reinicio') => {
    const texto = acao === 'troca_pacote' ? 'alterar o pacote' : 'reiniciar a contratação';
    if (!window.confirm(`Deseja ${texto}? Se houver contrato validado ou pagamento, a equipe precisará aprovar a alteração.`)) return;
    let pacoteDestinoId: string | undefined;
    if (acao === 'troca_pacote') {
      const opcoes = pacotesPublicados.filter((pacote: any) => pacote.lote_id === reserva.lote_id && pacote.id !== reserva.pacote_id);
      if (opcoes.length > 0) {
        const escolha = window.prompt(`Escolha o novo pacote:\n${opcoes.map((pacote: any, indice: number) => `${indice + 1}. ${pacote.nome} · ${moeda(pacote.valor_total)}`).join('\n')}`, '1');
        if (escolha === null) return;
        const indice = Number(escolha) - 1;
        if (!Number.isInteger(indice) || !opcoes[indice]) {
          setErro('Escolha uma opção válida de pacote.');
          return;
        }
        pacoteDestinoId = opcoes[indice].id;
      }
    }
    const motivo = window.prompt(`Explique por que deseja ${texto}:`, '') || '';
    if (motivo.trim().length < 5) {
      setErro('Informe o motivo para enviar a solicitação.');
      return;
    }
    setAcaoLoading(`${acao}-${reserva.id}`);
    setErro('');
    setMensagem('');
    try {
      const response = await api.post(`/cliente/reservas/${reserva.id}/reconfigurar`, { acao, motivo, pacote_destino_id: pacoteDestinoId });
      if (response.data.redirect) {
        window.location.assign(response.data.redirect);
        return;
      }
      setMensagem(response.data.mensagem);
      await carregar();
      setTab('historico');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível iniciar a alteração.');
    } finally {
      setAcaoLoading('');
    }
  };

  const enviarAtendimento = async (event: React.FormEvent) => {
    event.preventDefault();
    setAcaoLoading('atendimento');
    setErro('');
    setMensagem('');
    try {
      const response = await api.post('/cliente/atendimento', {
        assunto: assunto || 'Atendimento',
        mensagem: textoAtendimento,
        reserva_id: reservaAtendimento || undefined,
      });
      setMensagem(response.data.mensagem);
      setAssunto('');
      setTextoAtendimento('');
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível enviar sua mensagem.');
    } finally {
      setAcaoLoading('');
    }
  };

  const enviarDocumentoIdentidade = async () => {
    if (!arquivoIdentidade || !tipoIdentidade) {
      setErro('Selecione o tipo e o arquivo do documento.');
      return;
    }
    setAcaoLoading('documento-identidade');
    setErro('');
    setMensagem('');
    try {
      const response = await api.post(`/cliente/documentos/identidade?tipo_identidade=${encodeURIComponent(tipoIdentidade)}`, arquivoIdentidade, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(arquivoIdentidade.name),
          'X-File-Mime': arquivoIdentidade.type,
        },
      });
      const status = response.data?.documento?.status;
      setMensagem(status === 'aprovado' ? 'Documento enviado. Os dados correspondem ao cadastro.' : 'Documento enviado para conferência.');
      setArquivoIdentidade(null);
      setTipoIdentidade('');
      await carregar();
      setTab('documentos');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível enviar o documento.');
    } finally {
      setAcaoLoading('');
    }
  };

  const repetirValidacaoDocumento = async (documentoId: string) => {
    setAcaoLoading(`validar-${documentoId}`);
    setErro('');
    setMensagem('');
    try {
      const response = await api.post(`/cliente/documentos/${documentoId}/validar`);
      setMensagem(response.data?.documento?.status === 'aprovado' ? 'Dados do documento conferidos.' : 'Documento encaminhado para nova conferência.');
      await carregar();
      setTab('documentos');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível repetir a conferência.');
    } finally {
      setAcaoLoading('');
    }
  };

  const abrirDocumento = (id: string, inline = false) => {
    window.open(`/api/cliente/documentos/${encodeURIComponent(id)}${inline ? '?inline=1' : ''}`, '_blank', 'noopener,noreferrer');
  };

  const visualizarContrato = (reservaId: string) => window.open(`/api/contratos/download/${encodeURIComponent(reservaId)}?inline=1`, '_blank', 'noopener,noreferrer');
  const baixarContrato = (reservaId: string) => window.open(`/api/contratos/download/${encodeURIComponent(reservaId)}`, '_blank', 'noopener,noreferrer');

  if (carregando) return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-slate-500">Carregando sua conta...</div>;
  if (!portal)
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="mx-auto mb-3 text-red-500" />
            <p>{erro || 'Não foi possível carregar sua conta.'}</p>
            <Button className="mt-4" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  const { usuario, resumo } = portal;
  const perfilCompleto = [usuario.nome, usuario.email, usuario.cpf, usuario.telefone, usuario.data_nascimento, usuario.endereco].filter(Boolean).length;
  const perfilPercentual = Math.round((perfilCompleto / 6) * 100);

  return (
    <div className="client-portal pb-14">
      <Helmet>
        <title>Minha conta | Excursão das Comitivas</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <section className="border-b border-slate-200 bg-[#F7F4EE] text-[#073F50]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#DF6248]">Área do cliente</p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">Olá, {String(usuario.nome || '').split(' ')[0]}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Gerencie suas viagens, contratos, pagamentos, dados e solicitações em um único lugar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/eventos">
                <Button className="bg-[#DF6248] text-white hover:bg-[#C94F38]">
                  Explorar excursões <ArrowRight size={16} />
                </Button>
              </Link>
              <button onClick={() => setTab('atendimento')} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold hover:border-[#DF6248] hover:text-[#DF6248]">
                Falar com a equipe
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Reservas', resumo.reservas, Ticket],
              ['Viagens confirmadas', resumo.viagens_confirmadas, Plane],
              ['Valor pago', moeda(resumo.valor_pago), CircleDollarSign],
              ['Parcelas pendentes', resumo.parcelas_pendentes, Clock3],
            ].map(([label, value, Icon]: any) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_25px_rgba(7,63,80,.05)]">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fff0eb] text-[#DF6248]">
                    <Icon size={15} />
                  </span>
                  {label}
                </div>
                <p className="mt-2 text-2xl font-black text-[#073F50]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="-mt-1 sticky top-[110px] z-30 border-b border-slate-200 bg-[#F8F5EF] py-3 lg:top-[86px]">
          <label className="sr-only" htmlFor="cliente-tab-mobile">
            Seção da área do cliente
          </label>
          <select id="cliente-tab-mobile" value={tab} onChange={(event) => setTab(event.target.value as TabId)} className="h-11 w-full rounded-xl border border-[#182D3B]/15 bg-white px-4 text-sm font-bold text-[#182D3B] md:hidden">
            {TABS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <div className="hidden gap-1 overflow-x-auto md:flex">
            {TABS.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${tab === id ? 'bg-[#DF6248] text-white' : 'text-slate-600 hover:bg-white hover:text-[#DF6248]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {(erro || mensagem) && <div className={`mt-5 rounded-xl border p-4 text-sm ${erro ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{erro || mensagem}</div>}

        {tab === 'visao' && (
          <div className="grid gap-6 py-6 lg:grid-cols-[1.45fr_.8fr]">
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#851F32]">Próximos passos</p>
                      <h2 className="mt-1 text-2xl font-black text-slate-900">Sua jornada</h2>
                    </div>
                    <RefreshCcw size={22} className="text-slate-400" />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {(portal.reservas || []).slice(0, 2).map((r: any) => {
                      const st = statusReserva(r);
                      return (
                        <button key={r.id} onClick={() => setTab('viagens')} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-[#851F32]/30 hover:bg-white">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-black text-slate-900">{r.evento_nome}</p>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${st.classes}`}>{st.label}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{r.pacote_nome || r.lote_nome}</p>
                          <p className="mt-3 text-xs font-bold text-[#851F32]">Abrir viagem →</p>
                        </button>
                      );
                    })}
                    {portal.reservas.length === 0 && (
                      <div className="sm:col-span-2 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
                        Você ainda não iniciou uma viagem.{' '}
                        <Link className="font-bold text-[#851F32]" to="/eventos">
                          Ver excursões
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#851F32]">Histórico recente</p>
                      <h2 className="mt-1 text-xl font-black text-slate-900">Últimas movimentações</h2>
                    </div>
                    <button onClick={() => setTab('historico')} className="text-sm font-bold text-[#851F32]">
                      Ver tudo
                    </button>
                  </div>
                  <div className="mt-5 space-y-3">
                    {portal.historico.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex gap-3 rounded-xl border border-slate-100 p-3">
                        <div className="mt-1 rounded-full bg-slate-100 p-2 text-slate-600">
                          <TimelineIcon tipo={item.tipo} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900">{item.titulo}</p>
                          <p className="truncate text-sm text-slate-500">{item.descricao || 'Movimentação registrada'}</p>
                          <p className="mt-1 text-xs text-slate-400">{data(item.criado_em, true)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#851F32]">Novas oportunidades</p>
                      <h2 className="mt-1 text-xl font-black text-slate-900">Pacotes disponíveis</h2>
                    </div>
                    <button onClick={() => setTab('pacotes')} className="text-sm font-bold text-[#851F32]">
                      Comparar pacotes
                    </button>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {pacotesPublicados
                      .filter((p: any) => p.disponibilidade !== 'esgotado')
                      .slice(0, 4)
                      .map((pacote: any) => (
                        <Link key={pacote.id} to={`/pacote/${pacote.lote_id}?pacote=${encodeURIComponent(pacote.id)}`} className="rounded-2xl border border-slate-200 p-4 transition hover:border-[#851F32]/30 hover:bg-[#fffaf5]">
                          <p className="text-[11px] font-black uppercase tracking-[.12em] text-[#851F32]">{pacote.evento_nome}</p>
                          <p className="mt-1 font-black text-slate-900">{pacote.nome}</p>
                          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                            <BedDouble size={14} />
                            {pacote.modalidade_hospedagem?.split('_').join(' ')}
                          </p>
                          <p className="mt-3 text-lg font-black text-[#182D3B]">{moeda(pacote.valor_total)}</p>
                          <p className="mt-2 text-xs font-bold text-[#851F32]">Ver detalhes e escolher →</p>
                        </Link>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#851F32]">Cadastro</p>
                      <h2 className="mt-1 text-xl font-black">Seus dados</h2>
                    </div>
                    <UserRound className="text-slate-400" />
                  </div>
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Completude</span>
                      <strong>{perfilPercentual}%</strong>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-[#851F32]" style={{ width: `${perfilPercentual}%` }} />
                    </div>
                    <div className="mt-5 space-y-2 text-sm">
                      <p>
                        <span className="text-slate-500">E-mail:</span> <strong>{usuario.email}</strong>
                      </p>
                      <p>
                        <span className="text-slate-500">WhatsApp:</span> <strong>{usuario.telefone || 'Não informado'}</strong>
                      </p>
                      <p>
                        <span className="text-slate-500">CPF:</span> <strong>{usuario.cpf || 'Não informado'}</strong>
                      </p>
                    </div>
                    <button onClick={() => setTab('dados')} className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold hover:border-[#851F32]/30">
                      Revisar cadastro
                    </button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <ShieldCheck className="text-emerald-600" />
                  <h2 className="mt-3 text-lg font-black">Histórico preservado</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">Contratos validados, pagamentos e alterações nunca são apagados. Cancelamentos e trocas posteriores à validação entram em análise da equipe.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {tab === 'pacotes' && (
          <div className="space-y-6 py-6">
            <div className="rounded-2xl border border-[#182D3B]/10 bg-white p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.16em] text-[#851F32]">Escolha com clareza</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">Compare os pacotes publicados</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Veja hospedagem, preço, disponibilidade e siga direto para a configuração do pacote desejado.</p>
                </div>
                <Link to="/eventos">
                  <Button variant="outline">
                    Abrir vitrine completa <ArrowRight size={15} />
                  </Button>
                </Link>
              </div>
            </div>
            {pacotesPublicados.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-slate-500">Nenhum pacote publicado no momento.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pacotesPublicados.map((pacote: any) => {
                  const esgotado = pacote.disponibilidade === 'esgotado';
                  return (
                    <Card key={pacote.id} className={`overflow-hidden ${esgotado ? 'opacity-70' : ''}`}>
                      <CardContent className="p-0">
                        <div className="border-b bg-[#fffaf5] p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[.13em] text-[#851F32]">{pacote.evento_nome}</p>
                              <h3 className="mt-1 text-xl font-black text-slate-900">{pacote.nome}</h3>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${esgotado ? 'bg-slate-800 text-white' : pacote.disponibilidade === 'ultimas_vagas' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{esgotado ? 'Esgotado' : pacote.disponibilidade === 'ultimas_vagas' ? 'Últimas vagas' : 'Disponível'}</span>
                          </div>
                        </div>
                        <div className="space-y-4 p-5">
                          <div className="grid gap-2 text-sm text-slate-500">
                            <p className="flex items-center gap-2">
                              <MapPin size={15} />
                              {pacote.evento_local}
                            </p>
                            <p className="flex items-center gap-2">
                              <Calendar size={15} />
                              {data(pacote.evento_data_inicio)}
                            </p>
                            <p className="flex items-center gap-2">
                              <BedDouble size={15} />
                              {String(pacote.modalidade_hospedagem || 'Pacote')
                                .split('_')
                                .join(' ')}
                            </p>
                          </div>
                          {pacote.descricao && <p className="line-clamp-3 text-sm leading-6 text-slate-600">{pacote.descricao}</p>}
                          <div className="rounded-xl bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase text-slate-400">Valor publicado</p>
                            <p className="mt-1 text-2xl font-black text-[#182D3B]">{moeda(pacote.valor_total)}</p>
                          </div>
                          {esgotado ? (
                            <Link to="/eventos">
                              <Button variant="outline" className="w-full">
                                Ver alternativas
                              </Button>
                            </Link>
                          ) : (
                            <Link to={`/pacote/${pacote.lote_id}?pacote=${encodeURIComponent(pacote.id)}`}>
                              <Button className="w-full">
                                Analisar e escolher <ArrowRight size={15} />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'viagens' && (
          <div className="grid gap-5 py-6 lg:grid-cols-2">
            {portal.reservas.map((reserva: any) => {
              const st = statusReserva(reserva);
              const solicitacaoAberta = (portal.solicitacoes || []).find((item: any) => item.reserva_id === reserva.id && ['pendente', 'em_analise', 'aprovada'].includes(item.status));
              return (
                <Card key={reserva.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="border-b bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[.13em] text-[#851F32]">{reserva.evento_nome}</p>
                          <h3 className="mt-1 text-xl font-black text-slate-900">{reserva.pacote_nome || reserva.lote_nome}</h3>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${st.classes}`}>{st.label}</span>
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
                        <p className="flex items-center gap-2">
                          <Calendar size={15} />
                          {data(reserva.evento_data_inicio)}
                        </p>
                        <p className="flex items-center gap-2">
                          <MapPin size={15} />
                          {reserva.evento_local}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4 p-5">
                      {solicitacaoAberta && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Solicitação em andamento:</strong> {solicitacaoAberta.tipo === 'cancelamento' ? 'cancelamento' : solicitacaoAberta.tipo === 'troca_pacote' ? 'alteração de pacote' : 'reinício da contratação'} · {String(solicitacaoAberta.status).replace('_', ' ')}</div>}
                      {reserva.operacao && (
                        <div className="grid gap-2 rounded-xl border border-[#851F32]/15 bg-[#fffaf5] p-4 text-sm sm:grid-cols-2">
                          <p>
                            <strong>Transporte:</strong> {reserva.operacao.onibus_nome}
                            {reserva.operacao.onibus_identificacao ? ` · ${reserva.operacao.onibus_identificacao}` : ''}
                          </p>
                          <p>
                            <strong>Lugar:</strong> {reserva.operacao.poltrona}
                          </p>
                          <p>
                            <strong>Embarque:</strong> {reserva.operacao.ponto_embarque_nome || 'A definir'}
                          </p>
                          <p>
                            <strong>Situação:</strong> {reserva.operacao.checkin_status === 'presente' ? 'Embarque confirmado' : reserva.operacao.checkin_status === 'ausente' ? 'Ausente' : 'Aguardando embarque'}
                          </p>
                        </div>
                      )}
                      {reserva.hospedagem_operacional && (
                        <div className="grid gap-2 rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm sm:grid-cols-3">
                          <p><strong>Quarto:</strong> {reserva.hospedagem_operacional.quarto_nome}</p>
                          <p><strong>Grupo:</strong> {reserva.hospedagem_operacional.grupo}</p>
                          <p><strong>Vaga:</strong> {reserva.hospedagem_operacional.vaga}</p>
                        </div>
                      )}
                      <div className="flex items-end justify-between rounded-xl bg-slate-50 p-4">
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-400">Valor contratado</p>
                          <p className="mt-1 text-xl font-black">{moeda(reserva.valor_total)}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p>{reserva.forma_pagamento ? String(reserva.forma_pagamento).toUpperCase() : 'Pagamento não definido'}</p>
                          <p>{reserva.quantidade_parcelas ? `${reserva.quantidade_parcelas} parcela(s)` : ''}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!['abandonado'].includes(reserva.status) && reserva.checkout_estado !== 'cancelado_cliente' && (
                          <Link to={`/checkout/${reserva.id}`}>
                            <Button>Continuar / ver pagamento</Button>
                          </Link>
                        )}
                        {reserva.contrato_validado || contratosAtivos.some((c: any) => c.reserva_id === reserva.id) ? (
                          <Button variant="outline" onClick={() => visualizarContrato(reserva.id)}>
                            <Eye size={15} />
                            Contrato
                          </Button>
                        ) : null}
                        <Button variant="outline" disabled={Boolean(solicitacaoAberta)} onClick={() => void reconfigurar(reserva, 'troca_pacote')} isLoading={acaoLoading === `troca_pacote-${reserva.id}`}>
                          <RefreshCcw size={15} />
                          Alterar pacote
                        </Button>
                        <Button variant="outline" disabled={Boolean(solicitacaoAberta)} onClick={() => void reconfigurar(reserva, 'reinicio')} isLoading={acaoLoading === `reinicio-${reserva.id}`}>
                          <RotateCcw size={15} />
                          Recomeçar
                        </Button>
                        <Button variant="outline" disabled={Boolean(solicitacaoAberta)} onClick={() => void executarCancelamento(reserva)} isLoading={acaoLoading === `cancel-${reserva.id}`}>
                          <XCircle size={15} />
                          Cancelar contratação
                        </Button>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-[#fffaf5] p-3 text-xs leading-5 text-slate-600">Cancelamento, troca de pacote e reinício são solicitações analisadas pela equipe. Contratos e pagamentos permanecem preservados até a decisão.</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'pagamentos' && (
          <div className="space-y-5 py-6">
            {portal.reservas.map((reserva: any) => {
              const parcelas = portal.parcelas.filter((p: any) => p.reserva_id === reserva.id);
              if (!parcelas.length && !portal.pagamentos.some((p: any) => p.reserva_id === reserva.id)) return null;
              return (
                <Card key={reserva.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-[#851F32]">{reserva.evento_nome}</p>
                        <h3 className="text-xl font-black">{reserva.pacote_nome || reserva.lote_nome}</h3>
                      </div>
                      <strong>{moeda(reserva.valor_total)}</strong>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {parcelas.map((parcela: any) => (
                        <div key={parcela.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between">
                            <strong>Parcela {parcela.sequencia}</strong>
                            <span className="text-sm font-black">{moeda(parcela.valor)}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">Vencimento: {data(parcela.vencimento)}</p>
                          <p className="mt-1 text-xs text-slate-500">Status: {parcela.pago_confirmado_em ? 'Pagamento confirmado' : parcela.status || 'Pendente'}</p>
                          <div className="mt-3 flex gap-2">
                            {parcela.boleto_documento_id && (
                              <button onClick={() => abrirDocumento(parcela.boleto_documento_id)} className="text-xs font-bold text-[#851F32]">
                                Baixar boleto
                              </button>
                            )}
                            {parcela.comprovante_documento_id && (
                              <button onClick={() => abrirDocumento(parcela.comprovante_documento_id, true)} className="text-xs font-bold text-[#851F32]">
                                Ver comprovante
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'contratos' && (
          <div className="space-y-4 py-6">
            {portal.contratos.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-slate-500">Nenhum contrato gerado ainda.</CardContent>
              </Card>
            ) : (
              portal.contratos.map((contrato: any) => {
                const reserva = reservaPorId.get(contrato.reserva_id) as any;
                return (
                  <Card key={contrato.id}>
                    <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black text-slate-900">Contrato v{contrato.versao}</h3>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${contrato.invalidado_em ? 'bg-slate-100 text-slate-600' : contrato.validado_em ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{contrato.invalidado_em ? 'Invalidado' : contrato.validado_em ? 'Validado' : 'Aguardando validação'}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {reserva?.evento_nome || 'Reserva'} · criado em {data(contrato.criado_em)}
                        </p>
                        {contrato.validado_em && <p className="mt-1 text-xs text-slate-400">Validado em {data(contrato.validado_em, true)}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!contrato.invalidado_em && (
                          <>
                            <Button variant="outline" onClick={() => visualizarContrato(contrato.reserva_id)}>
                              <Eye size={15} />
                              Visualizar
                            </Button>
                            <Button variant="outline" onClick={() => baixarContrato(contrato.reserva_id)}>
                              <Download size={15} />
                              Baixar PDF
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {tab === 'documentos' && (
          <div className="space-y-4 py-6">
            <Card>
              <CardContent className="p-5 sm:p-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
                  <div>
                    <div className="flex items-center gap-2 text-[#851F32]"><ScanLine size={20} /><span className="text-xs font-bold uppercase tracking-[.15em]">Identificação</span></div>
                    <h2 className="mt-2 text-xl font-semibold text-slate-900">Envie seu documento com foto</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Aceitamos RG, CNH, passaporte ou outro documento oficial. O sistema compara os dados visíveis com seu cadastro; a aprovação administrativa continua separada.</p>
                    {portal.validacao_documental?.obrigatoriaContrato && <p className="mt-3 text-sm font-medium text-amber-800">A conferência é necessária antes de concluir o contrato.</p>}
                  </div>
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                      <select value={tipoIdentidade} onChange={(event) => setTipoIdentidade(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm" aria-label="Tipo do documento">
                        <option value="">Tipo do documento</option>
                        <option value="rg">RG</option>
                        <option value="cnh">CNH</option>
                        <option value="passaporte">Passaporte</option>
                        <option value="outro">Outro documento</option>
                      </select>
                      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:border-[#851F32]">
                        <UploadCloud size={18} />
                        <span className="truncate">{arquivoIdentidade?.name || 'Escolher PDF ou imagem'}</span>
                        <input key={arquivoIdentidade?.name || 'vazio'} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setArquivoIdentidade(event.target.files?.[0] || null)} />
                      </label>
                    </div>
                    <ul className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                      <li>• Mostre as quatro bordas</li><li>• Evite reflexos e cortes</li><li>• Deixe nome e foto legíveis</li><li>• Até 12 MB</li>
                    </ul>
                    <Button className="mt-4 w-full sm:w-auto" onClick={() => void enviarDocumentoIdentidade()} isLoading={acaoLoading === 'documento-identidade'} disabled={!arquivoIdentidade || !tipoIdentidade}>
                      Enviar e conferir
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {portal.documentos.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-slate-500">Nenhum documento enviado ainda.</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {portal.documentos.map((doc: any) => {
                  const reserva = doc.reserva_id ? (reservaPorId.get(doc.reserva_id) as any) : null;
                  const validacao = doc.categoria === 'identidade' ? statusDocumento(doc.validacao_status) : null;
                  return (
                    <Card key={doc.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="rounded-xl bg-[#851F32]/8 p-2.5 text-[#851F32]">
                            <FileText size={20} />
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{doc.categoria?.split('_').join(' ')}</span>
                        </div>
                        <h3 className="mt-4 font-black text-slate-900">{doc.nome}</h3>
                        <p className="mt-1 text-xs text-slate-500">{doc.nome_original}</p>
                        {validacao && <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${validacao.classes}`}>{validacao.texto}</span>}
                        {doc.erro_validacao && <p className="mt-2 text-xs leading-5 text-amber-800">{doc.erro_validacao}</p>}
                        {reserva && (
                          <p className="mt-3 text-sm text-slate-600">
                            {reserva.evento_nome} · {reserva.pacote_nome || reserva.lote_nome}
                          </p>
                        )}
                        <p className="mt-3 text-xs text-slate-400">Adicionado em {data(doc.criado_em, true)}</p>
                        <div className="mt-4 flex gap-2">
                          <Button variant="outline" onClick={() => abrirDocumento(doc.id, true)}>
                            <Eye size={15} />
                            Visualizar
                          </Button>
                          <Button variant="outline" onClick={() => abrirDocumento(doc.id)}>
                            <Download size={15} />
                            Baixar
                          </Button>
                          {validacao && ['erro', 'rejeitado', 'analise_manual'].includes(doc.validacao_status) && (
                            <Button variant="outline" onClick={() => void repetirValidacaoDocumento(doc.id)} isLoading={acaoLoading === `validar-${doc.id}`}>
                              <RefreshCcw size={15} /> Conferir
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'historico' && (
          <div className="py-6">
            <Card>
              <CardContent className="p-6">
                <div className="space-y-1">
                  {portal.historico.map((item: any) => (
                    <div key={item.id} className="grid grid-cols-[36px_1fr] gap-3 border-b border-slate-100 py-4 last:border-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                        <TimelineIcon tipo={item.tipo} />
                      </div>
                      <div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <strong>{item.titulo}</strong>
                          <span className="text-xs text-slate-400">{data(item.criado_em, true)}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{item.descricao || 'Movimentação registrada.'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'dados' && (
          <div className="grid gap-6 py-6 lg:grid-cols-[1fr_.45fr]">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.16em] text-[#851F32]">Dados cadastrais</p>
                    <h2 className="mt-1 text-2xl font-black">Seu cadastro</h2>
                  </div>
                  <Link to="/meus-dados?redirect=/minha-conta">
                    <Button variant="outline">
                      <Pencil size={15} />
                      Editar
                    </Button>
                  </Link>
                </div>
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  {[
                    ['Nome', usuario.nome],
                    ['E-mail', usuario.email],
                    ['CPF', usuario.cpf],
                    ['WhatsApp', usuario.telefone],
                    ['Nascimento', data(usuario.data_nascimento)],
                    ['Endereço', usuario.endereco],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-slate-50 p-4">
                      <dt className="text-xs font-bold uppercase text-slate-400">{k}</dt>
                      <dd className="mt-1 font-semibold text-slate-800">{v || 'Não informado'}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <UserRound className="text-[#851F32]" />
                <h3 className="mt-3 text-lg font-black">Mantenha seus dados atualizados</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">Esses dados alimentam contratos, comunicação, reservas e documentos. Alterações ficam registradas no histórico administrativo.</p>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'atendimento' && (
          <div className="grid gap-6 py-6 lg:grid-cols-[1fr_.55fr]">
            <Card>
              <CardContent className="p-6">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#851F32]">Atendimento</p>
                <h2 className="mt-1 text-2xl font-black">Fale com a equipe</h2>
                <p className="mt-2 text-sm text-slate-500">Sua mensagem fica registrada na Ficha 360º e é encaminhada para o atendimento.</p>
                <form onSubmit={enviarAtendimento} className="mt-6 space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-bold">Reserva (opcional)</label>
                    <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={reservaAtendimento} onChange={(e) => setReservaAtendimento(e.target.value)}>
                      <option value="">Assunto geral</option>
                      {portal.reservas.map((r: any) => (
                        <option key={r.id} value={r.id}>
                          {r.evento_nome} · {r.pacote_nome || r.lote_nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold">Assunto</label>
                    <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: dúvida sobre pagamento" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold">Mensagem</label>
                    <textarea className="min-h-36 w-full rounded-lg border border-slate-300 px-3 py-2" value={textoAtendimento} onChange={(e) => setTextoAtendimento(e.target.value)} placeholder="Escreva sua mensagem..." required />
                  </div>
                  <Button type="submit" isLoading={acaoLoading === 'atendimento'}>
                    Enviar para atendimento
                  </Button>
                </form>
              </CardContent>
            </Card>
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <LifeBuoy className="text-[#851F32]" />
                  <h3 className="mt-3 text-lg font-black">Canais rápidos</h3>
                  <div className="mt-4 space-y-3 text-sm">
                    <a className="block rounded-xl border border-slate-200 p-3 font-bold text-[#851F32]" href="https://wa.me/5561994459086" target="_blank" rel="noreferrer">
                      WhatsApp da equipe
                    </a>
                    <a className="block rounded-xl border border-slate-200 p-3 font-bold text-[#851F32]" href="mailto:atendimento@excursaodascomitivas.com.br">
                      atendimento@excursaodascomitivas.com.br
                    </a>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-black">Solicitações recentes</h3>
                  <div className="mt-4 space-y-3">
                    {portal.historico
                      .filter((h: any) => String(h.tipo).startsWith('cliente_'))
                      .slice(0, 5)
                      .map((h: any) => (
                        <div key={h.id} className="rounded-xl bg-slate-50 p-3">
                          <p className="font-bold">{h.titulo}</p>
                          <p className="mt-1 text-xs text-slate-500">{data(h.criado_em, true)}</p>
                        </div>
                      ))}
                    {!portal.historico.some((h: any) => String(h.tipo).startsWith('cliente_')) && <p className="text-sm text-slate-500">Nenhuma solicitação registrada.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
