import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/index';
import { UserPlus, Users, Ticket, Calendar, DollarSign, Clock3, FileText } from 'lucide-react';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get('/admin/dashboard');
        setData(response.data.resumo);
      } catch (err: any) {
        setError(err.response?.data?.erro || 'Erro ao carregar dashboard. Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) return <div>Carregando dashboard...</div>;

  const stats = [
    { title: 'Total de Eventos', value: data?.total_eventos || 0, icon: Calendar, color: 'text-blue-500' },
    { title: 'Clientes cadastrados', value: data?.total_clientes || 0, icon: UserPlus, color: 'text-sky-600' },
    { title: 'Contatos no CRM', value: data?.total_leads_crm || 0, icon: Users, color: 'text-rose-600' },
    { title: 'Cadastros sem reserva', value: data?.cadastros_sem_reserva || 0, icon: Clock3, color: 'text-amber-600' },
    { title: 'Total de Reservas', value: data?.total_reservas || 0, icon: Ticket, color: 'text-purple-500' },
    { title: 'Contratos Gerados', value: data?.contratos_gerados || 0, icon: FileText, color: 'text-indigo-600' },
    { title: 'Reservas Confirmadas', value: data?.reservas_confirmadas || 0, icon: Users, color: 'text-green-500' },
    { title: 'Taxa de Conversão', value: `${data?.taxa_conversao || 0}%`, icon: DollarSign, color: 'text-primary' },
  ];
  const totalReservas = Number(data?.total_reservas || 0);
  const percentualConfirmadas = totalReservas > 0 ? (Number(data?.reservas_confirmadas || 0) / totalReservas) * 100 : 0;
  const percentualPendentes = totalReservas > 0 ? (Number(data?.reservas_pendentes || 0) / totalReservas) * 100 : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Visão Geral</h1>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`p-3 rounded-full bg-gray-100 ${stat.color}`}>
                  <Icon size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                  <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Status das Reservas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Confirmadas</span>
                <span className="font-bold text-green-600">{data?.reservas_confirmadas || 0}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: `${percentualConfirmadas}%` }}></div>
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <span className="text-gray-600">Pendentes</span>
                <span className="font-bold text-yellow-600">{data?.reservas_pendentes || 0}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${percentualPendentes}%` }}></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
