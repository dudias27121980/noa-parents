import { FormEvent, useState } from 'react';
import { CheckCircle2, Clock3, Flag, Plus, RotateCcw, Square, SquareCheck, X } from 'lucide-react';
import { Milestone, MilestoneStatus, MilestoneTask } from '../types/tactical';
import { TaskPatch } from '../shared/protocol';
import { ModalShell, fieldClass } from './ui';
import { STATUS_STYLE } from './MilestonesTimeline';
import { playClick, playCompleteChime } from '../utils/audio';
import { milestoneProgress, windowLabel } from '../utils/schedule';

interface Props {
  milestone: Milestone;
  onClose: () => void;
  onUpdateStatus: (id: string, status: MilestoneStatus) => void;
  onAddTask: (milestoneId: string, text: string) => void;
  onUpdateTask: (milestoneId: string, taskId: string, patch: TaskPatch) => void;
  onDeleteTask: (milestoneId: string, taskId: string) => void;
  audioEnabled: boolean;
}

export function MilestoneModal({
  milestone,
  onClose,
  onUpdateStatus,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  audioEnabled,
}: Props) {
  const s = STATUS_STYLE[milestone.statusType];
  const now = new Date(); // parent re-renders every second
  const progress = milestoneProgress(milestone, now);
  const done = milestone.tasks.filter((t) => t.done).length;
  const [newTask, setNewTask] = useState('');

  const setStatus = (status: MilestoneStatus) => {
    if (audioEnabled) (status === 'completed' ? playCompleteChime : playClick)();
    onUpdateStatus(milestone.id, status);
    onClose();
  };

  const addTask = (e: FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    if (audioEnabled) playClick();
    onAddTask(milestone.id, newTask.trim());
    setNewTask('');
  };

  return (
    <ModalShell title={milestone.title} icon={<Flag size={18} />} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono" dir="ltr">{milestone.code}</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${s.badge}`}>{milestone.statusBadge}</span>
          <span className="flex items-center gap-1 text-slate-400">
            <Clock3 size={12} />
            <span className="font-mono" dir="ltr">
              {windowLabel(milestone)}
            </span>
          </span>
          {milestone.owner && <span className="text-slate-400">אחראי: {milestone.owner}</span>}
        </div>
        {milestone.description && <p className="text-slate-300">{milestone.description}</p>}

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-400">
            <span>משימות</span>
            <span className="font-mono">
              {done}/{milestone.tasks.length} בוצעו
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {milestone.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={() => {
                  if (audioEnabled) playClick();
                  onUpdateTask(milestone.id, t.id, { done: !t.done });
                }}
                onRename={(text) => onUpdateTask(milestone.id, t.id, { text })}
                onDelete={() => onDeleteTask(milestone.id, t.id)}
              />
            ))}
            {milestone.tasks.length === 0 && <li className="text-xs text-slate-500">אין משימות לשלב הזה</li>}
          </ul>
          <form onSubmit={addTask} className="mt-2 flex gap-2">
            <input
              className={fieldClass()}
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="משימה חדשה…"
              aria-label="משימה חדשה"
              maxLength={200}
            />
            <button
              type="submit"
              disabled={!newTask.trim()}
              className="flex shrink-0 items-center gap-1 rounded border border-cyan-600/60 px-3 text-xs font-bold text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-40"
            >
              <Plus size={14} /> הוספה
            </button>
          </form>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
            <div className={`h-full ${s.bar}`} style={{ width: `${progress}%` }} />
          </div>
          <span className="font-mono text-xs">{progress}%</span>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          {milestone.statusType === 'completed' ? (
            <button
              onClick={() => setStatus('scheduled')}
              className="flex items-center gap-1 rounded border border-amber-400/60 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10"
            >
              <RotateCcw size={14} /> ביטול השלמה
            </button>
          ) : (
            <button
              onClick={() => setStatus('completed')}
              className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <CheckCircle2 size={14} /> סמן שלב כהושלם
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

/** One task: click the box to toggle, double-click the text to rename, × to delete */
function TaskRow({
  task,
  onToggle,
  onRename,
  onDelete,
}: {
  task: MilestoneTask;
  onToggle: () => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);

  return (
    <li className="group flex items-center gap-2 rounded bg-black/30 px-2 py-1.5 text-xs text-slate-200">
      <button
        onClick={onToggle}
        className={task.done ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}
        aria-label={task.done ? `בוצע: ${task.text}` : `לא בוצע: ${task.text}`}
        aria-pressed={task.done}
      >
        {task.done ? <SquareCheck size={16} /> : <Square size={16} />}
      </button>
      {editing ? (
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && text.trim() !== task.text) onRename(text.trim());
            setEditing(false);
          }}
        >
          <input
            autoFocus
            className={fieldClass(!text.trim())}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation(); // close the editor, not the whole window
                setText(task.text);
                setEditing(false);
              }
            }}
            onBlur={() => {
              setText(task.text);
              setEditing(false);
            }}
            aria-label="עריכת משימה"
            maxLength={200}
          />
        </form>
      ) : (
        <span
          onDoubleClick={() => {
            setText(task.text);
            setEditing(true);
          }}
          title="לחיצה כפולה לעריכה"
          className={`flex-1 cursor-default select-none ${task.done ? 'text-slate-400 line-through' : ''}`}
        >
          {task.text}
        </span>
      )}
      <button
        onClick={onDelete}
        className="rounded p-0.5 text-slate-600 opacity-0 hover:bg-red-500/15 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
        aria-label={`מחיקת משימה: ${task.text}`}
        title="מחיקת משימה"
      >
        <X size={14} />
      </button>
    </li>
  );
}
