import { useState } from 'react';
import { CheckCircle2, CircleDot, Clock3, Flag, Info, Plus, Trash2 } from 'lucide-react';
import { Milestone, MilestoneStatus } from '../types/tactical';
import { Field, InlineEditor, Panel, fieldClass } from './ui';
import { playClick } from '../utils/audio';
import { endTime, milestoneProgress } from '../utils/schedule';
import { parseHHMM } from '../utils/time';

export type MilestonePatch = Partial<
  Pick<Milestone, 'code' | 'title' | 'scheduledTime' | 'durationMin' | 'owner' | 'description'>
>;

interface Props {
  milestones: Milestone[];
  /** Browser clock, ticking from App */
  now: Date;
  onSelectMilestone: (m: Milestone) => void;
  onAdvanceMilestone: (id: string) => void;
  onUpdateMilestone: (id: string, patch: MilestonePatch, isNew: boolean) => void;
  /** Appends a row and returns its id so it opens straight in edit mode */
  onAddMilestone: () => string;
  /** discardDraft: an unsaved '+' row being thrown away (not a real deletion) */
  onDeleteMilestone: (id: string, discardDraft?: boolean) => void;
  audioEnabled: boolean;
}

export const STATUS_STYLE: Record<MilestoneStatus, { dot: string; badge: string; bar: string }> = {
  completed: { dot: 'bg-emerald-500 border-emerald-300', badge: 'bg-emerald-500/15 text-emerald-300', bar: 'bg-emerald-500' },
  active: { dot: 'bg-cyan-400 border-cyan-200 animate-pulse', badge: 'bg-cyan-500/20 text-cyan-200', bar: 'bg-cyan-400' },
  next: { dot: 'bg-amber-400 border-amber-200', badge: 'bg-amber-400/15 text-amber-200', bar: 'bg-amber-400' },
  scheduled: { dot: 'bg-slate-600 border-slate-400', badge: 'bg-slate-600/30 text-slate-300', bar: 'bg-slate-500' },
};

export function MilestonesTimeline({
  milestones,
  now,
  onSelectMilestone,
  onAdvanceMilestone,
  onUpdateMilestone,
  onAddMilestone,
  onDeleteMilestone,
  audioEnabled,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // A row created by "+" that was never saved is removed again on cancel
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const done = milestones.filter((m) => m.statusType === 'completed').length;

  const click = () => audioEnabled && playClick();

  const closeEditor = (saved: boolean) => {
    if (!saved && editingId && editingId === newRowId) onDeleteMilestone(editingId, true);
    setEditingId(null);
    setNewRowId(null);
  };

  return (
    <Panel
      title="אבני דרך ומשימות קרב"
      icon={<Flag size={16} />}
      actions={
        <span className="text-xs text-slate-400">
          <span className="hidden sm:inline">לחיצה כפולה על שורה לעריכה · </span>
          <span className="font-mono text-emerald-300">{done}</span>/{milestones.length} הושלמו
        </span>
      }
    >
      <ol className="relative flex flex-col gap-3 border-s-2 border-cyan-900/60 ps-5">
        {milestones.map((m) => {
          const s = STATUS_STYLE[m.statusType];
          const progress = milestoneProgress(m, now);
          return (
            <li key={m.id} className="relative">
              <span className={`absolute -start-[27px] top-3 h-3.5 w-3.5 rounded-full border-2 ${s.dot}`} />
              {editingId === m.id ? (
                <MilestoneEditor
                  milestone={m}
                  isNew={m.id === newRowId}
                  onSave={(patch) => {
                    click();
                    onUpdateMilestone(m.id, patch, m.id === newRowId);
                    closeEditor(true);
                  }}
                  onCancel={() => closeEditor(false)}
                  onDelete={() => {
                    click();
                    onDeleteMilestone(m.id);
                    setEditingId(null);
                    setNewRowId(null);
                  }}
                />
              ) : (
                <div
                  onDoubleClick={() => {
                    if (editingId) return; // one editor at a time
                    click();
                    setEditingId(m.id);
                  }}
                  title="לחיצה כפולה לעריכה"
                  className={`cursor-default select-none rounded border p-3 transition hover:border-cyan-700/70 ${
                    m.statusType === 'active' ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-slate-800 bg-black/20'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300" dir="ltr">
                        {m.code}
                      </span>
                      <span className="text-sm font-bold text-slate-100">{m.title}</span>
                      <button
                        onClick={() => {
                          click();
                          onSelectMilestone(m);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-cyan-200"
                        aria-label="פרטים"
                        title="פרטים ומשימות"
                      >
                        <Info size={14} />
                      </button>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${s.badge}`}>{m.statusBadge}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock3 size={12} />
                      <span className="font-mono" dir="ltr">
                        {m.scheduledTime}–{endTime(m, now)}
                      </span>
                      <span>({m.durationMin} דק׳)</span>
                    </span>
                    <span>אחראי: {m.owner}</span>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                      <div className={`h-full ${s.bar} transition-all`} style={{ width: `${progress}%` }} />
                    </div>
                    <span className="w-9 font-mono text-[11px] text-slate-300">{progress}%</span>
                    {m.statusType === 'active' && (
                      <button
                        onClick={() => onAdvanceMilestone(m.id)}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 rounded border border-emerald-500/60 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20"
                      >
                        <CheckCircle2 size={12} /> סמן כהושלם
                      </button>
                    )}
                    {m.statusType === 'next' && <CircleDot size={14} className="text-amber-300" />}
                  </div>
                </div>
              )}
            </li>
          );
        })}

        {/* Last row: add a new schedule line */}
        <li className="relative">
          <span className="absolute -start-[27px] top-3 h-3.5 w-3.5 rounded-full border-2 border-dashed border-slate-500 bg-[#0b1426]" />
          <button
            onClick={() => {
              if (editingId) return;
              click();
              const id = onAddMilestone();
              setNewRowId(id);
              setEditingId(id);
            }}
            disabled={!!editingId}
            className="flex w-full items-center justify-center gap-2 rounded border-2 border-dashed border-cyan-800/70 p-3 text-sm font-bold text-cyan-300/80 transition hover:border-cyan-500 hover:bg-cyan-500/5 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={18} /> הוספת שורה ללו״ז
          </button>
        </li>
      </ol>
    </Panel>
  );
}

function MilestoneEditor({
  milestone,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  milestone: Milestone;
  isNew: boolean;
  onSave: (patch: MilestonePatch) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [code, setCode] = useState(milestone.code);
  const [title, setTitle] = useState(milestone.title);
  const [time, setTime] = useState(milestone.scheduledTime);
  const [duration, setDuration] = useState(String(milestone.durationMin));
  const [owner, setOwner] = useState(milestone.owner);
  const [description, setDescription] = useState(milestone.description);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const durationNum = Number(duration);
  const errors = {
    title: !title.trim(),
    time: parseHHMM(time) === null,
    duration: !Number.isInteger(durationNum) || durationNum < 1 || durationNum > 24 * 60,
  };
  const invalid = errors.title || errors.time || errors.duration;

  const save = () =>
    onSave({
      code: code.trim() || milestone.code,
      title: title.trim(),
      scheduledTime: time,
      durationMin: durationNum,
      owner: owner.trim(),
      description: description.trim(),
    });

  return (
    <InlineEditor
      onSubmit={save}
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-2 sm:grid-cols-6"
      extraActions={
        confirmDelete ? (
          <span className="flex items-center gap-2 text-xs text-red-300">
            למחוק את השורה?
            <button type="button" onClick={onDelete} className="rounded bg-red-600 px-2 py-1 font-bold text-white hover:bg-red-500">
              מחק
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-slate-400 hover:text-slate-200">
              לא
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => (isNew ? onCancel() : setConfirmDelete(true))}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
          >
            <Trash2 size={13} /> מחיקה
          </button>
        )
      }
    >
      <Field label="קוד" className="sm:col-span-1">
        <input className={fieldClass()} value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
      </Field>
      <Field label="כותרת *" className="sm:col-span-3">
        <input className={fieldClass(errors.title)} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <Field label="שעת התחלה *" className="sm:col-span-1">
        <input type="time" className={fieldClass(errors.time)} value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" />
      </Field>
      <Field label="משך (דק׳) *" className="sm:col-span-1">
        <input
          type="number"
          min={1}
          max={1440}
          className={fieldClass(errors.duration)}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          dir="ltr"
        />
      </Field>
      <Field label="אחראי" className="col-span-2 sm:col-span-2">
        <input className={fieldClass()} value={owner} onChange={(e) => setOwner(e.target.value)} />
      </Field>
      <Field label="תיאור" className="col-span-2 sm:col-span-4">
        <input className={fieldClass()} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </InlineEditor>
  );
}
