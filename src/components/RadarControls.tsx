import type { ReactNode } from 'react';
import { Crosshair, FileLock2, Maximize2, Minimize2, Timer, Zap } from 'lucide-react';
import { Panel } from './ui';
import { playClick } from '../utils/audio';

interface Props {
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onOpenSimModal: () => void;
  onOpenBlackBoxLogs: () => void;
  audioEnabled: boolean;
  activePhaseRemaining: string;
  nextPhaseCountdown: string;
}

export function RadarControls({
  onToggleFullscreen,
  isFullscreen,
  onOpenSimModal,
  onOpenBlackBoxLogs,
  audioEnabled,
  activePhaseRemaining,
  nextPhaseCountdown,
}: Props) {
  const withClick = (fn: () => void) => () => {
    if (audioEnabled) playClick();
    fn();
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel title="שעוני יעד" icon={<Timer size={16} />}>
        <div className="flex flex-col gap-3">
          <Countdown label="זמן נותר לשלב הפעיל" value={activePhaseRemaining} tone="text-emerald-300" />
          <Countdown label="ספירה לשלב הבא" value={nextPhaseCountdown} tone="text-amber-300" />
        </div>
      </Panel>

      <Panel title="מכ״ם גזרה" icon={<Crosshair size={16} />}>
        <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-full border border-cyan-700/60 bg-[#06101f]">
          {[25, 50, 75].map((r) => (
            <span
              key={r}
              className="absolute rounded-full border border-cyan-800/60"
              style={{ inset: `${r / 2}%` }}
            />
          ))}
          <span className="absolute inset-x-0 top-1/2 h-px bg-cyan-800/60" />
          <span className="absolute inset-y-0 left-1/2 w-px bg-cyan-800/60" />
          <div
            className="radar-sweep absolute inset-0"
            style={{ background: 'conic-gradient(from 0deg, rgba(34,211,238,0.35), transparent 60deg)' }}
          />
          {[
            [30, 35, 'bg-red-500'],
            [62, 28, 'bg-emerald-400'],
            [70, 64, 'bg-emerald-400'],
            [40, 72, 'bg-amber-400'],
          ].map(([x, y, c], i) => (
            <span
              key={i}
              className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full ${c}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
        </div>
      </Panel>

      <Panel title="שליטה מהירה" icon={<Zap size={16} />}>
        <div className="grid grid-cols-1 gap-2">
          <ControlButton onClick={withClick(onOpenSimModal)} tone="red" icon={<Zap size={14} />}>
            הפעלת תרגיל קיצון
          </ControlButton>
          <ControlButton onClick={withClick(onOpenBlackBoxLogs)} icon={<FileLock2 size={14} />}>
            קופסה שחורה - יומן חתום
          </ControlButton>
          <ControlButton
            onClick={withClick(onToggleFullscreen)}
            icon={isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          >
            {isFullscreen ? 'יציאה ממסך מלא' : 'מצב מסך מלא (וידאו-וול)'}
          </ControlButton>
        </div>
      </Panel>
    </div>
  );
}

function Countdown({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded border border-slate-800 bg-black/30 p-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`font-mono text-3xl font-bold tracking-wider ${tone}`} dir="ltr">
        {value}
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
