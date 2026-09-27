import { useState } from 'react';
import { SquareParking } from 'lucide-react';
import { ParkingLot, ParkingStatus } from '../types/tactical';
import { ParkingFields, ParkingPatch } from '../shared/protocol';
import { PARKING_STATUS_LABEL } from '../shared/labels';
import { changedFields } from '../shared/diff';
import { AddTile, DeleteButton, Field, InlineEditor, ModalShell, fieldClass } from './ui';

interface Props {
  lots: ParkingLot[];
  onAdd: (fields: ParkingFields) => void;
  onUpdate: (id: string, patch: ParkingPatch) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const PARKING_STATUSES: ParkingStatus[] = ['available', 'filling', 'full', 'closed'];

export const PARKING_TONE: Record<ParkingStatus, { card: string; active: string }> = {
  available: { card: 'border-emerald-500/50 bg-emerald-500/5', active: 'border-emerald-400 bg-emerald-500/25 text-emerald-100' },
  filling: { card: 'border-amber-400/60 bg-amber-400/5', active: 'border-amber-300 bg-amber-400/25 text-amber-100' },
  full: { card: 'border-red-500/70 bg-red-500/10', active: 'border-red-400 bg-red-500/30 text-red-100' },
  closed: { card: 'border-slate-600 bg-black/30', active: 'border-slate-400 bg-slate-500/30 text-slate-100' },
};

const EMPTY: ParkingLot = { id: 'draft', name: '', status: 'available', capacity: 0, occupied: 0, note: '', updated: '' };

/** The parking status picture: one card per lot, status changed with one click, details by double-click */
export function ParkingModal({ lots, onAdd, onUpdate, onDelete, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const busy = editingId !== null || adding;

  return (
    <ModalShell title="תמונת מצב חניונים" icon={<SquareParking size={18} />} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {lots.map((lot) =>
          editingId === lot.id ? (
            <ParkingEditor
              key={lot.id}
              lot={lot}
              onSave={(fields, base) => {
                const patch = changedFields(base, fields);
                if (Object.keys(patch).length) onUpdate(lot.id, patch);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              onDelete={() => {
                onDelete(lot.id);
                setEditingId(null);
              }}
            />
          ) : (
            <div
              key={lot.id}
              data-lot={lot.name}
              onDoubleClick={() => !busy && setEditingId(lot.id)}
              title="לחיצה כפולה לעריכה"
              className={`flex cursor-default select-none flex-col gap-2 rounded border p-3 text-xs ${PARKING_TONE[lot.status].card}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-slate-100">{lot.name}</span>
                {lot.capacity > 0 && (
                  <span className="font-mono text-slate-300" dir="ltr" title="תפוסה / קיבולת">
                    {lot.occupied}/{lot.capacity}
                  </span>
                )}
              </div>
              {lot.capacity > 0 && (
                <div className="h-1.5 overflow-hidden rounded bg-slate-800" aria-hidden>
                  <div
                    className={`h-full ${lot.occupied >= lot.capacity ? 'bg-red-500' : lot.occupied / lot.capacity >= 0.8 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (lot.occupied / lot.capacity) * 100)}%` }}
                  />
                </div>
              )}
              <div className="grid grid-cols-4 gap-1" role="group" aria-label={`מצב ${lot.name}`}>
                {PARKING_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-edit-control
                    aria-pressed={lot.status === s}
                    onClick={() => lot.status !== s && onUpdate(lot.id, { status: s })}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className={`rounded border px-1 py-1 font-bold transition ${
                      lot.status === s ? PARKING_TONE[s].active : 'border-slate-700 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    {PARKING_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              {(lot.note || lot.updated) && (
                <div className="flex justify-between gap-2 text-[11px] text-slate-400">
                  <span className="truncate">{lot.note}</span>
                  {lot.updated && (
                    <span className="shrink-0 font-mono" dir="ltr">
                      עודכן {lot.updated.slice(0, 5)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        )}
        {lots.length === 0 && !adding && <p className="text-center text-xs text-slate-500 md:col-span-2">אין חניונים</p>}
        {adding && (
          <ParkingEditor
            lot={EMPTY}
            isNew
            onSave={(fields) => {
              onAdd(fields);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
      {!adding && (
        <div className="mt-2">
          <AddTile label="הוספת חניון" disabled={busy} onClick={() => setAdding(true)} />
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        לחיצה על מצב משנה אותו מיד בכל העמדות. לחיצה כפולה על חניון לעריכת שם, קיבולת, תפוסה והערה.
      </p>
    </ModalShell>
  );
}

function ParkingEditor({
  lot,
  isNew = false,
  onSave,
  onCancel,
  onDelete,
}: {
  lot: ParkingLot;
  isNew?: boolean;
  onSave: (fields: ParkingFields, base: ParkingLot) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [base] = useState(lot);
  const [name, setName] = useState(lot.name);
  const [status, setStatus] = useState<ParkingStatus>(lot.status);
  const [capacity, setCapacity] = useState(lot.capacity ? String(lot.capacity) : '');
  const [occupied, setOccupied] = useState(lot.occupied ? String(lot.occupied) : '');
  const [note, setNote] = useState(lot.note);
  const cap = Number(capacity || 0);
  const occ = Number(occupied || 0);
  const badNumber = (v: string) => v !== '' && !/^\d{1,6}$/.test(v);
  const overfull = cap > 0 && occ > cap;
  const invalid = !name.trim() || badNumber(capacity) || badNumber(occupied) || overfull;

  return (
    <InlineEditor
      onSubmit={() => onSave({ name: name.trim(), status, capacity: cap, occupied: occ, note: note.trim() }, base)}
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-2 md:col-span-2"
      extraActions={onDelete && !isNew ? <DeleteButton onConfirm={onDelete} question="למחוק את החניון?" /> : undefined}
    >
      <Field label="שם חניון *">
        <input className={fieldClass(!name.trim())} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
      </Field>
      <Field label="מצב">
        <select className={fieldClass()} value={status} onChange={(e) => setStatus(e.target.value as ParkingStatus)}>
          {PARKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PARKING_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="קיבולת (מקומות)">
        <input
          className={`${fieldClass(badNumber(capacity))} font-mono`}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value.trim())}
          inputMode="numeric"
          placeholder="לא הוגדרה"
          dir="ltr"
        />
      </Field>
      <Field label="תפוסה (רכבים)">
        <input
          className={`${fieldClass(badNumber(occupied) || overfull)} font-mono`}
          value={occupied}
          onChange={(e) => setOccupied(e.target.value.trim())}
          inputMode="numeric"
          dir="ltr"
        />
      </Field>
      <Field label="הערה" className="col-span-2">
        <input className={fieldClass()} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="למשל: שמור לרכבי חירום" />
      </Field>
      {overfull && <p className="col-span-2 text-[11px] text-red-300">התפוסה גדולה מהקיבולת</p>}
    </InlineEditor>
  );
}
