import { useEffect, useMemo, useState } from "react";
import {
  Armchair,
  Ban,
  BusFront,
  Download,
  MapPin,
  MoveRight,
  Plus,
  RefreshCw,
  Undo2,
  UserCheck,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@ui/index";
import { api } from "../../contexts/AuthContext";
import { AdminModal } from "../../components/admin/AdminModal";

type Evento = { id: string; nome: string };
type Lote = {
  id: string;
  evento_id: string;
  nome: string;
  data_embarque?: string | null;
  data_retorno?: string | null;
};
type Saida = {
  id: string;
  lote_id: string;
  nome: string;
  evento_nome: string;
  lote_nome: string;
  data_partida: string | null;
  data_retorno: string | null;
  status: string;
  ativa: boolean;
  total_onibus: number;
  capacidade_fisica: number;
  ocupadas: number;
  presentes: number;
  vagas_livres_fisicas: number;
  divergencia_capacidade: number;
};
type Assento = {
  id: string;
  onibus_id: string;
  numero: number;
  fileira: number;
  posicao: string;
  status: string;
  motivo_bloqueio?: string | null;
  em_hold: boolean;
  alocacao_id?: string | null;
  reserva_id?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  ponto_embarque_nome?: string | null;
};
type Mapa = {
  saida: Saida & { vagas_totais: number };
  onibus: any[];
  assentos: Assento[];
  pontos: any[];
  reservas_disponiveis: any[];
  resumo: {
    capacidade: number;
    ocupadas: number;
    livres: number;
    bloqueadas: number;
    em_hold: number;
    divergencia_lote: number;
  };
};

const inputClass = "admin-field";
const statusSaida: Record<string, string> = {
  planejamento: "Planejamento",
  confirmada: "Confirmada",
  em_viagem: "Em viagem",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

function dataParaInput(valor?: string | null) {
  if (!valor) return "";
  const data = new Date(valor);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function OperacaoOnibus() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [saidaId, setSaidaId] = useState("");
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [assentoSelecionado, setAssentoSelecionado] = useState<Assento | null>(
    null,
  );
  const [reservaId, setReservaId] = useState("");
  const [pontoId, setPontoId] = useState("");
  const [movendoAlocacao, setMovendoAlocacao] = useState<string | null>(null);
  const [modal, setModal] = useState<"saida" | "onibus" | "ponto" | null>(null);
  const [saidaForm, setSaidaForm] = useState({
    lote_id: "",
    nome: "",
    data_partida: "",
    data_retorno: "",
  });
  const [onibusForm, setOnibusForm] = useState({
    nome: "Transporte 1",
    capacidade: "44",
    identificacao: "",
    placa: "",
    motorista_nome: "",
    motorista_telefone: "",
    responsavel_nome: "",
  });
  const [pontoForm, setPontoForm] = useState({
    nome: "",
    endereco: "",
    horario: "",
  });

  const carregarMapa = async (id = saidaId) => {
    if (!id) {
      setMapa(null);
      return;
    }
    const resposta = await api.get(`/operacao/saidas/${id}/mapa`);
    setMapa(resposta.data);
    setAssentoSelecionado(null);
  };

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const [eventosResposta, saidasResposta] = await Promise.all([
        api.get("/eventos"),
        api.get("/operacao/saidas"),
      ]);
      const eventosLista: Evento[] = eventosResposta.data.eventos || [];
      const lotesRespostas = await Promise.all(
        eventosLista.map((evento) => api.get(`/lotes/evento/${evento.id}`)),
      );
      setEventos(eventosLista);
      setLotes(lotesRespostas.flatMap((resposta) => resposta.data.lotes || []));
      const lista: Saida[] = saidasResposta.data.saidas || [];
      setSaidas(lista);
      const selecionada = lista.some((item) => item.id === saidaId)
        ? saidaId
        : lista[0]?.id || "";
      setSaidaId(selecionada);
      if (selecionada) await carregarMapa(selecionada);
      else setMapa(null);
    } catch (error: any) {
      setErro(
        error.response?.data?.erro || "Não foi possível carregar a operação.",
      );
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const lotesComEvento = useMemo(
    () =>
      lotes.map((lote) => ({
        ...lote,
        evento_nome:
          eventos.find((evento) => evento.id === lote.evento_id)?.nome ||
          "Excursão",
      })),
    [lotes, eventos],
  );

  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    setSalvando(true);
    setErro("");
    setMensagem("");
    try {
      await acao();
      setMensagem(sucesso);
      await carregar();
      return true;
    } catch (error: any) {
      setErro(
        error.response?.data?.erro || "Não foi possível concluir a ação.",
      );
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const criarSaida = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro("");
    setMensagem("");
    try {
      const resposta = await api.post("/operacao/saidas", {
        ...saidaForm,
        data_partida: saidaForm.data_partida
          ? new Date(saidaForm.data_partida).toISOString()
          : null,
        data_retorno: saidaForm.data_retorno
          ? new Date(saidaForm.data_retorno).toISOString()
          : null,
      });
      const novaSaidaId = resposta.data.saida.id;
      setSaidaForm({
        lote_id: "",
        nome: "",
        data_partida: "",
        data_retorno: "",
      });
      const saidasResposta = await api.get("/operacao/saidas");
      setSaidas(saidasResposta.data.saidas || []);
      setSaidaId(novaSaidaId);
      await carregarMapa(novaSaidaId);
      setModal(null);
      setMensagem(
        "Saída operacional criada. Agora cadastre os transportes e pontos de embarque.",
      );
    } catch (error: any) {
      setErro(error.response?.data?.erro || "Não foi possível criar a saída.");
    } finally {
      setSalvando(false);
    }
  };

  const criarOnibus = async (event: React.FormEvent) => {
    event.preventDefault();
        if (!saidaId) return;
    if (await executar(
      () =>
        api.post(`/operacao/saidas/${saidaId}/onibus`, {
          ...onibusForm,
          capacidade: Number(onibusForm.capacidade),
        }),
      "Transporte e mapa de lugares criados.",
    )) setModal(null);
  };

  const criarPonto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!saidaId) return;
    if (await executar(async () => {
      await api.post(`/operacao/saidas/${saidaId}/pontos-embarque`, {
        ...pontoForm,
        horario: pontoForm.horario
          ? new Date(pontoForm.horario).toISOString()
          : null,
      });
      setPontoForm({ nome: "", endereco: "", horario: "" });
    }, "Ponto de embarque cadastrado.")) setModal(null);
  };

  const clicarAssento = (assento: Assento) => {
    if (
      movendoAlocacao &&
      !assento.alocacao_id &&
      assento.status === "disponivel" &&
      !assento.em_hold
    ) {
      void executar(
        () =>
          api.post(`/operacao/alocacoes/${movendoAlocacao}/mover`, {
            assento_id: assento.id,
            ponto_embarque_id: pontoId || undefined,
          }),
        "Passageiro movido para o novo lugar.",
      );
      setMovendoAlocacao(null);
      return;
    }
    setAssentoSelecionado(assento);
  };

  const baixarManifesto = async () => {
    if (!saidaId) return;
    try {
      const resposta = await api.get(`/operacao/saidas/${saidaId}/manifesto`, {
        params: { formato: "csv" },
        responseType: "blob",
      });
      const url = URL.createObjectURL(resposta.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `manifesto-${mapa?.saida.nome || saidaId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setErro(
        error.response?.data?.erro || "Não foi possível baixar o manifesto.",
      );
    }
  };

  const corAssento = (assento: Assento) =>
    assento.alocacao_id
      ? "border-[#DF6248] bg-[#fff0eb] text-[#b8442e]"
      : assento.status === "bloqueado"
        ? "border-slate-300 bg-slate-200 text-slate-500"
        : assento.em_hold
          ? "border-amber-500 bg-amber-50 text-amber-800"
          : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-[#DF6248] hover:text-[#DF6248]";

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Operação da excursão</p>
          <h1 className="admin-title">Transporte e lugares</h1>
          <p className="admin-subtitle">
            Controle veículos, capacidade física, passageiros, pontos de
            embarque e check-in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModal("saida")}>
            <Plus size={16} className="mr-2" />
            Nova saída
          </Button>
          <Button variant="outline" onClick={() => void carregar()}>
            <RefreshCw size={16} className="mr-2" />
            Atualizar
          </Button>
          {saidaId && (
            <Button variant="outline" onClick={() => void baixarManifesto()}>
              <Download size={16} className="mr-2" />
              Manifesto CSV
            </Button>
          )}
        </div>
      </div>
      {erro && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {erro}
        </div>
      )}
      {mensagem && (
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          {mensagem}
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Saída em operação
              </label>
              <select
                value={saidaId}
                onChange={(e) => {
                  setSaidaId(e.target.value);
                  void carregarMapa(e.target.value).catch((error) =>
                    setErro(
                      error.response?.data?.erro || "Erro ao carregar o mapa.",
                    ),
                  );
                }}
                className={inputClass}
              >
                <option value="">Nenhuma saída cadastrada</option>
                {saidas.map((saida) => (
                  <option key={saida.id} value={saida.id}>
                    {saida.evento_nome} · {saida.lote_nome} · {saida.nome}
                  </option>
                ))}
              </select>
            </div>
            {mapa && (
              <select
                aria-label="Situação da saída"
                value={mapa.saida.status}
                onChange={(e) =>
                  void executar(
                    () =>
                      api.patch(`/operacao/saidas/${saidaId}`, {
                        status: e.target.value,
                      }),
                    "Situação da saída atualizada.",
                  )
                }
                className={inputClass}
              >
                {Object.entries(statusSaida).map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      {carregando && (
        <p className="text-sm text-gray-500">Carregando operação...</p>
      )}
      {mapa && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Transportes", mapa.onibus.length],
              ["Capacidade física", mapa.resumo.capacidade],
              ["Ocupados", mapa.resumo.ocupadas],
              ["Livres", mapa.resumo.livres],
              ["Bloqueados", mapa.resumo.bloqueadas],
            ].map(([rotulo, valor]) => (
              <div key={String(rotulo)} className="admin-metric-card">
                <p className="text-[11px] font-bold uppercase tracking-[.08em] text-slate-500">
                  {rotulo}
                </p>
                <p className="mt-1 text-2xl font-black text-[#073F50]">
                  {valor}
                </p>
              </div>
            ))}
          </div>
          {mapa.resumo.divergencia_lote !== 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              A capacidade física ({mapa.resumo.capacidade}) difere das{" "}
              {mapa.saida.vagas_totais} vagas comerciais do lote. Revise antes
              de confirmar a viagem.
            </div>
          )}

          <section className="admin-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black text-[#073F50]">Estrutura da saída</h2>
              <p className="mt-1 text-sm text-slate-500">Cadastre os veículos e os locais de embarque somente quando necessário.</p>
              {mapa.pontos.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{mapa.pontos.map((ponto) => <span key={ponto.id} className="admin-status bg-slate-100 text-slate-600"><MapPin size={12} />{ponto.nome}</span>)}</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setModal("ponto")}><MapPin size={16} className="mr-2" />Novo ponto</Button>
              <Button type="button" onClick={() => setModal("onibus")}><BusFront size={16} className="mr-2" />Novo veículo</Button>
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Mapa de lugares</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <i className="h-3 w-3 rounded border border-emerald-300 bg-emerald-50" />
                  Livre
                </span>
                <span className="flex items-center gap-1">
                  <i className="h-3 w-3 rounded border border-[#DF6248] bg-[#fff0eb]" />
                  Ocupado
                </span>
                <span className="flex items-center gap-1">
                  <i className="h-3 w-3 rounded bg-slate-300" />
                  Bloqueado
                </span>
                <span className="flex items-center gap-1">
                  <i className="h-3 w-3 rounded bg-amber-100" />
                  Temporário
                </span>
                {movendoAlocacao && (
                  <span className="font-semibold text-[#DF6248]">
                    Clique em um lugar livre para concluir a mudança.
                  </span>
                )}
              </div>
              {mapa.onibus.map((onibus) => {
                const assentos = mapa.assentos.filter(
                  (assento) => assento.onibus_id === onibus.id,
                );
                return (
                  <section
                    key={onibus.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-black text-[#073F50]">
                          {onibus.nome}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {onibus.identificacao || "Sem prefixo"} ·{" "}
                          {onibus.placa || "placa não informada"} ·{" "}
                          {onibus.ocupadas}/{onibus.capacidade} ocupados
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={Number(onibus.ocupadas) > 0}
                        onClick={() =>
                          void executar(
                            () =>
                              api.patch(`/operacao/onibus/${onibus.id}`, {
                                ativo: false,
                              }),
                            "Transporte arquivado.",
                          )
                        }
                      >
                        Arquivar
                      </Button>
                    </div>
                    <div className="grid max-w-md grid-cols-4 gap-x-2 gap-y-2 rounded-2xl bg-[#f5f8f7] p-4 sm:gap-x-4">
                      {assentos.map((assento) => (
                        <button
                          type="button"
                          key={assento.id}
                          onClick={() => clicarAssento(assento)}
                          title={
                            assento.cliente_nome ||
                            assento.motivo_bloqueio ||
                            `Lugar ${assento.numero}`
                          }
                          className={`relative flex h-11 items-center justify-center rounded-lg border text-sm font-bold transition ${corAssento(assento)} ${assento.posicao === "C" ? "ml-4 sm:ml-7" : ""} ${assentoSelecionado?.id === assento.id ? "ring-2 ring-[#DF6248] ring-offset-2" : ""}`}
                        >
                          <Armchair size={15} className="mr-1" />
                          {assento.numero}
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
              {mapa.onibus.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-500">
                  Cadastre o primeiro transporte para gerar automaticamente os
                  lugares.
                </p>
              )}
            </CardContent>
          </Card>

          {assentoSelecionado && (
            <Card>
              <CardHeader>
                <CardTitle>Lugar {assentoSelecionado.numero}</CardTitle>
              </CardHeader>
              <CardContent>
                {assentoSelecionado.alocacao_id ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="mr-auto">
                      <p className="font-semibold">
                        {assentoSelecionado.cliente_nome}
                      </p>
                      <p className="text-sm text-gray-500">
                        {assentoSelecionado.cliente_telefone ||
                          "Telefone não informado"}{" "}
                        ·{" "}
                        {assentoSelecionado.ponto_embarque_nome ||
                          "Ponto não definido"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMovendoAlocacao(assentoSelecionado.alocacao_id!);
                        setAssentoSelecionado(null);
                      }}
                    >
                      <MoveRight size={16} className="mr-2" />
                      Mover
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void executar(
                          () =>
                            api.patch(
                              `/operacao/saidas/${saidaId}/checkins/${assentoSelecionado.reserva_id}`,
                              { status: "presente" },
                            ),
                          "Embarque confirmado.",
                        )
                      }
                    >
                      <UserCheck size={16} className="mr-2" />
                      Confirmar embarque
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (
                          confirm(
                            "Liberar este lugar mantendo a reserva e o histórico?",
                          )
                        )
                          void executar(
                            () =>
                              api.delete(
                                `/operacao/alocacoes/${assentoSelecionado.alocacao_id}`,
                                {
                                  data: {
                                    motivo: "Liberação pelo mapa operacional",
                                  },
                                },
                              ),
                            "Lugar liberado.",
                          );
                      }}
                    >
                      <Undo2 size={16} className="mr-2" />
                      Liberar
                    </Button>
                  </div>
                ) : assentoSelecionado.status === "bloqueado" ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-600">
                      {assentoSelecionado.motivo_bloqueio}
                    </p>
                    <Button
                      onClick={() =>
                        void executar(
                          () =>
                            api.patch(
                              `/operacao/assentos/${assentoSelecionado.id}/bloqueio`,
                              { bloqueado: false },
                            ),
                          "Lugar desbloqueado.",
                        )
                      }
                    >
                      Desbloquear
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Reserva / passageiro
                      </label>
                      <select
                        value={reservaId}
                        onChange={(e) => setReservaId(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Selecione</option>
                        {mapa.reservas_disponiveis.map((reserva) => (
                          <option key={reserva.id} value={reserva.id}>
                            {reserva.cliente_nome} ·{" "}
                            {reserva.pacote_nome || reserva.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Ponto de embarque
                      </label>
                      <select
                        value={pontoId}
                        onChange={(e) => setPontoId(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Definir depois</option>
                        {mapa.pontos.map((ponto) => (
                          <option key={ponto.id} value={ponto.id}>
                            {ponto.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      disabled={!reservaId || salvando}
                      onClick={() =>
                        void executar(
                          () =>
                            api.post(
                              `/operacao/assentos/${assentoSelecionado.id}/alocar`,
                              {
                                reserva_id: reservaId,
                                ponto_embarque_id: pontoId || null,
                              },
                            ),
                          "Passageiro alocado no lugar.",
                        )
                      }
                    >
                      Alocar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const motivo = prompt("Motivo do bloqueio:");
                        if (motivo !== null)
                          void executar(
                            () =>
                              api.patch(
                                `/operacao/assentos/${assentoSelecionado.id}/bloqueio`,
                                { bloqueado: true, motivo },
                              ),
                            "Lugar bloqueado.",
                          );
                      }}
                    >
                      <Ban size={16} className="mr-2" />
                      Bloquear
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <AdminModal aberto={modal === "saida"} titulo="Nova saída operacional" descricao="Vincule a operação a uma viagem e lote já cadastrados." fechar={() => setModal(null)} largura="ampla">
        <form onSubmit={criarSaida} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium">Viagem e lote</label><select required value={saidaForm.lote_id} onChange={(e) => { const lote = lotesComEvento.find((item) => item.id === e.target.value); setSaidaForm({ lote_id: e.target.value, nome: lote ? `${lote.evento_nome} — ${lote.nome}` : "", data_partida: dataParaInput(lote?.data_embarque), data_retorno: dataParaInput(lote?.data_retorno) }); }} className={inputClass}><option value="">Selecione</option>{lotesComEvento.map((lote) => <option key={lote.id} value={lote.id}>{lote.evento_nome} · {lote.nome}</option>)}</select></div>
          <div className="md:col-span-2"><Input required label="Nome da saída" value={saidaForm.nome} onChange={(e) => setSaidaForm({ ...saidaForm, nome: e.target.value })} /></div>
          <Input label="Partida" type="datetime-local" value={saidaForm.data_partida} onChange={(e) => setSaidaForm({ ...saidaForm, data_partida: e.target.value })} />
          <Input label="Retorno" type="datetime-local" value={saidaForm.data_retorno} onChange={(e) => setSaidaForm({ ...saidaForm, data_retorno: e.target.value })} />
          <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? "Criando..." : "Criar saída"}</Button></div>
        </form>
      </AdminModal>

      <AdminModal aberto={modal === "onibus"} titulo="Novo veículo" descricao="A capacidade informada gera automaticamente o mapa de lugares." fechar={() => setModal(null)} largura="ampla">
        <form onSubmit={criarOnibus} className="grid gap-4 sm:grid-cols-2">
          <Input required label="Nome / identificação" value={onibusForm.nome} onChange={(e) => setOnibusForm({ ...onibusForm, nome: e.target.value })} />
          <Input required label="Quantidade de lugares" type="number" min={1} max={100} value={onibusForm.capacidade} onChange={(e) => setOnibusForm({ ...onibusForm, capacidade: e.target.value })} />
          <Input label="Prefixo / referência" value={onibusForm.identificacao} onChange={(e) => setOnibusForm({ ...onibusForm, identificacao: e.target.value })} />
          <Input label="Placa, quando aplicável" value={onibusForm.placa} onChange={(e) => setOnibusForm({ ...onibusForm, placa: e.target.value })} />
          <Input label="Motorista / condutor" value={onibusForm.motorista_nome} onChange={(e) => setOnibusForm({ ...onibusForm, motorista_nome: e.target.value })} />
          <Input label="Telefone do condutor" value={onibusForm.motorista_telefone} onChange={(e) => setOnibusForm({ ...onibusForm, motorista_telefone: e.target.value })} />
          <div className="sm:col-span-2"><Input label="Responsável pelo transporte" value={onibusForm.responsavel_nome} onChange={(e) => setOnibusForm({ ...onibusForm, responsavel_nome: e.target.value })} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? "Criando..." : "Criar mapa"}</Button></div>
        </form>
      </AdminModal>

      <AdminModal aberto={modal === "ponto"} titulo="Novo ponto de embarque" descricao="Defina o local e o horário vinculados a esta saída." fechar={() => setModal(null)}>
        <form onSubmit={criarPonto} className="space-y-4">
          <Input required label="Nome do ponto" value={pontoForm.nome} onChange={(e) => setPontoForm({ ...pontoForm, nome: e.target.value })} />
          <Input label="Endereço" value={pontoForm.endereco} onChange={(e) => setPontoForm({ ...pontoForm, endereco: e.target.value })} />
          <Input label="Horário" type="datetime-local" value={pontoForm.horario} onChange={(e) => setPontoForm({ ...pontoForm, horario: e.target.value })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Adicionar ponto"}</Button></div>
        </form>
      </AdminModal>
    </div>
  );
}
