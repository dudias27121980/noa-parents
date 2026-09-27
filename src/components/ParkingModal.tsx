import { KeyboardEvent, useEffect, useState } from 'react';
import { Minus, Plus, SquareParking } from 'lucide-react';
import { ParkingLot, ParkingStatus } from '../types/tactical';
import { ParkingFields, ParkingPatch } from '../shared/protocol';
import { PARKING_STATUS_LABEL } from '../shared/labels';
import { changedFields } from '../shared/diff';
import { LEVEL_STYLE, lotRatio, occupancyLevel, percent } from '../shared/parking';
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
            <ParkingCard
              key={lot.id}
              lot={lot}
              onEdit={() => !busy && setEditingId(lot.id)}
              onUpdate={(patch) => onUpdate(lot.id, patch)}
            />
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
        עדכון מספר הרכבים (הקלדה ו-Enter, או − / +) משנה את אחוז התפוסה מיד. לחיצה כפולה על חניון לעריכת שם, קיבולת והערה.
      </p>
    </ModalShell>
  );
}

/** One lot: occupancy percent and bar in the threshold colour, a quick vehicle count, and the status */
function ParkingCard({ lot, onEdit, onUpdate }: { lot: ParkingLot; onEdit: () => void; onUpdate: (patch: ParkingPatch) => void }) {
  const ratio = lotRatio(lot);
  const level = ratio === null ? null : occupancyLevel(ratio);
  const card = lot.status === 'closed' || !level ? PARKING_TONE[lot.status].card : LEVEL_STYLE[level].card;

  return (
    <div
      data-lot={lot.name}
      onDoubleClick={onEdit}
      title="לחיצה כפולה לעריכה"
      className={`flex cursor-default select-none flex-col gap-2 rounded border p-3 text-xs ${card}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-slate-100">{lot.name}</span>
        {ratio !== null && level && (
          <span className={`font-mono text-lg font-bold ${LEVEL_STYLE[level].text}`} dir="ltr" data-testid="lot-percent">
            {percent(ratio)}%
          </span>
        )}
      </div>

      {ratio !== null && level ? (
        <>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800" aria-hidden>
              <div className={`h-full ${LEVEL_STYLE[level].bar} transition-all`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </div>
            <span className="font-mono text-[11px] text-slate-300" dir="ltr" title="רכבים / קיבולת">
              {lot.occupied}/{lot.capacity}
            </span>
          </div>
          <OccupancyInput lot={lot} onSet={(occupied) => onUpdate({ occupied })} />
        </>
      ) : (
        <p className="text-[11px] text-slate-400">לא הוגדרה קיבולת. לחיצה כפולה להזנת קיבולת ומספר רכבים.</p>
      )}

      <div className="grid grid-cols-4 gap-1" role="group" aria-label={`מצב ${lot.name}`}>
        {PARKING_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            data-edit-control
            aria-pressed={lot.status === s}
            onClick={() => lot.status !== s && onUpdate({ status: s })}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`rounded border px-1 py-0.5 text-[11px] font-bold transition ${
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
  );
}

/** "Vehicles now": type a number and press Enter, or step with − / + */
function OccupancyInput({ lot, onSet }: { lot: ParkingLot; onSet: (occupied: number) => void }) {
  const [text, setText] = useState(String(lot.occupied));
  const [focused, setFocused] = useState(false);
  // Follow updates from other stations while not typing
  useEffect(() => {
    if (!focused) setText(String(lot.occupied));
  }, [lot.occupied, focused]);

  const value = Number(text);
  const valid = /^\d{1,6}$/.test(text) && value <= lot.capacity;
  const commit = () => {
    if (valid && value !== lot.occupied) onSet(value);
    else if (!valid) setText(String(lot.occupied));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setText(String(lot.occupied));
      e.currentTarget.blur();
    }
  };
  const step = (d: number) => {
    const n = Math.min(lot.capacity, Math.max(0, lot.occupied + d));
    if (n !== lot.occupied) onSet(n);
  };
  const stepClass = 'rounded border border-slate-600 p-1 text-slate-200 hover:bg-white/10 disabled:opacity-30';

  return (
    <div className="flex items-center gap-2" onDoubleClick={(e) => e.stopPropagation()} data-edit-control>
      <span className="whitespace-nowrap text-[11px] text-slate-400">רכבים כרגע</span>
      <button type="button" className={stepClass} onClick={() => step(-1)} disabled={lot.occupied <= 0} aria-label={`פחות רכב ב${lot.name}`}>
        <Minus size={12} />
      </button>
      <input
        className={`${fieldClass(!valid)} !w-20 py-0.5 text-center font-mono`}
        value={text}
        onChange={(e) => setText(e.target.value.trim())}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={onKeyDown}
        inputMode="numeric"
        dir="ltr"
        aria-label={`רכבים כרגע ב${lot.name}`}
      />
      <button
        type="button"
        className={stepClass}
        onClick={() => step(1)}
        disabled={lot.occupied >= lot.capacity}
        aria-label={`עוד רכב ב${lot.name}`}
      >
        <Plus size={12} />
      </button>
    </div>
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
  const [capacity, setCapacity] = useState(lot.capacity ? String(lot.capacity) : '');
  const [occupied, setOccupied] = useState(String(lot.occupied));
  const [note, setNote] = useState(lot.note);
  const cap = Number(capacity || 0);
  const occ = Number(occupied || 0);
  const isCount = (v: string) => /^\d{1,6}$/.test(v);
  const capacityBad = !isCount(capacity) || cap <= 0;
  const occupiedBad = occupied !== '' && !isCount(occupied);
  const overfull = !capacityBad && occ > cap;
  const invalid = !name.trim() || capacityBad || occupiedBad || overfull;

  return (
    <InlineEditor
      onSubmit={() => onSave({ name: name.trim(), status: lot.status, capacity: cap, occupied: occ, note: note.trim() }, base)}
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-3 md:col-span-2"
      extraActions={onDelete && !isNew ? <DeleteButton onConfirm={onDelete} question="למחוק את החניון?" /> : undefined}
    >
      <Field label="שם החניון *">
        <input className={fieldClass(!name.trim())} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
      </Field>
      <Field label="קיבולת רכבים בחניון *">
        <input
          className={`${fieldClass(capacityBad)} font-mono`}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value.trim())}
          inputMode="numeric"
          dir="ltr"
        />
      </Field>
      <Field label="כמה רכבים עד עכשיו">
        <input
          className={`${fieldClass(occupiedBad || overfull)} font-mono`}
          value={occupied}
          onChange={(e) => setOccupied(e.target.value.trim())}
          inputMode="numeric"
          dir="ltr"
        />
      </Field>
      <Field label="הערה" className="col-span-3">
        <input className={fieldClass()} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="למשל: שמור לרכבי חירום" />
      </Field>
      {overfull && <p className="col-span-3 text-[11px] text-red-300">מספר הרכבים גדול מהקיבולת</p>}
      {!capacityBad && !occupiedBad && !overfull && (
        <p className="col-span-3 text-[11px] text-slate-400">תפוסה: {percent(occ / cap)}%</p>
      )}
    </InlineEditor>
  );
}
