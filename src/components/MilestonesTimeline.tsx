import { CheckCircle2, ChevronLeft, CircleDot, Clock3, Flag } from 'lucide-react';
import { Milestone, MilestoneStatus } from '../types/tactical';
import { Panel } from './ui';
import { playClick } from '../utils/audio';

interface Props {
  milestones: Milestone[];
  onSelectMilestone: (m: Milestone) => void;
  onAdvanceMilestone: (id: string) => void;
  audioEnabled: boolean;
}

export const STATUS_STYLE: Record<MilestoneStatus, { dot: string; badge: string; bar: string }> = {
  completed: { dot: 'bg-emerald-500 border-emerald-300', badge: 'bg-emerald-500/15 text-emerald-300', bar: 'bg-emerald-500' },
  active: { dot: 'bg-cyan-400 border-cyan-200 animate-pulse', badge: 'bg-cyan-500/20 text-cyan-200', bar: 'bg-cyan-400' },
  next: { dot: 'bg-amber-400 border-amber-200', badge: 'bg-amber-400/15 text-amber-200', bar: 'bg-amber-400' },
  scheduled: { dot: 'bg-slate-600 border-slate-400', badge: 'bg-slate-600/30 text-slate-300', bar: 'bg-slate-500' },
};

export function MilestonesTimeline({ milestones, onSelectMilestone, onAdvanceMilestone, audioEnabled }: Props) {
  const done = milestones.filter((m) => m.statusType === 'completed').length;

  return (
    <Panel
      title="אבני דרך ומשימות קרב"
      icon={<Flag size={16} />}
      actions={
        <span className="text-xs text-slate-400">
          <span className="font-mono text-emerald-300">{done}</span>/{milestones.length} הושלמו
        </span>
      }
    >
      <ol className="relative flex flex-col gap-3 border-s-2 border-cyan-900/60 ps-5">
        {milestones.map((m) => {
          const s = STATUS_STYLE[m.statusType];
          return (
            <li key={m.id} className="relative">
              <span className={`absolute -start-[27px] top-3 h-3.5 w-3.5 rounded-full border-2 ${s.dot}`} />
              <div
                className={`rounded border p-3 transition ${
                  m.statusType === 'active' ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-slate-800 bg-black/20'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      if (audioEnabled) playClick();
                      onSelectMilestone(m);
                    }}
                    className="flex items-center gap-2 text-start hover:text-cyan-200"
                  >
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300" dir="ltr">
                      {m.code}
                    </span>
                    <span className="text-sm font-bold text-slate-100">{m.title}</span>
                    <ChevronLeft size={14} className="text-slate-500" />
                  </button>
                  <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${s.badge}`}>{m.statusBadge}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock3 size={12} /> <span className="font-mono">{m.scheduledTime}</span>
                  </span>
                  <span>אחראי: {m.owner}</span>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                    <div className={`h-full ${s.bar} transition-all`} style={{ width: `${m.progressPercent}%` }} />
                  </div>
                  <span className="w-9 font-mono text-[11px] text-slate-300">{m.progressPercent}%</span>
                  {m.statusType === 'active' && (
                    <button
                      onClick={() => onAdvanceMilestone(m.id)}
                      className="flex items-center gap-1 rounded border border-emerald-500/60 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20"
                    >
                      <CheckCircle2 size={12} /> סמן כהושלם
                    </button>
                  )}
                  {m.statusType === 'next' && <CircleDot size={14} className="text-amber-300" />}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
