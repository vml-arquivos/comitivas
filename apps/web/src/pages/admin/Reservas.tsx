import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@ui/index';
import { Download, Eye, Mail } from 'lucide-react';

export default function Reservas() {
  const [reservas, setReservas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Gestão de Reservas</h1>
        <Button onClick={handleExport} variant="outline" className="flex items-center gap-2">
          <Download size={16} /> Exportar CSV
        </Button>
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
                      <button className="text-gray-500 hover:text-primary transition-colors p-1" title="Visualizar">
                        <Eye size={18} />
                      </button>
                      <button className="text-gray-500 hover:text-primary transition-colors p-1" title="Reenviar E-mail">
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
