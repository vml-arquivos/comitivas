import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@ui/index';
import { Download, Eye, Mail, FileSignature, X } from 'lucide-react';

export default function Reservas() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);

  const [gerandoContratoId, setGerandoContratoId] = useState<string | null>(null);
  const [formaPagamentoContrato, setFormaPagamentoContrato] = useState<'pix' | 'boleto' | 'credito'>('pix');
  const [parcelasContrato, setParcelasContrato] = useState('1');
  const [salvandoContrato, setSalvandoContrato] = useState(false);
  const [erroContrato, setErroContrato] = useState<string | null>(null);

  const fetchReservas = async () => {
    try {
      const response = await api.get('/admin/reservas');
      setReservas(response.data.reservas || []);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao carregar reservas. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReservas();
  }, []);

  const handleExport = async () => {
    try {
      const response = await api.get('/admin/exportar/reservas/all', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'reservas.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Erro ao exportar CSV');
    }
  };

  const handleVerContrato = async (reservaId: string) => {
    try {
      const response = await api.get(`/contratos/download/${reservaId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (err: any) {
      alert(err.response?.data?.erro || 'Contrato ainda não disponível para esta reserva.');
    }
  };

  const handleReenviarContrato = async (reservaId: string) => {
    setAcaoMsg(null);
    try {
      await api.post(`/admin/reenviar-contrato/${reservaId}`);
      setAcaoMsg('Contrato reenviado com sucesso.');
    } catch (err: any) {
      setAcaoMsg(err.response?.data?.erro || 'Erro ao reenviar contrato.');
    }
  };

  const abrirGerarContrato = (reserva: any) => {
    setGerandoContratoId(reserva.id);
    setFormaPagamentoContrato((reserva.forma_pagamento as any) || 'pix');
    setParcelasContrato(String(reserva.quantidade_parcelas || 1));
    setErroContrato(null);
  };

  const fecharGerarContrato = () => {
    setGerandoContratoId(null);
    setErroContrato(null);
  };

  const handleGerarContrato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gerandoContratoId) return;
    setErroContrato(null);
    setSalvandoContrato(true);
    try {
      await api.post(`/admin/contratos/gerar/${gerandoContratoId}`, {
        metodo_pagamento: formaPagamentoContrato,
        quantidade_parcelas: parseInt(parcelasContrato, 10) || 1,
      });
      setAcaoMsg('Contrato gerado com sucesso.');
      setGerandoContratoId(null);
      fetchReservas();
    } catch (err: any) {
      setErroContrato(err.response?.data?.erro || 'Erro ao gerar contrato.');
    } finally {
      setSalvandoContrato(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Gestão de Reservas</h1>
        <Button onClick={handleExport} variant="outline" className="flex items-center gap-2">
          <Download size={16} /> Exportar CSV
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
      )}

      {acaoMsg && (
        <div className="bg-blue-50 text-blue-700 p-4 rounded-lg">{acaoMsg}</div>
      )}

      {gerandoContratoId && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleGerarContrato} className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-gray-900">
                  Gerar contrato — reserva {gerandoContratoId.substring(0, 8)}
                </h2>
                <button type="button" onClick={fecharGerarContrato} className="text-gray-500 hover:text-gray-700">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-gray-600">
                Use esta opção quando a venda foi fechada diretamente (WhatsApp, telefone etc.) e o
                cliente ainda não passou pelo aceite do contrato no checkout. O PDF é gerado com a
                condição de pagamento informada abaixo, ficando disponível para download e reenvio.
                Para boleto, o número máximo de parcelas é calculado automaticamente pela proximidade
                da data da viagem — se o valor escolhido exceder o permitido, o sistema informa o
                máximo disponível nesta data.
              </p>
              {erroContrato && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{erroContrato}</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Forma de pagamento</label>
                  <select
                    value={formaPagamentoContrato}
                    onChange={(e) => setFormaPagamentoContrato(e.target.value as any)}
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="pix">PIX à vista</option>
                    <option value="boleto">Boleto (parcelas conforme proximidade da viagem)</option>
                    <option value="credito">Cartão de crédito (até 10x)</option>
                  </select>
                </div>
                <Input
                  label="Quantidade de parcelas"
                  type="number"
                  min={1}
                  max={formaPagamentoContrato === 'boleto' ? 6 : formaPagamentoContrato === 'credito' ? 10 : 1}
                  disabled={formaPagamentoContrato === 'pix'}
                  value={formaPagamentoContrato === 'pix' ? '1' : parcelasContrato}
                  onChange={(e) => setParcelasContrato(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={salvandoContrato}>
                  {salvandoContrato ? 'Gerando...' : 'Gerar contrato'}
                </Button>
                <Button type="button" variant="outline" onClick={fecharGerarContrato}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">ID</th>
                  <th className="px-6 py-4 font-medium">Data</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Valor</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reservas.map((reserva) => (
                  <tr key={reserva.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{reserva.id.substring(0, 8)}</td>
                    <td className="px-6 py-4">{new Date(reserva.criado_em).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        reserva.status === 'cliente_confirmado' ? 'bg-green-100 text-green-800' : 
                        reserva.status === 'aguardando_pagamento' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {reserva.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">R$ {reserva.valor_total}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {!reserva.contrato_pdf_url && (
                        <button
                          onClick={() => abrirGerarContrato(reserva)}
                          className="text-gray-500 hover:text-primary transition-colors p-1"
                          title="Gerar contrato manualmente"
                        >
                          <FileSignature size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => handleVerContrato(reserva.id)}
                        className="text-gray-500 hover:text-primary transition-colors p-1"
                        title="Ver/baixar contrato"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleReenviarContrato(reserva.id)}
                        className="text-gray-500 hover:text-primary transition-colors p-1"
                        title="Reenviar E-mail"
                      >
                        <Mail size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {reservas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Nenhuma reserva encontrada</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

