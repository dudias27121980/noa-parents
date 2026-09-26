import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export function Panel({
  title,
  icon,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative rounded-md border border-cyan-900/60 bg-[#0b1426]/90 shadow-[0_0_0_1px_rgba(8,145,178,0.08)_inset] ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-cyan-900/50 px-3 py-2">
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-cyan-300">
            {icon}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function ModalShell({
  title,
  icon,
  onClose,
  children,
  tone = 'cyan',
  wide = false,
}: {
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  tone?: 'cyan' | 'red' | 'amber';
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const border =
    tone === 'red' ? 'border-red-500/70' : tone === 'amber' ? 'border-amber-400/70' : 'border-cyan-500/60';
  const text = tone === 'red' ? 'text-red-300' : tone === 'amber' ? 'text-amber-300' : 'text-cyan-300';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto rounded-md border-2 ${border} bg-[#0b1426] shadow-2xl animate-in zoom-in-95`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`sticky top-0 flex items-center justify-between border-b border-white/10 bg-[#0b1426] px-4 py-3 ${text}`}>
          <h3 className="flex items-center gap-2 text-base font-bold">
            {icon}
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="סגור"
          >
            <X size={18} />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function StatusDot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}
