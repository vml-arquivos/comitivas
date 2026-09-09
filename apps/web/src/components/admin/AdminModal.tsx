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
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[#062f3d]/45 p-4 backdrop-blur-[2px] sm:items-center" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && fechar()}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        className={`my-4 max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-[22px] border border-white/70 bg-[#fffdfa] shadow-[0_28px_90px_rgba(6,47,61,.28)] ${largura === 'ampla' ? 'max-w-4xl' : 'max-w-2xl'}`}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200/80 bg-[#fffdfa]/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <h2 id="admin-modal-title" className="text-xl font-black text-[#073F50] sm:text-2xl">{titulo}</h2>
            {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-[#DF6248]/40 hover:text-[#DF6248]">
            <X size={18} />
          </button>
        </header>
        <div className="p-5 sm:p-7">{children}</div>
      </section>
    </div>
  );
}
