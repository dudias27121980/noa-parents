import { useState } from 'react';
import emblem from '../assets/emblem-judea.webp';

/**
 * The page title: the HQ / operation name, large, between two copies of the district emblem.
 * Double-click to rename (e.g. for the next operation); read-only on a wall display.
 */
export function TitleBanner({ name, onChange, readOnly = false }: { name: string; onChange: (name: string) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const emblemImg = <img src={emblem} alt="סמל מרחב יהודה" draggable={false} className="h-14 w-auto shrink-0 select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)] sm:h-20 lg:h-24" />;
  // Thin gold rules between the emblems and the title
  const rule = (dir: 'l' | 'r') => (
    <span
      aria-hidden
      className={`hidden h-px min-w-6 flex-1 md:block ${dir === 'l' ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-amber-200/60 via-amber-200/20 to-transparent`}
    />
  );

  return (
    <div className="border-b border-amber-200/15 bg-[radial-gradient(ellipse_at_center,#13223f_0%,#0a1428_55%,#070d19_100%)]">
      <div className="mx-auto flex w-full max-w-[1720px] items-center gap-3 px-3 py-2 sm:gap-5 sm:px-6">
        {emblemImg}
        {rule('r')}
        <div className="min-w-0 flex-1 text-center lg:flex-none">
          {editing && !readOnly ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim() && draft.trim() !== name) onChange(draft.trim());
                setEditing(false);
              }}
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
                onBlur={() => setEditing(false)}
                maxLength={60}
                aria-label='שם החפ"ק'
                className={`w-full rounded border bg-black/40 px-2 py-1 text-center text-lg font-extrabold text-slate-50 outline-none sm:text-2xl ${
                  draft.trim() ? 'border-cyan-500' : 'border-red-500'
                }`}
              />
            </form>
          ) : (
            <h1
              onDoubleClick={() => {
                if (readOnly) return;
                setDraft(name);
                setEditing(true);
              }}
              title={readOnly ? undefined : 'לחיצה כפולה לשינוי שם'}
              className="cursor-default select-none bg-gradient-to-b from-white via-amber-50 to-amber-200 bg-clip-text text-lg font-black leading-tight tracking-wide text-transparent drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)] sm:text-3xl lg:whitespace-nowrap lg:text-4xl"
            >
              {name}
            </h1>
          )}
        </div>
        {rule('l')}
        {emblemImg}
      </div>
    </div>
  );
}
