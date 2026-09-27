import { FormEvent, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { WorshipReport } from '../types/tactical';
import { ActionResult, WorshipFields, WorshipPatch } from '../shared/protocol';
import { changedFields } from '../shared/diff';
import { byReportTime, fmt, worshipSummary } from '../shared/buses';
import { formatDate, hhmm, parseHHMM } from '../utils/time';
import { DeleteButton, Field, InlineEditor, ModalShell, fieldClass } from './ui';

interface Props {
  reports: WorshipReport[];
  onAdd: (fields: WorshipFields) => Promise<ActionResult>;
  onUpdate: (id: string, patch: WorshipPatch) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const isCount = (v: string) => /^\d{1,8}$/.test(v);

/** Worshipper status: reports of time and number of worshippers, newest first, with the change between them */
export function WorshipModal({ reports, onAdd, onUpdate, onDelete, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const summary = worshipSummary(reports);
  // Newest first; the change is against the report before it in time
  const chronological = [...reports].sort(byReportTime);
  const rows = chronological.map((r, i) => ({ r, change: i > 0 ? r.count - chronological[i - 1].count : null })).reverse();

  return (
    <ModalShell title="סטטוס מתפללים" icon={<UsersRound size={18} />} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="דיווח אחרון" value={summary.latest ? fmt(summary.latest.count) : '—'} sub={summary.latest?.time ?? ''} />
          <Stat
            label="שינוי מהקודם"
            value={summary.change === null ? '—' : `${summary.change > 0 ? '+' : ''}${fmt(summary.change)}`}
            sub=""
          />
          <Stat label="שיא" value={summary.peak ? fmt(summary.peak.count) : '—'} sub={summary.peak?.time ?? ''} />
        </div>

        <AddReport onAdd={onAdd} />

        <div className="overflow-hidden rounded border border-slate-800">
          <div className="grid grid-cols-[5rem_7rem_6rem_1fr] gap-2 bg-black/30 px-3 py-1.5 text-[11px] font-bold text-slate-400">
            <span>שעה</span>
            <span>מתפללים</span>
            <span>שינוי</span>
            <span>הערה</span>
          </div>
          {rows.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">עוד אין דיווחים</p>}
          {rows.map(({ r, change }) =>
            editingId === r.id ? (
              <div key={r.id} className="p-2">
                <ReportEditor
                  report={r}
                  onSave={(fields) => {
                    const patch = changedFields(r, fields);
                    if (Object.keys(patch).length) onUpdate(r.id, patch);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => {
                    onDelete(r.id);
                    setEditingId(null);
                  }}
                />
              </div>
            ) : (
              <div
                key={r.id}
                data-report={r.id}
                onDoubleClick={() => editingId === null && setEditingId(r.id)}
                title="לחיצה כפולה לעריכה"
                className="grid cursor-default select-none grid-cols-[5rem_7rem_6rem_1fr] items-center gap-2 border-t border-slate-800 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                <span className="font-mono text-slate-300" dir="ltr">
                  {r.time}
                </span>
                <span className="font-mono text-sm font-bold text-cyan-200" dir="ltr">
                  {fmt(r.count)}
                </span>
                <span className={`font-mono ${change === null ? 'text-slate-600' : change >= 0 ? 'text-emerald-300' : 'text-amber-300'}`} dir="ltr">
                  {change === null ? '—' : `${change > 0 ? '+' : ''}${fmt(change)}`}
                </span>
                <span className="truncate text-slate-400">
                  {r.note}
                  {r.date && <span className="ms-2 text-[10px] text-slate-600">{formatDate(r.date)}</span>}
                </span>
              </div>
            )
          )}
        </div>
        <p className="text-[11px] text-slate-500">לחיצה כפולה על דיווח לתיקון או למחיקה.</p>
      </div>
    </ModalShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border border-slate-800 bg-black/20 p-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="font-mono text-xl font-bold text-cyan-200" dir="ltr">
        {value}
      </div>
      <div className="font-mono text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

/** The quick report: time (now by default) and number of worshippers */
function AddReport({ onAdd }: { onAdd: (fields: WorshipFields) => Promise<ActionResult> }) {
  const [time, setTime] = useState(() => hhmm(new Date()));
  const [count, setCount] = useState('');
  const [note, setNote] = useState('');
  const timeOk = parseHHMM(time) !== null;
  const countOk = isCount(count);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!timeOk || !countOk) return;
    const res = await onAdd({ time, count: Number(count), note: note.trim() });
    if (res.ok) {
      setCount('');
      setNote('');
      setTime(hhmm(new Date()));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded border border-cyan-800/60 bg-cyan-500/5 p-2" data-edit-control>
      <Field label="שעה">
        <input className={`${fieldClass(!timeOk)} w-20 font-mono`} value={time} onChange={(e) => setTime(e.target.value.trim())} dir="ltr" />
      </Field>
      <Field label="כמות מתפללים">
        <input
          className={`${fieldClass(count !== '' && !countOk)} w-28 font-mono`}
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/[,\s]/g, ''))}
          inputMode="numeric"
          dir="ltr"
          autoFocus
        />
      </Field>
      <Field label="הערה" className="min-w-40 flex-1">
        <input className={fieldClass()} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>
      <button
        type="submit"
        disabled={!timeOk || !countOk}
        className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-40"
      >
        הוספת דיווח
      </button>
    </form>
  );
}

function ReportEditor({
  report,
  onSave,
  onCancel,
  onDelete,
}: {
  report: WorshipReport;
  onSave: (fields: WorshipFields) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [time, setTime] = useState(report.time);
  const [count, setCount] = useState(String(report.count));
  const [note, setNote] = useState(report.note);
  const invalid = parseHHMM(time) === null || !isCount(count);
  return (
    <InlineEditor
      onSubmit={() => onSave({ time, count: Number(count), note: note.trim() })}
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-3"
      extraActions={<DeleteButton onConfirm={onDelete} question="למחוק את הדיווח?" />}
    >
      <Field label="שעה">
        <input className={`${fieldClass(parseHHMM(time) === null)} font-mono`} value={time} onChange={(e) => setTime(e.target.value.trim())} dir="ltr" autoFocus />
      </Field>
      <Field label="כמות מתפללים">
        <input className={`${fieldClass(!isCount(count))} font-mono`} value={count} onChange={(e) => setCount(e.target.value.replace(/[,\s]/g, ''))} dir="ltr" />
      </Field>
      <Field label="הערה">
        <input className={fieldClass()} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>
    </InlineEditor>
  );
}
