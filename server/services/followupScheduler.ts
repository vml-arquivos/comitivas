import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { db } from '../db/index.js';
import { reservas, emails_enviados, usuarios } from '../db/schema.js';
import { eq, lt, and } from 'drizzle-orm';
import { InventoryService } from './inventoryService.js';
import { NotificationOutboxService } from './notificationOutboxService.js';

interface FollowupConfig {
  etapa: NonNullable<typeof reservas.$inferSelect.status>;
  horas_espera: number;
  assunto: string;
  template: string;
}

const followupConfigs: FollowupConfig[] = [
  {
    etapa: 'cadastrado',
    horas_espera: 2,
    assunto: 'Você deixou um pacote incrível para trás!',
    template: 'followup_cadastrado'
  },
  {
    etapa: 'pacote_montado',
    horas_espera: 4,
    assunto: 'Seu pacote está pronto para o checkout',
    template: 'followup_pacote'
  },
  {
    etapa: 'checkout_iniciado',
    horas_espera: 1,
    assunto: 'Finalize seu pagamento agora',
    template: 'followup_checkout'
  },
  {
    etapa: 'aguardando_pagamento',
    horas_espera: 24,
    assunto: 'Seu pagamento não foi confirmado. Tente novamente.',
    template: 'followup_pagamento'
  }
];

export class FollowupScheduler {
  private cronJob: ScheduledTask | null = null;

  start(intervalMinutos: number = 5) {
    // Executar a cada X minutos (configurável via env)
    const cronExpression = `*/${intervalMinutos} * * * *`;
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log(`[FOLLOWUP] Verificando leads para follow-up em ${new Date().toISOString()}`);
      const liberados = await InventoryService.liberarExpirados();
      if (liberados > 0) console.log(`[INVENTARIO] ${liberados} hold(s) expirado(s) liberado(s)`);
      await NotificationOutboxService.processarLote();
      await this.checkAndSendFollowups();
    });

    console.log(`[FOLLOWUP] Scheduler iniciado - verificação a cada ${intervalMinutos} minutos`);
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('[FOLLOWUP] Scheduler parado');
    }
  }

  private async checkAndSendFollowups() {
    try {
      for (const config of followupConfigs) {
        await this.checkEtapa(config);
      }
    } catch (error) {
      console.error('[FOLLOWUP] Erro ao verificar follow-ups:', error);
    }
  }

  private async checkEtapa(config: FollowupConfig) {
    try {
      const horasAtras = new Date(Date.now() - config.horas_espera * 60 * 60 * 1000);

      // Buscar reservas nessa etapa que não receberam follow-up recentemente
      const reservasParaFollowup = await db
        .select()
        .from(reservas)
        .where(
          and(
            eq(reservas.status, config.etapa),
            lt(reservas.criado_em, horasAtras)
          )
        )
        .limit(100);

      for (const reserva of reservasParaFollowup) {
        // Verificar se já enviamos um follow-up para essa reserva nessa etapa
        const jaEnviado = await db
          .select()
          .from(emails_enviados)
          .where(
            and(
              eq(emails_enviados.reserva_id, reserva.id),
              eq(emails_enviados.tipo, `followup_${config.etapa}`)
            )
          )
          .limit(1);

        if (jaEnviado.length === 0) {
          // Enviar follow-up
          await this.enviarFollowup(reserva, config);
        }
      }
    } catch (error) {
      console.error(`[FOLLOWUP] Erro ao verificar etapa ${config.etapa}:`, error);
    }
  }

  private async enviarFollowup(reserva: any, config: FollowupConfig) {
    try {
      const usuarioResult = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, reserva.usuario_id))
        .limit(1);

      if (usuarioResult.length === 0) {
        console.warn(`[FOLLOWUP] Usuário ${reserva.usuario_id} não encontrado, pulando follow-up`);
        return;
      }

      const usuario = usuarioResult[0];

      // Construir conteúdo do e-mail baseado no template
      const corpoEmail = this.construirCorpoFollowup(config.template, reserva);

      // Enviar e-mail (simulado aqui — integrar com EmailService/SMTP real quando configurado)
      console.log(`[FOLLOWUP] Enviando follow-up para reserva ${reserva.id} - etapa: ${config.etapa}`);

      // Registrar o envio
      await db.insert(emails_enviados).values({
        reserva_id: reserva.id,
        tipo: `followup_${config.etapa}`,
        destinatario: usuario.email,
        assunto: config.assunto,
        corpo: corpoEmail,
        enviado_em: new Date(),
      });

      console.log(`[FOLLOWUP] Follow-up registrado para reserva ${reserva.id}`);
    } catch (error) {
      console.error(`[FOLLOWUP] Erro ao enviar follow-up:`, error);
    }
  }

  private construirCorpoFollowup(template: string, reserva: any): string {
    const templates: Record<string, string> = {
      followup_cadastrado: `
        Olá! Vimos que você se cadastrou na Comitiva mas ainda não montou seu pacote.
        Não perca essa oportunidade! Clique aqui para continuar: ${process.env.WEB_URL}/
      `,
      followup_pacote: `
        Seu pacote está pronto! Agora é só finalizar o pagamento.
        Valor total: R$ ${reserva.valor_total}
        Clique aqui para pagar: ${process.env.WEB_URL}/checkout/${reserva.id}
      `,
      followup_checkout: `
        Você deixou o checkout inacabado! Faltam poucos cliques para garantir sua vaga.
        Clique aqui para finalizar: ${process.env.WEB_URL}/checkout/${reserva.id}
      `,
      followup_pagamento: `
        Seu pagamento ainda não foi confirmado. Tente novamente ou entre em contato conosco.
        Clique aqui para tentar novamente: ${process.env.WEB_URL}/checkout/${reserva.id}
      `
    };

    return templates[template] || 'Olá! Não perca essa oportunidade com a Comitiva.';
  }
}

export const followupScheduler = new FollowupScheduler();
