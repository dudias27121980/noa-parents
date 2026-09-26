import { CheckCircle2, Clock3, Flag } from 'lucide-react';
import { Milestone, MilestoneStatus } from '../types/tactical';
import { ModalShell } from './ui';
import { STATUS_STYLE } from './MilestonesTimeline';
import { playClick, playCompleteChime } from '../utils/audio';

interface Props {
  milestone: Milestone;
  onClose: () => void;
  onUpdateStatus: (id: string, status: MilestoneStatus) => void;
  audioEnabled: boolean;
}

export function MilestoneModal({ milestone, onClose, onUpdateStatus, audioEnabled }: Props) {
  const s = STATUS_STYLE[milestone.statusType];

  const update = (status: MilestoneStatus) => {
    if (audioEnabled) (status === 'completed' ? playCompleteChime : playClick)();
    onUpdateStatus(milestone.id, status);
    onClose();
  };

  return (
    <ModalShell title={milestone.title} icon={<Flag size={18} />} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono" dir="ltr">{milestone.code}</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${s.badge}`}>{milestone.statusBadge}</span>
          <span className="flex items-center gap-1 text-slate-400">
            <Clock3 size={12} /> <span className="font-mono">{milestone.scheduledTime}</span>
          </span>
          <span className="text-slate-400">אחראי: {milestone.owner}</span>
        </div>
        <p className="text-slate-300">{milestone.description}</p>
        <div>
          <div className="mb-1 text-xs font-bold text-slate-400">משימות</div>
          <ul className="flex flex-col gap-1">
            {milestone.tasks.map((t) => (
              <li key={t} className="flex items-center gap-2 rounded bg-black/30 px-2 py-1.5 text-xs text-slate-200">
                <CheckCircle2
                  size={14}
                  className={milestone.statusType === 'completed' ? 'text-emerald-400' : 'text-slate-600'}
                />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
            <div className={`h-full ${s.bar}`} style={{ width: `${milestone.progressPercent}%` }} />
          </div>
          <span className="font-mono text-xs">{milestone.progressPercent}%</span>
        </div>
        {milestone.statusType !== 'completed' && (
          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <button
              onClick={() => update('completed')}
              className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <CheckCircle2 size={14} /> סמן כהושלם
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
