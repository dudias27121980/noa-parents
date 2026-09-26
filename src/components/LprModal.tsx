import { useState } from 'react';
import { AlertTriangle, Camera, Car, CheckCircle2, RotateCcw } from 'lucide-react';
import { LprHit } from '../types/tactical';
import { LprFields, LprPatch } from '../shared/protocol';
import { changedFields } from '../shared/diff';
import { formatDate } from '../utils/time';
import { AddTile, DeleteButton, Field, InlineEditor, ModalShell, fieldClass } from './ui';

interface Props {
  hits: LprHit[];
  onAdd: (fields: LprFields) => void;
  onUpdate: (id: string, patch: LprPatch) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const EMPTY: LprHit = { id: 'draft', date: '', time: '', plate: '', vehicle: '', camera: '', reason: '', status: 'open' };

// The alarm is played by the opener (on click), not on mount: a mount effect fires twice under
// StrictMode and replays whenever the audio toggle changes while the modal is open.
export function LprModal({ hits, onAdd, onUpdate, onDelete, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const busy = editingId !== null || adding;
  // Open alerts first, newest first within each group
  const sorted = [...hits].sort(
    (a, b) => Number(a.status === 'handled') - Number(b.status === 'handled') || `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)
  );

  return (
    <ModalShell title="התראות LPR - זיהוי לוחיות רישוי" icon={<AlertTriangle size={18} />} onClose={onClose} tone="red" wide>
      <div className="flex flex-col gap-2">
        {sorted.map((h) =>
          editingId === h.id ? (
            <LprEditor
              key={h.id}
              hit={h}
              onSave={(fields, base) => {
                const patch = changedFields(base, fields);
                if (Object.keys(patch).length) onUpdate(h.id, patch);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              onDelete={() => {
                onDelete(h.id);
                setEditingId(null);
              }}
            />
          ) : (
            <div
              key={h.id}
              onDoubleClick={() => !busy && setEditingId(h.id)}
              title="לחיצה כפולה לעריכה"
              className={`flex cursor-default select-none flex-wrap items-center gap-3 rounded border p-3 text-xs ${
                h.status === 'handled' ? 'border-slate-800 bg-black/20 opacity-60' : 'border-red-500/70 bg-red-500/10'
              }`}
            >
              <div className="rounded border-2 border-yellow-400 bg-yellow-300 px-2 py-1 font-mono text-sm font-bold text-black" dir="ltr">
                {h.plate}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-semibold text-slate-100">
                  <Car size={12} /> {h.vehicle || '—'}
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <Camera size={12} /> {h.camera || '—'}
                </div>
              </div>
              <span className="rounded bg-red-500/20 px-2 py-0.5 font-bold text-red-200">{h.reason}</span>
              <span className="font-mono text-slate-400" dir="ltr">
                {formatDate(h.date)} {h.time}
              </span>
              <button
                onClick={() => onUpdate(h.id, { status: h.status === 'open' ? 'handled' : 'open' })}
                onDoubleClick={(e) => e.stopPropagation()}
                className={`flex items-center gap-1 rounded border px-2 py-1 font-bold ${
                  h.status === 'open'
                    ? 'border-emerald-500/60 text-emerald-200 hover:bg-emerald-500/15'
                    : 'border-slate-600 text-slate-300 hover:bg-white/5'
                }`}
              >
                {h.status === 'open' ? (
                  <>
                    <CheckCircle2 size={12} /> טופל
                  </>
                ) : (
                  <>
                    <RotateCcw size={12} /> פתח מחדש
                  </>
                )}
              </button>
            </div>
          )
        )}
        {hits.length === 0 && !adding && <p className="text-center text-xs text-slate-500">אין התראות LPR</p>}
        {adding ? (
          <LprEditor
            hit={EMPTY}
            isNew
            onSave={(fields) => {
              onAdd(fields);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <AddTile label="הוספת התראת LPR" disabled={busy} onClick={() => setAdding(true)} />
        )}
        <p className="text-[11px] text-slate-500">לחיצה כפולה על התראה לעריכה. התראה חדשה מקפיצה התראה בכל העמדות.</p>
      </div>
    </ModalShell>
  );
}

function LprEditor({
  hit,
  isNew = false,
  onSave,
  onCancel,
  onDelete,
}: {
  hit: LprHit;
  isNew?: boolean;
  onSave: (fields: LprFields, base: LprHit) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [base] = useState(hit);
  const [plate, setPlate] = useState(hit.plate);
  const [vehicle, setVehicle] = useState(hit.vehicle);
  const [camera, setCamera] = useState(hit.camera);
  const [reason, setReason] = useState(hit.reason);
  const invalid = !plate.trim() || !reason.trim();

  return (
    <InlineEditor
      onSubmit={() => onSave({ plate: plate.trim(), vehicle: vehicle.trim(), camera: camera.trim(), reason: reason.trim() }, base)}
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-2"
      extraActions={onDelete && !isNew ? <DeleteButton onConfirm={onDelete} question="למחוק את ההתראה?" /> : undefined}
    >
      <Field label="מספר רישוי *">
        <input className={`${fieldClass(!plate.trim())} font-mono`} value={plate} onChange={(e) => setPlate(e.target.value)} autoFocus dir="ltr" maxLength={20} />
      </Field>
      <Field label="סיבה *">
        <input className={fieldClass(!reason.trim())} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="רשימת מעקב, רכב גנוב…" maxLength={60} />
      </Field>
      <Field label="רכב">
        <input className={fieldClass()} value={vehicle} onChange={(e) => setVehicle(e.target.value)} maxLength={60} />
      </Field>
      <Field label="מצלמה">
        <input className={fieldClass()} value={camera} onChange={(e) => setCamera(e.target.value)} maxLength={80} />
      </Field>
    </InlineEditor>
  );
}
