import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@ui/index';
import { Link as LinkIcon, Copy, UserCheck } from 'lucide-react';
import { api } from '../../contexts/AuthContext';

export default function Jornada() {
  const [link, setLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const gerarLink = async () => {
    setIsLoading(true);
    try {
      const response = await api.post('/jornada/gerar-link', { evento_id: 'lote-123' });
      setLink(response.data.url_rastreio);
    } catch (err) {
      // Mock para teste
      setLink('http://localhost:5173/?ref=vend-123-abc');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Jornada do Cliente & CRM</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon size={20} className="text-primary" />
              Link de Vendedor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">Gere um link exclusivo para rastrear os clientes que vieram por sua indicação.</p>
            
            {link ? (
              <div className="space-y-2">
                <Input value={link} readOnly />
                <Button variant="outline" className="w-full flex items-center justify-center gap-2" onClick={() => navigator.clipboard.writeText(link)}>
                  <Copy size={16} /> Copiar Link
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={gerarLink} isLoading={isLoading}>Gerar Meu Link</Button>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Funil de Vendas (Kanban)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {/* Coluna 1 */}
              <div className="flex-1 min-w-[250px] bg-gray-50 rounded-lg p-3">
                <h3 className="font-semibold text-gray-700 mb-3 flex justify-between">
                  <span>Cadastrados</span>
                  <span className="bg-gray-200 text-gray-700 px-2 rounded-full text-xs py-0.5">1</span>
                </h3>
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded shadow-sm border border-gray-200">
                    <p className="font-medium text-sm">João Silva</p>
                    <p className="text-xs text-gray-500 mt-1">Origem: Instagram</p>
                    <p className="text-xs text-gray-400 mt-2">Há 2 dias</p>
                  </div>
                </div>
              </div>

              {/* Coluna 2 */}
              <div className="flex-1 min-w-[250px] bg-yellow-50 rounded-lg p-3">
                <h3 className="font-semibold text-yellow-800 mb-3 flex justify-between">
                  <span>Aguardando Pagto</span>
                  <span className="bg-yellow-200 text-yellow-800 px-2 rounded-full text-xs py-0.5">1</span>
                </h3>
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded shadow-sm border border-yellow-200">
                    <p className="font-medium text-sm">Maria Oliveira</p>
                    <p className="text-xs text-gray-500 mt-1">R$ 1.850,00 (Pix)</p>
                    <p className="text-xs text-red-500 mt-2 font-medium">Vence em 2h</p>
                  </div>
                </div>
              </div>

              {/* Coluna 3 */}
              <div className="flex-1 min-w-[250px] bg-green-50 rounded-lg p-3">
                <h3 className="font-semibold text-green-800 mb-3 flex justify-between">
                  <span>Confirmados</span>
                  <span className="bg-green-200 text-green-800 px-2 rounded-full text-xs py-0.5">2</span>
                </h3>
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded shadow-sm border border-green-200 flex items-start gap-2">
                    <UserCheck size={16} className="text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Pedro Santos</p>
                      <p className="text-xs text-gray-500 mt-1">R$ 2.500,00</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
