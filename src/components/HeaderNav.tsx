import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, Shield, Volume2, VolumeX } from 'lucide-react';
import { ALERT_LEVELS, AlertLevel, ViewScreen } from '../types/tactical';
import { playClick } from '../utils/audio';
import { clockTime } from '../utils/time';
import { SCREENS } from './screens';

interface Props {
  currentScreen: ViewScreen;
  onScreenChange: (s: ViewScreen) => void;
  alertLevel: AlertLevel;
  onAlertLevelChange: (l: AlertLevel) => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  commanderName: string;
  shiftName: string;
  unresolvedIncidentsCount?: number;
}

const alertStyle = (level: AlertLevel) => {
  switch (level) {
    case 'פע״מ - פקודת לחימה':
      return 'border-red-500 bg-red-500/20 text-red-200 animate-pulse';
    case 'כוננות ג׳ - מצב מבצעי מוגבר':
      return 'border-orange-400 bg-orange-500/15 text-orange-200';
    case 'כוננות ב׳ - עירנות מוגברת':
      return 'border-amber-300 bg-amber-400/10 text-amber-200';
    default:
      return 'border-emerald-400 bg-emerald-500/10 text-emerald-200';
  }
};

export function HeaderNav({
  currentScreen,
  onScreenChange,
  alertLevel,
  onAlertLevelChange,
  audioEnabled,
  onToggleAudio,
  onToggleFullscreen,
  isFullscreen,
  commanderName,
  shiftName,
  unresolvedIncidentsCount = 0,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const click = () => audioEnabled && playClick();

  return (
    <header className="sticky top-0 z-30 border-b border-cyan-900/60 bg-[#060b16]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1720px] flex-wrap items-center gap-3 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="rounded border border-cyan-500/50 bg-cyan-500/10 p-1.5 text-cyan-300">
            <Shield size={20} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-wide text-slate-100">חפ"ק מרחב יהודה</div>
            <div className="text-[11px] text-slate-400">
              משמרת {shiftName} · מפקד: {commanderName}
            </div>
          </div>
        </div>

        <nav className="order-3 flex w-full gap-1 overflow-x-auto lg:order-none lg:w-auto lg:flex-1 lg:justify-center">
          {SCREENS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                click();
                onScreenChange(id);
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition ${
                currentScreen === id
                  ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/60'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Icon size={14} />
              {label}
              {id === 'incidents' && unresolvedIncidentsCount > 0 && (
                <span className="rounded bg-red-500/80 px-1 font-mono text-[10px] text-white lg:hidden">
                  {unresolvedIncidentsCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <select
            value={alertLevel}
            onChange={(e) => {
              click();
              onAlertLevelChange(e.target.value as AlertLevel);
            }}
            className={`rounded border px-2 py-1 text-xs font-bold outline-none ${alertStyle(alertLevel)}`}
            aria-label="רמת כוננות"
          >
            {ALERT_LEVELS.map((l) => (
              <option key={l} value={l} className="bg-[#0b1426] text-slate-100">
                {l}
              </option>
            ))}
          </select>

          <div className="hidden rounded border border-slate-700 px-2 py-1 font-mono text-sm text-cyan-200 sm:block" dir="ltr">
            {clockTime(now)}
          </div>

          <button
            onClick={onToggleAudio}
            className="rounded border border-slate-700 p-1.5 text-slate-300 hover:bg-white/5"
            aria-label={audioEnabled ? 'השתק' : 'הפעל שמע'}
            title={audioEnabled ? 'השתק' : 'הפעל שמע'}
          >
            {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} className="text-red-400" />}
          </button>
          <button
            onClick={onToggleFullscreen}
            className="rounded border border-slate-700 p-1.5 text-slate-300 hover:bg-white/5"
            aria-label="מסך מלא"
            title="מסך מלא"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
