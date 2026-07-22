import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@ui/index';
import { Plus } from 'lucide-react';

export default function Cupons() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Cupons de Desconto</h1>
        <Button className="flex items-center gap-2">
          <Plus size={16} /> Novo Cupom
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Código</th>
                  <th className="px-6 py-4 font-medium">Desconto</th>
                  <th className="px-6 py-4 font-medium">Uso</th>
                  <th className="px-6 py-4 font-medium">Validade</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-bold text-gray-900">BARR2026</td>
                  <td className="px-6 py-4">10%</td>
                  <td className="px-6 py-4">5 / 100</td>
                  <td className="px-6 py-4">30/08/2026</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Ativo</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
