import { useState } from 'react';
import { Bus } from 'lucide-react';
import { BusRoute, BusStatus, BusTrip } from '../types/tactical';
import { BusFields, BusPatch } from '../shared/protocol';
import { BUS_ROUTE_LABEL, BUS_STATUS_LABEL } from '../shared/labels';
import { changedFields } from '../shared/diff';
import { BUS_ROUTES, busTotals, fmt } from '../shared/buses';
import { parseHHMM } from '../utils/time';
import { AddTile, CountInput, DeleteButton, Field, InlineEditor, ModalShell, fieldClass } from './ui';

interface Props {
  buses: BusTrip[];
  onAdd: (fields: BusFields) => void;
  onUpdate: (id: string, patch: BusPatch) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const STATUSES: BusStatus[] = ['waiting', 'en-route', 'arrived'];
const STATUS_TONE: Record<BusStatus, string> = {
  waiting: 'border-slate-400 bg-slate-500/25 text-slate-100',
  'en-route': 'border-amber-300 bg-amber-400/25 text-amber-100',
  arrived: 'border-emerald-400 bg-emerald-500/25 text-emerald-100',
};
const MAX_PASSENGERS = 200;

const EMPTY: BusTrip = { id: 'draft', number: '', route: 'jlm-ka', status: 'waiting', passengers: 0, departure: '', note: '' };
const byDeparture = (a: BusTrip, b: BusTrip) => (a.departure || '99:99').localeCompare(b.departure || '99:99') || a.id.localeCompare(b.id, undefined, { numeric: true });

type Tab = 'lines' | 'all';

/** Bus management: by line (201 each way, shuttles, and the total), and the full list with an add row */
export function BusModal({ buses, onAdd, onUpdate, onDelete, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('lines');
  const totals = busTotals(buses);

  return (
    <ModalShell title="ניהול אוטובוסים" icon={<Bus size={18} />} onClose={onClose} wide>
      <div className="mb-3 flex gap-1 border-b border-slate-800" role="tablist">
        {(
          [
            ['lines', 'לפי קווים'],
            ['all', `כלל האוטובוסים (${buses.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-bold ${
              tab === id ? 'border-cyan-400 text-cyan-200' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'lines' ? (
        <div className="flex flex-col gap-3">
          {BUS_ROUTES.map((route, i) => (
            <LineSection key={route} index={i + 1} route={route} buses={buses.filter((b) => b.route === route).sort(byDeparture)} onUpdate={onUpdate} />
          ))}
          <section className="rounded border border-cyan-700/60 bg-cyan-500/5 p-3" aria-label='סה"כ נוסעים'>
            <h3 className="mb-2 text-sm font-bold text-cyan-200">4. סה"כ נוסעים בכל האוטובוסים</h3>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {BUS_ROUTES.map((r) => (
                <div key={r} className="rounded border border-slate-800 bg-black/20 p-2">
                  <div className="text-[11px] text-slate-400">{BUS_ROUTE_LABEL[r]}</div>
                  <div className="font-mono text-lg font-bold text-slate-100" dir="ltr">
                    {fmt(totals.perRoute[r].passengers)}
                  </div>
                  <div className="text-[10px] text-slate-500">{totals.perRoute[r].buses} אוטובוסים</div>
                </div>
              ))}
              <div className="rounded border border-cyan-600/60 bg-cyan-500/10 p-2">
                <div className="text-[11px] font-bold text-cyan-200">סה"כ</div>
                <div className="font-mono text-2xl font-black text-cyan-100" dir="ltr" data-testid="bus-total-passengers">
                  {fmt(totals.passengers)}
                </div>
                <div className="text-[10px] text-slate-400">
                  {totals.departed}/{totals.buses} יצאו
                </div>
              </div>
            </div>
          </section>
          {buses.length === 0 && (
            <p className="text-center text-xs text-slate-500">
              עוד אין אוטובוסים. מוסיפים בלשונית "כלל האוטובוסים".{' '}
              <button type="button" className="text-cyan-300 underline" onClick={() => setTab('all')}>
                למעבר
              </button>
            </p>
          )}
        </div>
      ) : (
        <AllBuses buses={buses} onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete} />
      )}
    </ModalShell>
  );
}

function StatusButtons({ bus, onUpdate }: { bus: BusTrip; onUpdate: (id: string, patch: BusPatch) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label={`מצב אוטובוס ${bus.number}`} data-edit-control>
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={bus.status === s}
          onClick={() => bus.status !== s && onUpdate(bus.id, { status: s })}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${
            bus.status === s ? STATUS_TONE[s] : 'border-slate-700 text-slate-500 hover:bg-white/5'
          }`}
        >
          {BUS_STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

function LineSection({
  index,
  route,
  buses,
  onUpdate,
}: {
  index: number;
  route: BusRoute;
  buses: BusTrip[];
  onUpdate: (id: string, patch: BusPatch) => void;
}) {
  const t = busTotals(buses);
  return (
    <section className="rounded border border-slate-800 bg-black/20 p-3" aria-label={BUS_ROUTE_LABEL[route]}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-100">
          {index}. {BUS_ROUTE_LABEL[route]}
        </h3>
        <span className="text-[11px] text-slate-400">
          {t.departed}/{t.buses} יצאו · <span className="font-bold text-slate-200">{fmt(t.passengers)}</span> נוסעים
        </span>
      </div>
      {buses.length === 0 ? (
        <p className="text-[11px] text-slate-600">אין אוטובוסים בקו</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {buses.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800/80 px-2 py-1 text-xs">
              <span className="min-w-16 font-bold text-slate-100">{b.number}</span>
              <span className="w-12 font-mono text-slate-400" dir="ltr">
                {b.departure || '—'}
              </span>
              <StatusButtons bus={b} onUpdate={onUpdate} />
              <span className="ms-auto flex items-center gap-1.5 text-[11px] text-slate-400">
                נוסעים
                <CountInput value={b.passengers} max={MAX_PASSENGERS} label={`נוסעים באוטובוס ${b.number}`} onCommit={(passengers) => onUpdate(b.id, { passengers })} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AllBuses({ buses, onAdd, onUpdate, onDelete }: Omit<Props, 'onClose'>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const busy = editingId !== null || adding;
  const cols = 'grid grid-cols-[4.5rem_1fr_3.5rem_auto_5.5rem] items-center gap-2';

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded border border-slate-800">
        <div className={`${cols} min-w-[640px] bg-black/30 px-3 py-1.5 text-[11px] font-bold text-slate-400`}>
          <span>אוטובוס</span>
          <span>קו</span>
          <span>יציאה</span>
          <span>מצב</span>
          <span>נוסעים</span>
        </div>
        {buses.length === 0 && !adding && <p className="px-3 py-4 text-center text-xs text-slate-500">עוד אין אוטובוסים</p>}
        {[...buses].sort(byDeparture).map((b) =>
          editingId === b.id ? (
            <div key={b.id} className="border-t border-slate-800 p-2">
              <BusEditor
                bus={b}
                onSave={(fields) => {
                  const patch = changedFields(b, fields);
                  if (Object.keys(patch).length) onUpdate(b.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
                onDelete={() => {
                  onDelete(b.id);
                  setEditingId(null);
                }}
              />
            </div>
          ) : (
            <div
              key={b.id}
              data-bus={b.number}
              onDoubleClick={() => !busy && setEditingId(b.id)}
              title="לחיצה כפולה לעריכה"
              className={`${cols} min-w-[640px] cursor-default select-none border-t border-slate-800 px-3 py-1.5 text-xs hover:bg-white/5`}
            >
              <span className="font-bold text-slate-100">{b.number}</span>
              <span className="truncate text-slate-300">
                {BUS_ROUTE_LABEL[b.route]}
                {b.note && <span className="ms-2 text-[10px] text-slate-500">{b.note}</span>}
              </span>
              <span className="font-mono text-slate-400" dir="ltr">
                {b.departure || '—'}
              </span>
              <StatusButtons bus={b} onUpdate={onUpdate} />
              <CountInput value={b.passengers} max={MAX_PASSENGERS} label={`נוסעים באוטובוס ${b.number}`} onCommit={(passengers) => onUpdate(b.id, { passengers })} />
            </div>
          )
        )}
      </div>
      {adding ? (
        <BusEditor
          bus={EMPTY}
          isNew
          onSave={(fields) => {
            onAdd(fields);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <AddTile label="הוספת אוטובוס" disabled={busy} onClick={() => setAdding(true)} />
      )}
      <p className="text-[11px] text-slate-500">לחיצה כפולה על אוטובוס לעריכה או למחיקה. מספר הנוסעים מתעדכן בהקלדה ו-Enter.</p>
    </div>
  );
}

function BusEditor({
  bus,
  isNew = false,
  onSave,
  onCancel,
  onDelete,
}: {
  bus: BusTrip;
  isNew?: boolean;
  onSave: (fields: BusFields) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [number, setNumber] = useState(bus.number);
  const [route, setRoute] = useState<BusRoute>(bus.route);
  const [status, setStatus] = useState<BusStatus>(bus.status);
  const [passengers, setPassengers] = useState(String(bus.passengers));
  const [departure, setDeparture] = useState(bus.departure);
  const [note, setNote] = useState(bus.note);
  const passengersOk = /^\d{1,3}$/.test(passengers) && Number(passengers) <= MAX_PASSENGERS;
  const departureOk = departure === '' || parseHHMM(departure) !== null;
  const invalid = !number.trim() || !passengersOk || !departureOk;

  return (
    <InlineEditor
      onSubmit={() => onSave({ number: number.trim(), route, status, passengers: Number(passengers), departure, note: note.trim() })}
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-2 sm:grid-cols-3"
      extraActions={onDelete && !isNew ? <DeleteButton onConfirm={onDelete} question="למחוק את האוטובוס?" /> : undefined}
    >
      <Field label="מספר אוטובוס *">
        <input className={fieldClass(!number.trim())} value={number} onChange={(e) => setNumber(e.target.value)} autoFocus maxLength={20} />
      </Field>
      <Field label="קו">
        <select className={fieldClass()} value={route} onChange={(e) => setRoute(e.target.value as BusRoute)}>
          {BUS_ROUTES.map((r) => (
            <option key={r} value={r}>
              {BUS_ROUTE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="מצב">
        <select className={fieldClass()} value={status} onChange={(e) => setStatus(e.target.value as BusStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {BUS_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="נוסעים">
        <input className={`${fieldClass(!passengersOk)} font-mono`} value={passengers} onChange={(e) => setPassengers(e.target.value.trim())} inputMode="numeric" dir="ltr" />
      </Field>
      <Field label="שעת יציאה">
        <input className={`${fieldClass(!departureOk)} font-mono`} value={departure} onChange={(e) => setDeparture(e.target.value.trim())} placeholder="HH:MM" dir="ltr" />
      </Field>
      <Field label="הערה">
        <input className={fieldClass()} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>
    </InlineEditor>
  );
}
