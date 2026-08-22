import React, { useEffect, useState } from 'react';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@ui/index';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

const GATEWAY_LABEL: Record<string, string> = {
  cora: 'Banco Cora',
};

export default function Configuracoes() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [pixDesconto, setPixDesconto] = useState('5');
  const [creditoMax, setCreditoMax] = useState('10');
  const [boletoMesesMax, setBoletoMesesMax] = useState('20');
  const [gateway, setGateway] = useState<{ ativo: string; configurado: boolean; nome?: string; ambiente?: string; metodos?: string[] } | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const response = await api.get('/admin/configuracoes/pagamento');
      const c = response.data.configuracoes;
      setPixDesconto(String(c.pix_desconto_percentual));
      setCreditoMax(String(c.credito_parcelas_maximo));
      setBoletoMesesMax(String(c.boleto_meses_maximo_antecedencia));
      setGateway(response.data.gateway);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Erro ao carregar configurações.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);
    setErro(null);
    setSalvando(true);
    try {
      const response = await api.put('/admin/configuracoes/pagamento', {
        pix_desconto_percentual: Number(pixDesconto),
        credito_parcelas_maximo: Number(creditoMax),
        boleto_meses_maximo_antecedencia: Number(boletoMesesMax),
      });
      const c = response.data.configuracoes;
      setPixDesconto(String(c.pix_desconto_percentual));
      setCreditoMax(String(c.credito_parcelas_maximo));
      setBoletoMesesMax(String(c.boleto_meses_maximo_antecedencia));
      setMensagem('Configurações salvas. Valem a partir da próxima reserva/contrato gerado.');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Erro ao salvar configurações.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <div>Carregando configurações...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Configurações de Pagamento</h1>

      {erro && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{erro}</div>}
      {mensagem && <div className="bg-blue-50 text-blue-700 p-4 rounded-lg">{mensagem}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Gateway de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            {gateway?.configurado ? (
              <CheckCircle2 className="text-green-600" size={20} />
            ) : (
              <AlertTriangle className="text-amber-600" size={20} />
            )}
            <div>
              <p className="font-medium text-gray-900">
                {gateway?.nome || GATEWAY_LABEL[gateway?.ativo || 'cora'] || 'Banco Cora'}
              </p>
              <p className="text-sm text-gray-500">
                {gateway?.configurado
                  ? 'Credenciais configuradas e prontas para uso.'
                  : 'Credenciais ainda não configuradas neste ambiente.'}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 border-t pt-3">
            O Banco Cora é o único gateway financeiro de produção. Client ID, certificado mTLS e private key
            são configurados como segredo de ambiente no deploy — não pelo painel e nunca no frontend.
            Ambiente atual: <strong>{gateway?.ambiente || 'stage'}</strong>. O checkout oferece Pix e boleto/carnê;
            cartão não é exibido sem uma API Cora contratada que o suporte explicitamente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras de parcelamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSalvar} className="space-y-4">
            <p className="text-sm text-gray-600">
              Essas regras valem para todo o site: checkout do cliente, contrato gerado em PDF e
              geração manual de contrato pelo admin. Alterações entram em vigor imediatamente,
              sem precisar de novo deploy.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Desconto do PIX (%)"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={pixDesconto}
                onChange={(e) => setPixDesconto(e.target.value)}
              />
              <Input
                label="Máx. parcelas no cartão (catálogo histórico)"
                type="number"
                min={1}
                max={24}
                value={creditoMax}
                onChange={(e) => setCreditoMax(e.target.value)}
              />
              <Input
                label="Máx. meses de antecedência (boleto)"
                type="number"
                min={1}
                max={36}
                value={boletoMesesMax}
                onChange={(e) => setBoletoMesesMax(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500">
              O boleto libera 1 parcela por mês de antecedência entre a contratação e o mês da
              excursão (ex.: contratou 7 meses antes = até 7x), respeitando este teto máximo.
            </p>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar configurações'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
