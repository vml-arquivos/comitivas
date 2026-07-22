import cron from 'node-cron';
import { db } from '../db/index.js';
import { reservas, emails_enviados } from '../db/schema.js';
import { eq, lt, and, sql } from 'drizzle-orm';
import { emailService } from './emailService.js';
import { DateTime } from 'luxon';

interface FollowupConfig {
  etapa: string;
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
  private cronJob: cron.ScheduledTask | null = null;

  start(intervalMinutos: number = 5) {
    // Executar a cada X minutos (configurável via env)
    const cronExpression = `*/${intervalMinutos} * * * *`;
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log(`[FOLLOWUP] Verificando leads para follow-up em ${new Date().toISOString()}`);
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
      const horasAtras = DateTime.now().minus({ hours: config.horas_espera }).toISO();

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
      const usuario = reserva.usuario_id; // Aqui você buscaria os dados do usuário real
      
      // Construir conteúdo do e-mail baseado no template
      const corpoEmail = this.construirCorpoFollowup(config.template, reserva);

      // Enviar e-mail (simulado aqui, em produção usar emailService real)
      console.log(`[FOLLOWUP] Enviando follow-up para reserva ${reserva.id} - etapa: ${config.etapa}`);

      // Registrar o envio
      await db.insert(emails_enviados).values({
        id: `email-${Date.now()}`,
        reserva_id: reserva.id,
        usuario_id: usuario,
        tipo: `followup_${config.etapa}`,
        assunto: config.assunto,
        corpo: corpoEmail,
        status: 'enviado',
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
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
