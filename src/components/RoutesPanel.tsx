import { useState } from 'react';
import { Route } from 'lucide-react';
import { RouteStatus, TacticalRoute } from '../types/tactical';
import { RouteFields, RoutePatch } from '../shared/protocol';
import { ROUTE_STATUS_LABEL } from '../shared/labels';
import { changedFields } from '../shared/diff';
import { AddTile, DeleteButton, Field, InlineEditor, Panel, StatusDot, fieldClass } from './ui';
import { playClick } from '../utils/audio';

interface Props {
  routes: TacticalRoute[];
  onAddRoute: (fields: RouteFields) => void;
  onUpdateRoute: (id: string, patch: RoutePatch) => void;
  onDeleteRoute: (id: string) => void;
  audioEnabled: boolean;
}

export const ROUTE_STATUS_STYLE: Record<RouteStatus, { dot: string; text: string }> = {
  open: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  partial: { dot: 'bg-amber-400', text: 'text-amber-300' },
  closed: { dot: 'bg-red-500', text: 'text-red-300' },
};

const NEW_ROUTE: TacticalRoute = { id: 'draft', name: '', status: 'open', note: '' };

/** Route status board: double-click a route to edit, + to add */
export function RoutesPanel({ routes, onAddRoute, onUpdateRoute, onDeleteRoute, audioEnabled }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const busy = editingId !== null || adding;
  const open = routes.filter((r) => r.status === 'open').length;

  return (
    <Panel
      title="מצב צירים"
      icon={<Route size={16} />}
      actions={
        <span className="text-xs text-slate-400">
          <span className="hidden sm:inline">לחיצה כפולה על ציר לעריכה · </span>
          <span className="font-mono text-emerald-300">{open}</span>/{routes.length} פתוחים
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {routes.map((r) =>
          editingId === r.id ? (
            <RouteEditor
              key={r.id}
              route={r}
              takenNames={routes.filter((o) => o.id !== r.id).map((o) => o.name)}
              onSave={(fields, base) => {
                if (audioEnabled) playClick();
                const patch = changedFields(base, fields);
                if (Object.keys(patch).length) onUpdateRoute(r.id, patch);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              onDelete={() => {
                onDeleteRoute(r.id);
                setEditingId(null);
              }}
            />
          ) : (
            <div
              key={r.id}
              onDoubleClick={() => {
                if (busy) return;
                if (audioEnabled) playClick();
                setEditingId(r.id);
              }}
              title="לחיצה כפולה לעריכה"
              className="cursor-default select-none rounded border border-slate-800 bg-black/20 p-3 transition hover:border-cyan-700/70"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-100">
                  <StatusDot color={ROUTE_STATUS_STYLE[r.status].dot} pulse={r.status !== 'open'} />
                  {r.name}
                </span>
                <span className={`text-[11px] font-semibold ${ROUTE_STATUS_STYLE[r.status].text}`}>
                  {ROUTE_STATUS_LABEL[r.status]}
                </span>
              </div>
              {r.note && <div className="mt-1 text-[11px] text-slate-400">{r.note}</div>}
            </div>
          )
        )}
        {adding ? (
          <RouteEditor
            route={NEW_ROUTE}
            isNew
            takenNames={routes.map((o) => o.name)}
            onSave={(fields) => {
              if (audioEnabled) playClick();
              onAddRoute(fields);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <AddTile label="הוספת ציר" disabled={busy} onClick={() => setAdding(true)} />
        )}
      </div>
    </Panel>
  );
}

function RouteEditor({
  route,
  isNew = false,
  takenNames,
  onSave,
  onCancel,
  onDelete,
}: {
  route: TacticalRoute;
  isNew?: boolean;
  takenNames: string[];
  onSave: (fields: RouteFields, base: TacticalRoute) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [base] = useState(route);
  const [name, setName] = useState(route.name);
  const [status, setStatus] = useState<RouteStatus>(route.status);
  const [note, setNote] = useState(route.note);
  const taken = takenNames.includes(name.trim());
  const invalid = !name.trim() || taken;

  return (
    <InlineEditor
      onSubmit={() => onSave({ name: name.trim(), status, note: note.trim() }, base)}
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-2"
      extraActions={onDelete && !isNew ? <DeleteButton onConfirm={onDelete} question={`להסיר את ${route.name}?`} /> : undefined}
    >
      <Field label={taken ? 'שם ציר * (קיים)' : 'שם ציר *'}>
        <input className={fieldClass(invalid)} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
      </Field>
      <Field label="מצב">
        <select className={fieldClass()} value={status} onChange={(e) => setStatus(e.target.value as RouteStatus)}>
          {(Object.keys(ROUTE_STATUS_LABEL) as RouteStatus[]).map((st) => (
            <option key={st} value={st} className="bg-[#0b1426]">
              {ROUTE_STATUS_LABEL[st]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="הערה" className="col-span-2">
        <input className={fieldClass()} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>
    </InlineEditor>
  );
}
