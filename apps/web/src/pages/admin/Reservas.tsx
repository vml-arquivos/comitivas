import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@ui/index';
import { Download, Eye, Mail, FileSignature } from 'lucide-react';

export default function Reservas() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const navigate = useNavigate();

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
    navigate(`/admin/contratos?reserva=${encodeURIComponent(reserva.id)}`);
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

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        A geração de contrato agora é feita exclusivamente no <button type="button" className="font-semibold underline" onClick={() => navigate('/admin/contratos')}>Editor de contrato padrão</button>, que permite revisar os campos editáveis do modelo anexado antes de congelar a versão.
      </div>

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

