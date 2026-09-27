import { ReactNode, useEffect, useState } from 'react';
import { Crosshair, HardDrive, Maximize2, Minimize2, RotateCcw, Timer, Zap } from 'lucide-react';
import { Panel } from './ui';
import { playClick } from '../utils/audio';
import { formatDuration } from '../utils/time';
import radarSector from '../assets/radar-sector.webp';

interface Props {
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onOpenSimModal: () => void;
  onResetData: () => void;
  audioEnabled: boolean;
  /** Seconds until the active phase ends / the next phase starts (negative = overdue), null = none */
  activePhaseRemainingSec: number | null;
  nextPhaseCountdownSec: number | null;
}

export function RadarControls({
  onToggleFullscreen,
  isFullscreen,
  onOpenSimModal,
  onResetData,
  audioEnabled,
  activePhaseRemainingSec,
  nextPhaseCountdownSec,
}: Props) {
  // Reset wipes everything saved in the browser, so it takes a second click to confirm
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const withClick = (fn: () => void) => () => {
    if (audioEnabled) playClick();
    fn();
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel title="שעוני יעד" icon={<Timer size={16} />}>
        <div className="flex flex-col gap-3">
          <Countdown label="זמן נותר לשלב הפעיל" overdueLabel="חריגה בשלב הפעיל" seconds={activePhaseRemainingSec} tone="text-emerald-300" />
          <Countdown label="ספירה לשלב הבא" overdueLabel="השלב הבא באיחור" seconds={nextPhaseCountdownSec} tone="text-amber-300" />
        </div>
      </Panel>

      <Panel title="מכ״ם גזרה" icon={<Crosshair size={16} />}>
        <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-full border border-cyan-500/60 bg-[#06101f] shadow-[0_0_18px_rgba(34,211,238,0.18)]">
          {/* Satellite image of the sector (Hebron - Kiryat Arba), darkened and tinted so the overlay stays readable */}
          <img
            src={radarSector}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-cover"
            style={{ filter: 'grayscale(0.35) saturate(0.85) brightness(0.6) contrast(1.2)' }}
          />
          <span className="absolute inset-0 bg-cyan-950/30 mix-blend-multiply" />
          <span
            className="absolute inset-0"
            style={{ background: 'radial-gradient(circle, transparent 45%, rgba(6,16,31,0.55) 75%, rgba(6,16,31,0.92) 100%)' }}
          />
          {[25, 50, 75].map((r) => (
            <span
              key={r}
              className="absolute rounded-full border border-cyan-300/35"
              style={{ inset: `${r / 2}%` }}
            />
          ))}
          <span className="absolute inset-x-0 top-1/2 h-px bg-cyan-300/35" />
          <span className="absolute inset-y-0 left-1/2 w-px bg-cyan-300/35" />
          <div
            className="radar-sweep absolute inset-0"
            style={{ background: 'conic-gradient(from 0deg, rgba(34,211,238,0.4), transparent 60deg)' }}
          />
          {[
            [30, 35, 'bg-red-500'],
            [62, 28, 'bg-emerald-400'],
            [70, 64, 'bg-emerald-400'],
            [40, 72, 'bg-amber-400'],
          ].map(([x, y, c], i) => (
            <span
              key={i}
              className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full ring-2 ring-black/70 ${c}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_6px_rgba(165,243,252,0.9)]" />
        </div>
      </Panel>

      <Panel title="שליטה מהירה" icon={<Zap size={16} />} className="edit-control-panel">
        <div className="grid grid-cols-1 gap-2">
          <ControlButton onClick={withClick(onOpenSimModal)} tone="red" icon={<Zap size={14} />}>
            הפעלת תרגיל קיצון
          </ControlButton>
          <ControlButton
            onClick={withClick(onToggleFullscreen)}
            icon={isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          >
            {isFullscreen ? 'יציאה ממסך מלא' : 'מצב מסך מלא (וידאו-וול)'}
          </ControlButton>
          <ControlButton
            onClick={withClick(() => {
              if (confirmReset) {
                setConfirmReset(false);
                onResetData();
              } else {
                setConfirmReset(true);
              }
            })}
            tone={confirmReset ? 'red' : 'cyan'}
            icon={<RotateCcw size={14} />}
          >
            {confirmReset ? 'לחץ שוב לאישור - יאפס את כל הנתונים' : 'איפוס לנתוני הדגמה'}
          </ControlButton>
          <div className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-500">
            <HardDrive size={11} /> השינויים נשמרים במחשב הזה - לגבות בכפתור ההורדה למעלה
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Countdown({
  label,
  overdueLabel,
  seconds,
  tone,
}: {
  label: string;
  overdueLabel: string;
  seconds: number | null;
  tone: string;
}) {
  const overdue = seconds !== null && seconds < 0;
  return (
    <div className={`rounded border p-2 ${overdue ? 'border-red-500/70 bg-red-500/10' : 'border-slate-800 bg-black/30'}`}>
      <div className={`text-[11px] ${overdue ? 'font-bold text-red-300' : 'text-slate-400'}`}>
        {overdue ? overdueLabel : label}
      </div>
      <div
        className={`font-mono text-3xl font-bold tracking-wider ${
          seconds === null ? 'text-slate-600' : overdue ? 'animate-pulse text-red-400' : tone
        }`}
        dir="ltr"
      >
        {seconds === null ? '--:--:--' : `${overdue ? '+' : ''}${formatDuration(seconds)}`}
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  icon,
  children,
  tone = 'cyan',
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  tone?: 'cyan' | 'red';
}) {
  const cls =
    tone === 'red'
      ? 'border-red-500/60 bg-red-500/10 text-red-200 hover:bg-red-500/20'
      : 'border-cyan-700/60 bg-cyan-500/5 text-cyan-100 hover:bg-cyan-500/15';
  return (
    <button onClick={onClick} className={`flex items-center gap-2 rounded border px-3 py-2 text-xs font-bold ${cls}`}>
      {icon}
      {children}
    </button>
  );
}
