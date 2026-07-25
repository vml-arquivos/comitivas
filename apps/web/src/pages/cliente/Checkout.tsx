import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { AlertCircle, CreditCard, FileText, Landmark, QrCode, Snowflake, Tent, Wind } from 'lucide-react';

type MetodoPagamento = 'pix' | 'boleto' | 'credito';

const MODALIDADES: Record<string, { titulo: string; descricao: string; Icone: typeof Tent }> = {
  camping: {
    titulo: 'Camping',
    descricao: 'Estrutura de camping da excursão',
    Icone: Tent,
  },
  quarto_ventilador: {
    titulo: 'Quarto com ventilador',
    descricao: 'Hospedagem em quarto compartilhado com ventilador',
    Icone: Wind,
  },
  quarto_ar_condicionado: {
    titulo: 'Quarto com ar-condicionado',
    descricao: 'Hospedagem em quarto compartilhado climatizado',
    Icone: Snowflake,
  },
};

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(valor) ? valor : 0);
}

function formatarData(valor?: string | null) {
  if (!valor) return 'Não informado';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(data);
}

export default function Checkout() {
  const { reservaId } = useParams();
  const navigate = useNavigate();

  const [reserva, setReserva] = useState<any>(null);
  const [contratoAceito, setContratoAceito] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>('pix');
  const [quantidadeParcelas, setQuantidadeParcelas] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchReserva = async () => {
      try {
        const response = await api.get(`/pacotes/reservas/${reservaId}`);
        setReserva(response.data);
        if (['pix', 'boleto', 'credito'].includes(response.data.forma_pagamento)) {
          setMetodoPagamento(response.data.forma_pagamento as MetodoPagamento);
          setQuantidadeParcelas(Number(response.data.quantidade_parcelas) || 1);
        }
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar reserva. Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReserva();
  }, [reservaId]);

  useEffect(() => {
    if (metodoPagamento === 'pix') {
      setQuantidadeParcelas(1);
    } else if (metodoPagamento === 'boleto') {
      setQuantidadeParcelas((atual) => Math.min(Math.max(atual, 1), 2));
    }
  }, [metodoPagamento]);

  const resumoPagamento = useMemo(() => {
    const valorRegistrado = Number(reserva?.valor_total ?? 0);
    const descontoRegistrado = Number(reserva?.desconto_pagamento ?? 0);
    const condicaoJaRegistrada = Boolean(reserva?.forma_pagamento);
    const valorAntesDaCondicao = condicaoJaRegistrada ? valorRegistrado + descontoRegistrado : valorRegistrado;
    const descontoPix = condicaoJaRegistrada
      ? descontoRegistrado
      : metodoPagamento === 'pix' ? valorAntesDaCondicao * 0.05 : 0;
    const valorTotal = condicaoJaRegistrada ? valorRegistrado : valorAntesDaCondicao - descontoPix;
    const quantidade = condicaoJaRegistrada
      ? Number(reserva?.quantidade_parcelas) || 1
      : metodoPagamento === 'pix' ? 1 : quantidadeParcelas;

    const valorParcela = Math.round((valorTotal / quantidade) * 100) / 100;
    const valorUltimaParcela = Math.round((valorTotal - valorParcela * (quantidade - 1)) * 100) / 100;
    const descricaoParcelamento = quantidade <= 1
      ? `1x de ${formatarMoeda(valorTotal)}`
      : Math.abs(valorUltimaParcela - valorParcela) < 0.001
        ? `${quantidade}x de ${formatarMoeda(valorParcela)}`
        : `${quantidade - 1}x de ${formatarMoeda(valorParcela)} + 1x de ${formatarMoeda(valorUltimaParcela)}`;

    return {
      valorAntesDaCondicao,
      descontoPix,
      valorTotal,
      quantidade,
      valorParcela,
      valorUltimaParcela,
      descricaoParcelamento,
    };
  }, [reserva?.valor_total, metodoPagamento, quantidadeParcelas]);

  const handleFinalizar = async () => {
    const contratoJaEmitido = ['contrato_gerado', 'aguardando_pagamento', 'cliente_confirmado'].includes(reserva?.status);
    if (!contratoJaEmitido && !contratoAceito) {
      setError('Você precisa aceitar os termos do contrato para continuar.');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      if (!contratoJaEmitido) {
        // A condição de pagamento é persistida antes da emissão do PDF, para
        // que o contrato seja o registro fiel da escolha feita.
        await api.post(`/contratos/aceitar/${reservaId}`, {
          metodo_pagamento: metodoPagamento,
          quantidade_parcelas: resumoPagamento.quantidade,
        });
      }

      const response = await api.post('/pagamentos/criar', {
        reserva_id: reservaId,
        metodo: metodoPagamento,
      });

      navigate(`/confirmacao/${reservaId}`, {
        state: { pagamentoData: response.data },
      });
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao processar checkout. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center">Carregando detalhes da reserva...</div>;

  const modalidade = reserva?.modalidade_hospedagem ? MODALIDADES[reserva.modalidade_hospedagem] : null;
  const IconeModalidade = modalidade?.Icone;
  const contratante = reserva?.contratante;
  const dadosIncompletos = contratante
    ? ['cpf', 'rg', 'data_nascimento', 'estado_civil', 'profissao', 'endereco', 'telefone']
      .filter((campo) => !contratante[campo])
    : [];
  const contratoEmitido = ['contrato_gerado', 'aguardando_pagamento', 'cliente_confirmado'].includes(reserva?.status);
  const pagamentoEmAndamento = ['aguardando_pagamento', 'cliente_confirmado'].includes(reserva?.status);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="text-center space-y-2">
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-primary">Excursão das Comitivas</p>
        <h1 className="text-3xl font-bold text-secondary">Finalizar Reserva</h1>
        <p className="text-gray-600">Revise seus dados, escolha a condição e assine seu contrato digital.</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 flex items-start gap-3">
          <AlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={20} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <Card className="overflow-hidden border-primary/15">
        <CardHeader className="bg-gradient-to-r from-red-950 to-primary text-white border-0">
          <CardTitle className="flex items-center gap-2">
            <FileText size={20} />
            Resumo da reserva
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {modalidade ? (
            <div className="flex items-center gap-4 rounded-xl border border-red-100 bg-red-50/40 p-4">
              {IconeModalidade && <IconeModalidade size={34} className="text-primary flex-shrink-0" />}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Modalidade de hospedagem selecionada</p>
                <p className="font-bold text-secondary text-lg">{modalidade.titulo}</p>
                <p className="text-sm text-gray-600">{reserva?.pacote_nome || modalidade.descricao}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              A modalidade de hospedagem não foi localizada nesta reserva. Revise a configuração do pacote antes de prosseguir.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center gap-2">
            <FileText size={20} className="text-primary" />
            Dados que constarão no contrato
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {contratante ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div><dt className="text-gray-500">Nome completo</dt><dd className="font-semibold text-gray-900">{contratante.nome || 'Não informado'}</dd></div>
              <div><dt className="text-gray-500">CPF / RG</dt><dd className="font-semibold text-gray-900">{contratante.cpf || 'Não informado'} {contratante.rg ? `• ${contratante.rg}` : ''}</dd></div>
              <div><dt className="text-gray-500">Data de nascimento</dt><dd className="font-semibold text-gray-900">{formatarData(contratante.data_nascimento)}</dd></div>
              <div><dt className="text-gray-500">Nacionalidade / estado civil</dt><dd className="font-semibold text-gray-900">{contratante.nacionalidade || 'Brasileira'} • {contratante.estado_civil || 'Não informado'}</dd></div>
              <div><dt className="text-gray-500">Profissão</dt><dd className="font-semibold text-gray-900">{contratante.profissao || 'Não informado'}</dd></div>
              <div><dt className="text-gray-500">Telefone</dt><dd className="font-semibold text-gray-900">{contratante.telefone || 'Não informado'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-gray-500">Endereço</dt><dd className="font-semibold text-gray-900">{contratante.endereco || 'Não informado'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-gray-500">E-mail</dt><dd className="font-semibold text-gray-900">{contratante.email || 'Não informado'}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-gray-600">Não foi possível carregar os dados contratuais da reserva.</p>
          )}
          {dadosIncompletos.length > 0 && (
            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Seu contrato ficará mais completo com os dados que faltam.</p>
                <p className="mt-1 text-xs">Você pode preencher agora ou continuar; campos não informados aparecerão como “________”.</p>
              </div>
              <Link to={`/meus-dados?redirect=${encodeURIComponent(`/checkout/${reservaId}`)}`} className="shrink-0 rounded-lg bg-amber-900 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-amber-800">
                Completar dados
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle>Forma de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setMetodoPagamento('pix')}
              disabled={contratoEmitido}
              className={`p-4 border rounded-xl flex flex-col items-center justify-center gap-2 transition-all text-center disabled:cursor-not-allowed disabled:opacity-60 ${
                metodoPagamento === 'pix' ? 'border-primary ring-2 ring-primary/20 bg-red-50/50' : 'hover:border-gray-300'
              }`}
            >
              <QrCode size={30} className={metodoPagamento === 'pix' ? 'text-primary' : 'text-gray-400'} />
              <span className="font-semibold">PIX</span>
              <span className="text-xs text-green-700 font-medium">5% de desconto à vista</span>
            </button>

            <button
              type="button"
              onClick={() => setMetodoPagamento('boleto')}
              disabled={contratoEmitido}
              className={`p-4 border rounded-xl flex flex-col items-center justify-center gap-2 transition-all text-center disabled:cursor-not-allowed disabled:opacity-60 ${
                metodoPagamento === 'boleto' ? 'border-primary ring-2 ring-primary/20 bg-red-50/50' : 'hover:border-gray-300'
              }`}
            >
              <Landmark size={30} className={metodoPagamento === 'boleto' ? 'text-primary' : 'text-gray-400'} />
              <span className="font-semibold">Boleto bancário</span>
              <span className="text-xs text-gray-500">Até 2x sem juros</span>
            </button>

            <button
              type="button"
              onClick={() => setMetodoPagamento('credito')}
              disabled={contratoEmitido}
              className={`p-4 border rounded-xl flex flex-col items-center justify-center gap-2 transition-all text-center disabled:cursor-not-allowed disabled:opacity-60 ${
                metodoPagamento === 'credito' ? 'border-primary ring-2 ring-primary/20 bg-red-50/50' : 'hover:border-gray-300'
              }`}
            >
              <CreditCard size={30} className={metodoPagamento === 'credito' ? 'text-primary' : 'text-gray-400'} />
              <span className="font-semibold">Cartão de crédito</span>
              <span className="text-xs text-gray-500">Em até 12x, taxas do dia</span>
            </button>
          </div>

          {metodoPagamento !== 'pix' && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div>
                <p className="font-semibold text-secondary">Quantidade de parcelas</p>
                <p className="text-sm text-gray-600">A condição selecionada será registrada no contrato.</p>
              </div>
              <select
                value={resumoPagamento.quantidade}
                disabled={contratoEmitido}
                onChange={(event) => setQuantidadeParcelas(Number(event.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {Array.from({ length: metodoPagamento === 'boleto' ? 2 : 12 }, (_, index) => index + 1).map((parcela) => (
                  <option key={parcela} value={parcela}>{(() => {
                    const valorParcela = Math.round((resumoPagamento.valorTotal / parcela) * 100) / 100;
                    const ultimaParcela = Math.round((resumoPagamento.valorTotal - valorParcela * (parcela - 1)) * 100) / 100;
                    return parcela === 1 || Math.abs(valorParcela - ultimaParcela) < 0.001
                      ? `${parcela}x de ${formatarMoeda(valorParcela)}`
                      : `${parcela - 1}x de ${formatarMoeda(valorParcela)} + 1x de ${formatarMoeda(ultimaParcela)}`;
                  })()}</option>
                ))}
              </select>
            </div>
          )}

          {contratoEmitido && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Esta reserva já possui contrato emitido. A condição de pagamento abaixo está bloqueada para preservar o documento aceito.
            </div>
          )}

          <div className="rounded-xl border border-red-100 bg-red-50/30 p-5 space-y-2">
            <div className="flex justify-between gap-4 text-sm text-gray-600"><span>{reserva?.forma_pagamento === 'pix' ? 'Valor antes do desconto PIX' : 'Valor da reserva'}</span><span>{formatarMoeda(resumoPagamento.valorAntesDaCondicao)}</span></div>
            {resumoPagamento.descontoPix > 0 && <div className="flex justify-between gap-4 text-sm text-green-700"><span>Desconto PIX (5%)</span><span>-{formatarMoeda(resumoPagamento.descontoPix)}</span></div>}
            {resumoPagamento.quantidade > 1 && <div className="flex justify-between gap-4 text-sm text-gray-600"><span>{resumoPagamento.quantidade} parcelas</span><span className="text-right">{resumoPagamento.descricaoParcelamento}</span></div>}
            <div className="flex justify-between gap-4 border-t border-red-100 pt-3 text-lg font-bold text-secondary"><span>Total contratado</span><span>{formatarMoeda(resumoPagamento.valorTotal)}</span></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center gap-2"><FileText size={20} className="text-primary" />Contrato e aceite digital</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="bg-gray-50 p-4 rounded-lg max-h-44 overflow-y-auto text-sm text-gray-700 border border-gray-200 leading-relaxed">
            <h2 className="font-bold text-secondary mb-2">Termos essenciais da contratação</h2>
            <p className="mb-2">O contrato registra a modalidade de hospedagem, os serviços selecionados, o valor total, a condição de pagamento e os dados cadastrais informados pelo contratante.</p>
            <p className="mb-2">O passageiro deve apresentar documento de identificação no embarque e observar as regras de convivência e os horários definidos pela organização.</p>
            <p>O aceite eletrônico registra data, hora e endereço IP, integrando o contrato que ficará disponível para download após a emissão.</p>
          </div>

          {contratoEmitido ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <strong className="block">Contrato já emitido e preservado</strong>
              Você pode retomar a etapa de pagamento sem gerar ou assinar outro documento.
            </div>
          ) : (
            <label className="flex items-start gap-3 cursor-pointer p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                checked={contratoAceito}
                onChange={(event) => setContratoAceito(event.target.checked)}
              />
              <span className="text-sm text-gray-700"><strong className="block text-gray-900">Li e aceito os termos do contrato</strong>Ao confirmar, reconheço a assinatura digital e a condição de pagamento selecionada acima.</span>
            </label>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row justify-between gap-4 items-center pt-2">
        <div className="text-center sm:text-left">
          <p className="text-sm text-gray-500">Total a pagar</p>
          <p className="text-3xl font-bold text-secondary">{formatarMoeda(resumoPagamento.valorTotal)}</p>
        </div>
        {pagamentoEmAndamento ? (
          <Link to={`/confirmacao/${reservaId}`} className="w-full sm:w-auto">
            <Button size="lg" className="w-full px-8">Acompanhar pagamento</Button>
          </Link>
        ) : (
          <Button
            size="lg"
            onClick={handleFinalizar}
            isLoading={isProcessing}
            disabled={(!contratoEmitido && !contratoAceito) || !reserva || !modalidade}
            className="px-8 w-full sm:w-auto"
          >
            {contratoEmitido ? 'Retomar pagamento' : 'Gerar contrato e continuar'}
          </Button>
        )}
      </div>
    </div>
  );
}
