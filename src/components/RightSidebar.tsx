import { Lock } from 'lucide-react';
import { ViewScreen } from '../types/tactical';
import { playClick } from '../utils/audio';
import { SCREENS } from './screens';
import { StatusDot } from './ui';

interface Props {
  currentScreen: ViewScreen;
  onScreenChange: (s: ViewScreen) => void;
  audioEnabled: boolean;
  unresolvedIncidentsCount: number;
  activeUnitsCount: number;
}

export function RightSidebar({
  currentScreen,
  onScreenChange,
  audioEnabled,
  unresolvedIncidentsCount,
  activeUnitsCount,
}: Props) {
  const badgeFor = (id: ViewScreen) =>
    id === 'incidents' ? unresolvedIncidentsCount : id === 'forces' ? activeUnitsCount : null;

  return (
    <aside className="hidden w-full shrink-0 rounded-md lg:order-first lg:block border border-cyan-900/60 bg-[#0b1426]/90 lg:sticky lg:top-16 lg:w-56">
      <header className="flex items-center gap-2 border-b border-cyan-900/50 px-3 py-2 text-xs font-bold text-cyan-300">
        <Lock size={14} />
        ערוצי שליטה SECURE-V4
      </header>
      <nav aria-label="ערוצי שליטה" className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 lg:grid-cols-1">
        {SCREENS.map(({ id, label, icon: Icon }) => {
          const badge = badgeFor(id);
          const active = currentScreen === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (audioEnabled) playClick();
                onScreenChange(id);
              }}
              className={`flex items-center gap-2 rounded px-2.5 py-2 text-xs font-semibold transition ${
                active
                  ? 'bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-500/50'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={14} />
              <span className="flex-1 text-start">{label}</span>
              {badge !== null && (
                <span
                  className={`min-w-5 rounded px-1 text-center font-mono text-[10px] ${
                    id === 'incidents' && badge > 0 ? 'bg-red-500/80 text-white' : 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <footer className="flex items-center gap-2 border-t border-cyan-900/50 px-3 py-2 text-[11px] text-slate-400">
        <StatusDot color="bg-emerald-400" pulse />
        ערוץ מוצפן פעיל
      </footer>
    </aside>
  );
}
