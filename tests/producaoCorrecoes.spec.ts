import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { renderizarContratoModeloPadrao, type ContratoModeloSnapshot } from '../packages/contract-engine/contratoModeloPadrao.js';

const estado = vi.hoisted(() => ({ consultas: [] as any[][], execucoes: [] as any[], updates: [] as any[], inserts: [] as any[] }));
vi.mock('../server/db/index.js', () => {
  const banco: any = {
    select: () => {
      const linhas = estado.consultas.shift() || [];
      const builder: any = {};
      for (const m of ['from','where','limit','orderBy','for','innerJoin','leftJoin']) builder[m] = () => builder;
      builder.then = (resolve: any, reject: any) => Promise.resolve(linhas).then(resolve,reject);
      return builder;
    },
    execute: vi.fn(async () => ({ rows: estado.execucoes.shift() || [] })),
    update: vi.fn(() => ({ set: (dados: any) => ({ where: async () => { estado.updates.push(dados); } }) })),
    insert: vi.fn(() => ({ values: async (dados: any) => { estado.inserts.push(dados); } })),
  };
  banco.transaction = async (fn: any) => fn(banco);
  return { db: banco };
});
import { ContratoService, conferirHashSnapshot, serializarSnapshot } from '../server/services/contratoService.js';
import { transicaoCoraVerificada, processarEventoCora } from '../server/routes/pagamentos.js';
import { PaymentGatewayAdapter } from '../server/services/paymentGatewayAdapter.js';
import { AuthService } from '../server/services/authService.js';
import { authMiddleware } from '../server/middleware/authMiddleware.js';

beforeEach(() => { estado.consultas = []; estado.execucoes = []; estado.updates = []; estado.inserts = []; vi.clearAllMocks(); });
afterEach(() => vi.restoreAllMocks());
const snapshot = (versao = '2026.2-operacional'): ContratoModeloSnapshot => ({
  versao_contratual: versao, data_contrato:'2026-10-07', cliente:{nome:'Cliente <Teste>'},
  periodo:{check_in:'2027-08-20',check_out:'2027-08-23'}, hospedagem:{modalidade:null,local:''},
  financeiro:{total:'900.00', desconto_pagamento:'100.00',forma_pagamento:'pix',parcelas:1,cronograma:[]},
  transporte:{rodoviario_incluido:false,local_embarque:null,ponto_referencia:null,data_saida:null,data_retorno:null,horario_saida:null,horario_retorno:null,veiculo:null},
});

describe('contratos e preço congelado', () => {
  it('confere o hash canônico e rejeita alteração no conteúdo', () => {
    const s = snapshot(); const hash=createHash('sha256').update(serializarSnapshot(s)).digest('hex');
    expect(() => conferirHashSnapshot(s,hash)).not.toThrow();
    expect(() => conferirHashSnapshot({...s,financeiro:{...s.financeiro,total:'1.00'}},hash)).toThrow('diverge');
    expect(serializarSnapshot({b:2,a:1})).toBe(serializarSnapshot({a:1,b:2}));
    expect(() => conferirHashSnapshot(s,'')).toThrow();
  });
  it('não reaplica a promessa fixa de PIX de 5% aos novos contratos', () => {
    const html = renderizarContratoModeloPadrao({snapshot:snapshot(),reservaId:'r'});
    expect(html).toContain('100,00'); expect(html).not.toContain('com desconto de 5%');
    expect(html).toContain('Cliente &lt;Teste&gt;');
    expect(html).toContain('Direito de arrependimento'); expect(html).toContain('80 (oitenta) e 51'); expect(html).toContain('50 (cinquenta) e 21');
  });
  it('preserva o texto da versão antiga ao renderizar um snapshot legado', () => {
    const html=renderizarContratoModeloPadrao({snapshot:snapshot('2026.1-oficial'),reservaId:'r'});
    expect(html).toContain('com desconto de 5% (cinco por cento)'); expect(html).toContain('superior a 90 (noventa)');
    expect(html).toContain('80 (oitenta) e 60'); expect(html).not.toContain('Direito de arrependimento');
  });
  it('preparar novamente devolve contrato validado sem regravar a reserva', async () => {
    const vigente:any={id:'c',versao:1,validado_em:new Date(),status:'validado',snapshot:snapshot(),snapshot_sha256:'hash'};
    estado.execucoes=[[],[{id:'r'}]];
    vi.spyOn(ContratoService,'obterContratoVigente').mockResolvedValue(vigente);
    const gerar = vi.spyOn(ContratoService,'gerarSnapshot');
    const resultado=await ContratoService.prepararContrato({reserva_id:'r'} as any);
    expect(resultado.reutilizado).toBe(true); expect(resultado.id).toBe('c'); expect(gerar).not.toHaveBeenCalled(); expect(estado.updates).toHaveLength(0);
  });
  it('recusa alteração financeira depois da assinatura', async () => {
    estado.consultas=[[{id:'r',status:'contrato_gerado'}]];
    vi.spyOn(ContratoService,'obterContratoVigente').mockResolvedValue({validado_em:new Date()} as any);
    await expect(ContratoService.salvarCondicaoPendente('r',ContratoService.calcularCondicaoPagamento('1000','pix',1))).rejects.toThrow('já foi validado');
    expect(estado.updates).toHaveLength(0);
  });
  it('exige aprovação e hashes correspondentes antes de liberar boleto', async () => {
    const c:any={id:'c',status:'validado',validado_em:new Date(),snapshot_sha256:'s',pdf_sha256:'p'};
    vi.spyOn(ContratoService,'obterContratoVigente').mockResolvedValue(c);
    estado.consultas=[[{aceite_contrato:true,aceite_regras:true,snapshot_sha256:'s',pdf_sha256:'p'}]];
    await expect(ContratoService.exigirAprovacaoFinanceira('r')).rejects.toThrow('aprovação');
    c.status='aprovado_admin'; c.aprovado_admin_em=new Date(); c.aprovado_admin_por='admin';
    estado.consultas=[[{aceite_contrato:true,aceite_regras:true,snapshot_sha256:'s',pdf_sha256:'alterado'}]];
    await expect(ContratoService.exigirAprovacaoFinanceira('r')).rejects.toThrow('evidências');
    estado.consultas=[[{aceite_contrato:true,aceite_regras:true,snapshot_sha256:'s',pdf_sha256:'p'}]];
    expect(await ContratoService.exigirAprovacaoFinanceira('r')).toBe(c);
  });
  it('usa a data do período central em vez do lote genérico', async () => {
    estado.consultas=[[{evento_periodo_id:'central',data_embarque:new Date('2027-08-19')}],[{data_embarque:new Date('2027-08-26')}]];
    expect(await ContratoService.obterDataViagemReserva({periodo_id:'p',pacote_id:'pacote'}, {data_embarque:new Date('2027-08-01')})).toEqual(new Date('2027-08-26'));
  });
  it('não troca silenciosamente um período selecionado que deixou de existir', async () => {
    await expect(ContratoService.obterDataViagemReserva({periodo_id:'p',pacote_id:'pacote'},{data_embarque:new Date()})).rejects.toThrow('período');
  });
  it('reconstrói subtotal do valor reservado e multiplica adicionais do grupo', async () => {
    vi.spyOn(ContratoService,'obterDadosBase').mockResolvedValue({
      reserva:{id:'r',grupo_id:'g',valor_total:'3000.00',desconto_aplicado:'0',desconto_pagamento:'0',forma_pagamento:'pix',quantidade_parcelas:1,recursos_contratados:{transporte:false,hospedagem:false},itens_selecionados:[{id:'a',nome:'Adicional',quantidade:1,valor:'100.00'}]},
      usuario:{id:'u',nome:'Cliente'},lote:{id:'l',nome:'Lote',valor_base:'9999',data_inicio:new Date('2027-08-20'),data_fim:new Date('2027-08-23')},evento:{id:'e',nome:'Evento'},pacote:{id:'p',nome:'Pacote',valor_total:'9999'},
    } as any);
    estado.consultas=[[],[{nome:'Pessoa 1'},{nome:'Pessoa 2'}],[],[]]; estado.execucoes=[[{total:'0'}],[{assentos:0,quartos:0}]];
    const s=await ContratoService.gerarSnapshot({reserva_id:'r'} as any);
    expect(s.quantidade).toBe(2); expect(s.financeiro.total).toBe('3000.00'); expect(s.financeiro.subtotal).toBe('3000.00');
    expect(s.adicionais[0].quantidade).toBe(2); expect(s.pacote.valor_total).toBe('1400.00'); expect(s.modelo_oficial).toBe('servicos');
  });
});

describe('webhook Cora e sessões', () => {
  it.each(['PENDING','OPEN','UNKNOWN',null])('não usa a notificação para autorizar mudança financeira: %s', status => {
    expect(transicaoCoraVerificada(status,'pendente')).toBeNull();
  });
  it('aceita apenas estados verificados e não desfaz uma quitação', () => {
    expect(transicaoCoraVerificada('PAID','pendente')).toBe('aprovado');
    expect(transicaoCoraVerificada('CANCELED','pendente')).toBe('cancelado');
    expect(transicaoCoraVerificada('LATE','pendente')).toBe('atrasado');
    expect(transicaoCoraVerificada('CANCELED','quitado')).toBeNull();
  });
  it('não processa evento que outra transação já está processando', async () => {
    estado.execucoes=[[{adquirido:false}]];
    const remoto=vi.spyOn(PaymentGatewayAdapter,'consultarPagamento');
    expect(await processarEventoCora('evt')).toEqual({ok:true,processando:true}); expect(remoto).not.toHaveBeenCalled(); expect(estado.updates).toHaveLength(0);
  });
  it('evento já concluído não chama o provedor nem altera pagamento', async () => {
    estado.execucoes=[[{adquirido:true}]];estado.consultas=[[{id:'evt',processado_em:new Date()}]];
    const remoto=vi.spyOn(PaymentGatewayAdapter,'consultarPagamento');
    expect(await processarEventoCora('evt')).toEqual({ok:true,duplicado:true}); expect(remoto).not.toHaveBeenCalled();
  });
  it('não aceita token de outro propósito como sessão', () => {
    expect(AuthService.verifyToken(AuthService.generateLeadIntentToken('lead'))).toBeNull();
  });
  it('sessão antiga sem versão não contorna a revogação', async () => {
    estado.consultas=[[{ativo:true,session_version:2,tipo:'cliente'}]];
    const req:any={headers:{authorization:`Bearer ${AuthService.generateToken({id:'u',email:'u@exemplo.com',tipo:'cliente'})}`}};
    const res:any={status:vi.fn().mockReturnThis(),json:vi.fn()};const next=vi.fn();
    await authMiddleware(req,res,next);expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();
  });
});

import express from 'express';
import type { AddressInfo } from 'node:net';
import contratosRouter from '../server/routes/contratos.js';
import { ContratacaoIntegridadeService } from '../server/services/contratacaoIntegridadeService.js';

describe('preservação exata do HTML legado', () => {
  it.each([
    [null,false,'11874bb0a0e376c963c8942676f841b7b53adf47cf8bc877786e2d131ef84206'],
    [null,true,'9c97bf448f8700f190b26f7c341711494463464a43acffaa477898a95bb69d5a'],
    ['camping',false,'07041bab57e275df44d85df3fc072d2db15135792d16460dad367309d76e85ea'],
    ['camping',true,'a82a8519e3669f3fa1a0937e2dfd768add9b4d41c01e85b102dc883ed99cf30c'],
    ['quarto_ventilador',false,'0e678df564011b99b2c076d46e1a191cc85b8282c825f609d3f29ed346d84d46'],
    ['quarto_ventilador',true,'71e737c65046730d154864293fb69a16e55b7d21aa165a99f22c1dc7ff833a8e'],
    ['quarto_ar_condicionado',false,'1639ac9895fb8246709e7a611737512bdd724940c411784ff0ceebdbe76355ee'],
    ['quarto_ar_condicionado',true,'24fc175758e3981968a7c09e9b09f8e9d50e6911ef5bb6304db2edb6d882713c'],
  ])('compara baseline original: %s / transporte %s', (modalidade,transporte,hash) => {
    const s=snapshot('2026.1-oficial');s.hospedagem.modalidade=modalidade as string|null;s.transporte.rodoviario_incluido=Boolean(transporte);
    const html=renderizarContratoModeloPadrao({snapshot:s,reservaId:'r'});
    expect(createHash('sha256').update(html).digest('hex')).toBe(hash);
  });
});

describe('proteção das rotas OTP', () => {
  it.each(['solicitar','confirmar'])('recusa a reserva de outra pessoa antes de renovar inventário: %s', async acao => {
    estado.consultas=[[{ativo:true,session_version:1,tipo:'cliente'}],[{usuario_id:'outra-pessoa'}]];
    const integridade=vi.spyOn(ContratacaoIntegridadeService,'garantirReserva');
    const app=express();app.use(express.json());app.use('/contratos',contratosRouter);
    const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));
    try {
      const token=AuthService.generateToken({id:'u',email:'u@exemplo.com',tipo:'cliente',session_version:1});
      const res=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/contratos/otp/${acao}/r`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'});
      expect(res.status).toBe(403);expect(integridade).not.toHaveBeenCalled();
    } finally { await new Promise<void>((resolve,reject)=>server.close(erro=>erro?reject(erro):resolve())); }
  });
});

describe('concorrência financeira e evidências', () => {
  it('não sobrescreve uma alteração financeira ocorrida depois da leitura da tela', async () => {
    estado.consultas=[[{id:'r',status:'pacote_montado',valor_total:'800',desconto_pagamento:'0'}]];
    await expect(ContratoService.salvarCondicaoPendente('r',ContratoService.calcularCondicaoPagamento('1000','pix',1),{valor_total:'1000',desconto_pagamento:'0'})).rejects.toThrow('valor da reserva mudou');
    expect(estado.updates).toHaveLength(0);
  });
  it('acrescenta evento canônico ao hash anterior com ordem temporal estrita', async () => {
    const anterior=new Date(Date.now()+1000);estado.consultas=[[{hash_evento:'anterior',criado_em:anterior}]];
    await ContratoService.registrarEvento({contrato_id:'c',reserva_id:'r',tipo:'otp_enviado',metadados:{b:2,a:1}});
    expect(estado.inserts).toHaveLength(1);const evento=estado.inserts[0];
    expect(evento.hash_anterior).toBe('anterior');expect(evento.criado_em.getTime()).toBe(anterior.getTime()+1);
    expect(evento.hash_evento).toBe(createHash('sha256').update('anterior:{"a":1,"b":2}').digest('hex'));
  });
  it('webhook que declara cancelamento não cancela uma cobrança aberta no provedor', async () => {
    estado.execucoes=[[{adquirido:true}]];estado.consultas=[[{id:'evt',recurso_id:'cora1',tipo:'invoice.cancelled'}],[{id:'p',reserva_id:'r',status:'pendente',status_reconciliado:'pendente'}]];
    vi.spyOn(PaymentGatewayAdapter,'consultarPagamento').mockResolvedValue({status:'OPEN'} as any);
    expect(await processarEventoCora('evt')).toEqual({ok:true});
    expect(estado.updates.some(x=>x.status==='cancelado')).toBe(false);
    expect(estado.updates.some(x=>x.processado_em instanceof Date)).toBe(true);
  });
  it('falha de consulta ao provedor agenda outra tentativa sem cancelar pagamento', async () => {
    estado.execucoes=[[{adquirido:true}]];estado.consultas=[[{id:'evt',recurso_id:'cora1'}],[{id:'p',reserva_id:'r',status:'pendente'}]];
    vi.spyOn(PaymentGatewayAdapter,'consultarPagamento').mockRejectedValue(new Error('Provedor indisponível'));
    await expect(processarEventoCora('evt')).rejects.toThrow('indisponível');
    expect(estado.updates.some(x=>x.ultimo_erro==='Provedor indisponível' && x.proxima_tentativa instanceof Date)).toBe(true);
    expect(estado.updates.some(x=>x.status==='cancelado')).toBe(false);
  });
});
