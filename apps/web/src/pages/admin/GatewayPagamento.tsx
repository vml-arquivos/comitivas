import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, RefreshCw, ShieldAlert, TestTube2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';

type GatewayForm = {
  ambiente: 'stage' | 'production';
  ativo: boolean;
  client_id: string;
  certificate_pem: string;
  private_key_pem: string;
  webhook_secret: string;
  token_url: string;
  api_base: string;
  installments_api_base: string;
  webhook_public_url: string;
  http_timeout_ms: string;
  carne_timeout_ms: string;
};

const VAZIO: GatewayForm = {
  ambiente: 'stage',
  ativo: false,
  client_id: '',
  certificate_pem: '',
  private_key_pem: '',
  webhook_secret: '',
  token_url: '',
  api_base: '',
  installments_api_base: '',
  webhook_public_url: '',
  http_timeout_ms: '15000',
  carne_timeout_ms: '45000',
};

export default function GatewayPagamento() {
  const [status, setStatus] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [form, setForm] = useState<GatewayForm>(VAZIO);

  const carregar = async () => {
    setErro('');
    try {
      const r = await api.get('/admin/dev/gateway/cora');
      const gateway = r.data.gateway || {};
      setStatus(gateway);
      setForm((atual) => ({
        ...atual,
        ambiente: gateway.ambiente === 'production' ? 'production' : 'stage',
        ativo: Boolean(gateway.ativo),
        token_url: gateway.token_url || '',
        api_base: gateway.api_base || '',
        installments_api_base: gateway.installments_api_base || '',
        webhook_public_url: gateway.webhook_public_url || '',
        http_timeout_ms: String(gateway.http_timeout_ms || 15000),
        carne_timeout_ms: String(gateway.carne_timeout_ms || 45000),
      }));
    } catch (e: any) {
      setErro(e.response?.data?.erro || 'Não foi possível carregar o gateway.');
    }
  };

  useEffect(() => { void carregar(); }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true); setErro(''); setMensagem('');
    try {
      const payload = {
        ...form,
        client_id: form.client_id || undefined,
        certificate_pem: form.certificate_pem || undefined,
        private_key_pem: form.private_key_pem || undefined,
        webhook_secret: form.webhook_secret || undefined,
        http_timeout_ms: Number(form.http_timeout_ms || 15000),
        carne_timeout_ms: Number(form.carne_timeout_ms || 45000),
      };
      const r = await api.put('/admin/dev/gateway/cora', payload);
      setStatus(r.data.gateway);
      setForm((atual) => ({ ...atual, client_id: '', certificate_pem: '', private_key_pem: '', webhook_secret: '' }));
      setMensagem('Configuração criptografada e salva.');
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível salvar.');
    } finally { setSalvando(false); }
  };

  const testar = async () => {
    setTestando(true); setErro(''); setMensagem('');
    try {
      const r = await api.post('/admin/dev/gateway/cora/testar');
      setMensagem(r.data.mensagem || 'Conexão validada.');
      await carregar();
    } catch (e: any) { setErro(e.response?.data?.erro || 'Falha no teste.'); }
    finally { setTestando(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">DEV · Cofre de segredos</p><h1 className="text-3xl font-bold text-secondary">Gateway de pagamento</h1><p className="mt-1 text-sm text-gray-500">Credenciais e endpoints bancários ficam administráveis pelo painel. Segredos nunca retornam em texto aberto.</p></div>
        <Button variant="outline" onClick={() => void carregar()}><RefreshCw size={16} /></Button>
      </div>
      {erro && <div className="rounded-xl bg-red-50 p-4 text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl bg-emerald-50 p-4 text-emerald-700">{mensagem}</div>}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={20} />Banco Cora</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Status</p><p className="font-bold">{status?.configurado ? 'Configurado' : 'Pendente'}</p></div>
            <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Client ID</p><p className="font-bold">{status?.client_id_mascarado || '—'}</p></div>
            <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Certificado</p><p className="font-bold">{status?.certificado_configurado ? 'OK' : '—'}</p></div>
            <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Último teste</p><p className="font-bold">{status?.ultimo_teste_status || '—'}</p></div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert size={18} className="mr-2 inline" />Em produção, configure uma única vez <code>SYSTEM_SECRETS_MASTER_KEY</code> no ambiente. Depois disso, credenciais, certificados e endpoints podem ser rotacionados nesta tela.</div>
          <form onSubmit={salvar} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium">Ambiente</label><select className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm" value={form.ambiente} onChange={(e) => setForm({ ...form, ambiente: e.target.value as GatewayForm['ambiente'] })}><option value="stage">Stage / Homologação</option><option value="production">Produção</option></select></div>
              <Input label="Client ID (vazio mantém o atual)" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} />
              <Input label="Token URL" value={form.token_url} onChange={(e) => setForm({ ...form, token_url: e.target.value })} placeholder="https://matls-clients.api.cora.com.br/token" />
              <Input label="API Base mTLS" value={form.api_base} onChange={(e) => setForm({ ...form, api_base: e.target.value })} placeholder="https://matls-clients.api.cora.com.br" />
              <Input label="API de parcelamento/carnê" value={form.installments_api_base} onChange={(e) => setForm({ ...form, installments_api_base: e.target.value })} placeholder="https://api.cora.com.br" />
              <Input label="Webhook público" value={form.webhook_public_url} onChange={(e) => setForm({ ...form, webhook_public_url: e.target.value })} placeholder="https://excursaodascomitivas.com.br/api/pagamentos/webhook/cora" />
              <Input label="Timeout API (ms)" type="number" value={form.http_timeout_ms} onChange={(e) => setForm({ ...form, http_timeout_ms: e.target.value })} />
              <Input label="Timeout carnê (ms)" type="number" value={form.carne_timeout_ms} onChange={(e) => setForm({ ...form, carne_timeout_ms: e.target.value })} />
              <Input label="Webhook secret (vazio mantém o atual)" type="password" value={form.webhook_secret} onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium">Certificado PEM</label><textarea rows={8} className="w-full rounded-md border border-gray-300 p-3 font-mono text-xs" value={form.certificate_pem} onChange={(e) => setForm({ ...form, certificate_pem: e.target.value })} placeholder="-----BEGIN CERTIFICATE-----" /></div>
              <div><label className="mb-1 block text-sm font-medium">Private Key PEM</label><textarea rows={8} className="w-full rounded-md border border-gray-300 p-3 font-mono text-xs" value={form.private_key_pem} onChange={(e) => setForm({ ...form, private_key_pem: e.target.value })} placeholder="-----BEGIN PRIVATE KEY-----" /></div>
            </div>
            <label className="flex items-center gap-2 rounded-xl border p-4 text-sm font-medium"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />Ativar Cora para cobranças automáticas após salvar</label>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar com criptografia'}</Button><Button type="button" variant="outline" disabled={testando || !status?.configurado} onClick={() => void testar()}><TestTube2 size={16} className="mr-2" />{testando ? 'Testando...' : 'Testar conexão'}</Button></div>
          </form>
          {status?.ultimo_teste_status === 'ok' && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={17} />Última conexão confirmada em {status.ultimo_teste_em ? new Date(status.ultimo_teste_em).toLocaleString('pt-BR') : '—'}.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
