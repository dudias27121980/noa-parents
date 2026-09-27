import { useEffect, useState } from 'react';
import { Check, LogOut, Maximize2, Minimize2, Shield, Users, Volume2, VolumeX, X } from 'lucide-react';
import { StationInfo } from '../shared/protocol';
import { ConnectionStatus } from '../sync/store';
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
  onShiftChange: (shift: { commanderName: string; shiftName: string }) => void;
  hqName: string;
  onHqNameChange: (name: string) => void;
  unresolvedIncidentsCount?: number;
  /** This station, the stations currently connected, and the link to the server */
  station: string;
  stations: StationInfo[];
  connection: ConnectionStatus;
  onLogout: () => void;
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
  onShiftChange,
  hqName,
  onHqNameChange,
  unresolvedIncidentsCount = 0,
  station,
  stations,
  connection,
  onLogout,
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
            <HqName name={hqName} onChange={onHqNameChange} />
            <ShiftLine commanderName={commanderName} shiftName={shiftName} onChange={onShiftChange} />
          </div>
        </div>

        <nav aria-label="ניווט ראשי" className="order-3 flex w-full gap-1 overflow-x-auto lg:order-none lg:w-auto lg:flex-1 lg:justify-center">
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

          <StationsIndicator station={station} stations={stations} connection={connection} />

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
          <button
            onClick={onLogout}
            className="rounded border border-slate-700 p-1.5 text-slate-300 hover:bg-white/5"
            aria-label="יציאה מהעמדה"
            title="יציאה מהעמדה"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** "משמרת ב' · מפקד: ..." — double-click to change the shift and its commander */
function ShiftLine({
  commanderName,
  shiftName,
  onChange,
}: {
  commanderName: string;
  shiftName: string;
  onChange: (shift: { commanderName: string; shiftName: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [commander, setCommander] = useState(commanderName);
  const [shift, setShift] = useState(shiftName);
  const valid = commander.trim() !== '' && shift.trim() !== '';

  if (!editing) {
    return (
      <div
        onDoubleClick={() => {
          setCommander(commanderName);
          setShift(shiftName);
          setEditing(true);
        }}
        title="לחיצה כפולה לשינוי משמרת ומפקד"
        className="cursor-default select-none text-[11px] text-slate-400 hover:text-slate-200"
      >
        משמרת {shiftName} · מפקד: {commanderName}
      </div>
    );
  }

  const input = 'rounded border border-slate-700 bg-black/40 px-1.5 py-0.5 text-[11px] text-slate-100 outline-none focus:border-cyan-400';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onChange({ commanderName: commander.trim(), shiftName: shift.trim() });
        setEditing(false);
      }}
      onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
      className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"
    >
      משמרת
      <input className={`${input} w-10`} value={shift} onChange={(e) => setShift(e.target.value)} aria-label="משמרת" />
      מפקד
      <input
        className={`${input} w-28`}
        value={commander}
        onChange={(e) => setCommander(e.target.value)}
        aria-label="מפקד משמרת"
        autoFocus
      />
      <button type="submit" disabled={!valid} className="rounded bg-cyan-600 p-0.5 text-white disabled:opacity-40" aria-label="שמירה">
        <Check size={12} />
      </button>
      <button type="button" onClick={() => setEditing(false)} className="rounded p-0.5 hover:bg-white/10" aria-label="ביטול">
        <X size={12} />
      </button>
    </form>
  );
}

/** "עמדה 1 · 3 עמדות" with a live dot; hover lists every connected station */
function StationsIndicator({
  station,
  stations,
  connection,
}: {
  station: string;
  stations: StationInfo[];
  connection: ConnectionStatus;
}) {
  const online = connection === 'online';
  const list = stations.map((s) => (s.connections > 1 ? `${s.name} (${s.connections})` : s.name)).join('\n');
  return (
    <div
      className="flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
      title={online ? `עמדות מחוברות:\n${list}` : 'מנותק מהשרת'}
      aria-label={online ? `עמדה ${station}, ${stations.length} עמדות מחוברות` : 'מנותק מהשרת'}
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'animate-pulse bg-red-500'}`} />
      <span className="max-w-[9rem] truncate font-semibold">{station}</span>
      {online && (
        <span className="hidden items-center gap-1 text-slate-400 sm:flex">
          · <Users size={12} /> {stations.length}
        </span>
      )}
    </div>
  );
}

/** The command post's name — double-click to rename */
function HqName({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!editing) {
    return (
      <div
        onDoubleClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        title="לחיצה כפולה לשינוי שם"
        className="cursor-default select-none text-sm font-extrabold tracking-wide text-slate-100"
      >
        {name}
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim() && draft.trim() !== name) onChange(draft.trim());
        setEditing(false);
      }}
      className="flex items-center gap-1"
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        onBlur={() => setEditing(false)}
        maxLength={60}
        aria-label='שם החפ"ק'
        className={`w-44 rounded border bg-black/40 px-1.5 py-0.5 text-sm font-bold text-slate-100 outline-none ${
          draft.trim() ? 'border-cyan-500' : 'border-red-500'
        }`}
      />
    </form>
  );
}
