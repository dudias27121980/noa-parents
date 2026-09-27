import { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';

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

/* ---------- Inline editing (double-click to edit) ---------- */

export const fieldClass = (invalid = false) =>
  `w-full rounded border bg-black/40 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-400 ${
    invalid ? 'border-red-500' : 'border-slate-700'
  }`;

export function Field({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-[11px] text-slate-400 ${className}`}>
      {label}
      {children}
    </label>
  );
}

/**
 * Inline edit form shared by all editable rows: Enter saves (native submit), Esc cancels,
 * Save is disabled while invalid. `extraActions` sits at the start of the footer (e.g. delete).
 */
export function InlineEditor({
  onSubmit,
  onCancel,
  invalid,
  extraActions,
  className = '',
  children,
}: {
  onSubmit: () => void;
  onCancel: () => void;
  invalid: boolean;
  extraActions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!invalid) onSubmit();
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`grid gap-2 rounded border-2 border-cyan-500/70 bg-cyan-500/5 p-3 ${className}`}
    >
      {children}
      <div className="col-span-full flex flex-wrap items-center justify-between gap-2 pt-1">
        <div>{extraActions}</div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-slate-500 sm:inline">Enter לשמירה · Esc לביטול</span>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
          >
            <X size={13} /> ביטול
          </button>
          <button
            type="submit"
            disabled={invalid}
            className="flex items-center gap-1 rounded bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save size={13} /> שמירה
          </button>
        </div>
      </div>
    </form>
  );
}

/** Delete with an inline "are you sure?" step (for the footer of an editor) */
export function DeleteButton({ onConfirm, question = 'למחוק?' }: { onConfirm: () => void; question?: string }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="flex items-center gap-2 text-xs text-red-300">
      {question}
      <button type="button" onClick={onConfirm} className="rounded bg-red-600 px-2 py-1 font-bold text-white hover:bg-red-500">
        מחק
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-slate-400 hover:text-slate-200">
        לא
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
    >
      <Trash2 size={13} /> מחיקה
    </button>
  );
}

/** Dashed "+ add" tile at the end of a list or grid */
export function AddTile({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded border-2 border-dashed border-cyan-800/70 p-3 text-sm font-bold text-cyan-300/80 transition hover:border-cyan-500 hover:bg-cyan-500/5 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus size={18} /> {label}
    </button>
  );
}
