import React from 'react';
import { cn } from './Button';

// Mesma variável de ambiente já usada pelo botão flutuante em MainLayout.tsx,
// definida em build-time pelo Vite (VITE_*). Se não estiver configurada, o
// componente não renderiza nada — evita CTA quebrado apontando para lugar
// nenhum em vez de mostrar um link inválido.
const WHATSAPP_NUMERO = import.meta.env.VITE_WHATSAPP_NUMERO || '';

export function getLinkWhatsApp(mensagem: string) {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
}

function IconeWhatsApp({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.3-1.39a9.9 9.9 0 0 0 4.69 1.19h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.15.83.84-3.07-.19-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.53 3.7-8.22 8.25-8.22 4.55 0 8.25 3.69 8.25 8.22 0 4.53-3.7 8.25-8.25 8.25z" />
    </svg>
  );
}

export interface WhatsAppCTAProps {
  /** Mensagem pré-preenchida enviada junto com o link do WhatsApp. */
  mensagem: string;
  /** Texto do botão. Padrão: "Falar no WhatsApp". */
  label?: string;
  variant?: 'solid' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * CTA de WhatsApp reutilizável para as páginas públicas (Home, Historia, etc).
 * Não renderiza nada se VITE_WHATSAPP_NUMERO não estiver configurada no
 * ambiente de build — mesma regra do botão flutuante do MainLayout.
 */
export function WhatsAppCTA({ mensagem, label = 'Falar no WhatsApp', variant = 'solid', size = 'md', className }: WhatsAppCTAProps) {
  if (!WHATSAPP_NUMERO) return null;

  const sizes = {
    sm: 'h-9 px-4 text-xs gap-1.5',
    md: 'h-11 px-5 text-sm gap-2',
    lg: 'h-14 px-7 text-base gap-2.5',
  };

  const variants = {
    solid: 'bg-[#25D366] text-white hover:bg-[#1ebe57] shadow-sm',
    outline: 'border-2 border-[#25D366] text-[#128C4A] hover:bg-[#25D366]/10',
  };

  return (
    <a
      href={getLinkWhatsApp(mensagem)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]',
        sizes[size],
        variants[variant],
        className
      )}
    >
      <IconeWhatsApp size={size === 'lg' ? 22 : size === 'sm' ? 16 : 18} />
      {label}
    </a>
  );
}
