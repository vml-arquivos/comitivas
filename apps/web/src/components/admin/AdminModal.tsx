import { useEffect } from 'react';
import { X } from 'lucide-react';

type AdminModalProps = {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  fechar: () => void;
  children: React.ReactNode;
  largura?: 'normal' | 'ampla';
};

export function AdminModal({ aberto, titulo, descricao, fechar, children, largura = 'normal' }: AdminModalProps) {
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const aoPressionar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', aoPressionar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', aoPressionar);
    };
  }, [aberto, fechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden bg-[#062f3d]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && fechar()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        className={`flex max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-[24px] border border-white/70 bg-[#fffdfa] shadow-[0_28px_90px_rgba(6,47,61,.28)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[22px] ${largura === 'ampla' ? 'max-w-5xl' : 'max-w-2xl'}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 bg-[#fffdfa] px-5 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <h2 id="admin-modal-title" className="text-xl font-black text-[#073F50] sm:text-2xl">{titulo}</h2>
            {descricao && <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">{descricao}</p>}
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-[#DF6248]/40 hover:text-[#DF6248]">
            <X size={18} />
          </button>
        </header>
        <div className="admin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 sm:px-7">{children}</div>
      </section>
    </div>
  );
}
