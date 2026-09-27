import { PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { Map as MapIcon, Move } from 'lucide-react';
import { RouteStatus, TacticalRoute, TacticalUnit, UnitStatus } from '../types/tactical';
import { Panel } from './ui';
import { ROUTE_STATUS_LABEL, UNIT_STATUS_LABEL, UNIT_TYPE_LABEL } from '../shared/labels';
import { RoutePatch, RouteFields } from '../shared/protocol';
import { playRadioChirp } from '../utils/audio';
import { RoutesPanel } from './RoutesPanel';

interface Props {
  units: TacticalUnit[];
  routes: TacticalRoute[];
  onSelectUnit: (u: TacticalUnit) => void;
  /** Dropped after dragging on the map; x/y in percent */
  onMoveUnit: (id: string, x: number, y: number) => void;
  onAddRoute: (fields: RouteFields) => void;
  onUpdateRoute: (id: string, patch: RoutePatch) => void;
  onDeleteRoute: (id: string) => void;
  audioEnabled: boolean;
}

export { UNIT_TYPE_LABEL };

export const UNIT_STATUS: Record<UnitStatus, { label: string; color: string; text: string }> = {
  deployed: { label: UNIT_STATUS_LABEL.deployed, color: 'bg-emerald-400', text: 'text-emerald-300' },
  'en-route': { label: UNIT_STATUS_LABEL['en-route'], color: 'bg-amber-400', text: 'text-amber-300' },
  standby: { label: UNIT_STATUS_LABEL.standby, color: 'bg-cyan-400', text: 'text-cyan-300' },
  offline: { label: UNIT_STATUS_LABEL.offline, color: 'bg-red-500', text: 'text-red-300' },
};

// Schematic geometry for the demo routes (percent coordinates on a 100x100 viewBox), keyed by route id.
// Routes added later have no drawing; they still appear in the routes list and the KPI.
const ROUTE_GEOMETRY: Record<string, string> = {
  'R-60': 'M50 0 L48 30 L50 50 L40 75 L36 100',
  'R-35': 'M0 62 L25 55 L50 50 L80 42 L100 38',
};

const ROUTE_STROKE: Record<RouteStatus, { stroke: string; dash?: string }> = {
  open: { stroke: 'rgba(148,163,184,0.45)' },
  partial: { stroke: 'rgba(251,191,36,0.6)', dash: '2 1.5' },
  closed: { stroke: 'rgba(239,68,68,0.7)', dash: '1 1' },
};

const DRAG_THRESHOLD_PX = 4;

export function TacticalMapScreen({
  units,
  routes,
  onSelectUnit,
  onMoveUnit,
  onAddRoute,
  onUpdateRoute,
  onDeleteRoute,
  audioEnabled,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = units.find((u) => u.id === selectedId) ?? null;
  const mapRef = useRef<HTMLDivElement>(null);
  // While dragging, the marker follows the pointer locally; the server gets the drop position only
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);

  const toPercent = (clientX: number, clientY: number) => {
    const r = mapRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    return { x: clamp(((clientX - r.left) / r.width) * 100), y: clamp(((clientY - r.top) / r.height) * 100) };
  };

  const onPointerDown = (u: TacticalUnit) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: u.id, x: u.x, y: u.y, startX: e.clientX, startY: e.clientY, moved: false });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD_PX;
    if (!moved) return;
    setDrag({ ...drag, ...toPercent(e.clientX, e.clientY), moved });
  };
  const onPointerUp = (u: TacticalUnit) => () => {
    if (drag?.moved) {
      onMoveUnit(u.id, Math.round(drag.x * 10) / 10, Math.round(drag.y * 10) / 10);
    } else {
      // A click without movement: select and call the unit
      if (audioEnabled) playRadioChirp();
      setSelectedId(u.id);
      onSelectUnit(u);
    }
    setDrag(null);
  };

  const problems = routes.filter((r) => r.status !== 'open');

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="מפה טקטית - מרחב יהודה"
        icon={<MapIcon size={16} />}
        actions={
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <Move size={12} /> גרירת כוח במפה משנה את מיקומו
          </span>
        }
      >
        <div className="flex flex-col gap-3 xl:flex-row">
          <div
            ref={mapRef}
            className="tactical-grid relative aspect-[4/3] w-full touch-none overflow-hidden rounded border border-cyan-900/60 bg-[#06101f] xl:flex-1"
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {routes
                .filter((r) => ROUTE_GEOMETRY[r.id])
                .map((r) => (
                  <path
                    key={r.id}
                    d={ROUTE_GEOMETRY[r.id]}
                    fill="none"
                    stroke={ROUTE_STROKE[r.status].stroke}
                    strokeWidth={1.2}
                    strokeDasharray={ROUTE_STROKE[r.status].dash}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            </svg>
            {problems.length > 0 && (
              <span className="absolute start-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-amber-200">
                {problems.map((r) => `${r.name} (${ROUTE_STATUS_LABEL[r.status]})`).join(' · ')}
              </span>
            )}

            {units.map((u) => {
              const st = UNIT_STATUS[u.status];
              const isSel = u.id === selectedId;
              const dragging = drag?.id === u.id && drag.moved;
              const x = dragging ? drag.x : u.x;
              const y = dragging ? drag.y : u.y;
              return (
                <button
                  key={u.id}
                  onPointerDown={onPointerDown(u)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp(u)}
                  onPointerCancel={() => setDrag(null)}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing ${
                    dragging ? 'z-10' : 'transition-[left,top] duration-1000'
                  }`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  aria-label={u.callSign}
                  data-unit-id={u.id}
                >
                  <span
                    className={`block h-3.5 w-3.5 rounded-full border-2 border-black/60 ${st.color} ${
                      isSel || dragging ? 'ring-4 ring-cyan-300/50' : ''
                    } ${u.status === 'offline' || dragging ? '' : 'animate-pulse'}`}
                  />
                  <span className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1 text-[10px] font-semibold text-slate-100">
                    {u.callSign}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="w-full shrink-0 xl:w-64">
            {selected ? (
              <div className="rounded border border-cyan-800/60 bg-black/30 p-3 text-xs">
                <div className="mb-2 text-sm font-bold text-cyan-200">{selected.callSign}</div>
                <dl className="grid grid-cols-2 gap-y-1.5">
                  <dt className="text-slate-400">סוג</dt>
                  <dd>{UNIT_TYPE_LABEL[selected.type]}</dd>
                  <dt className="text-slate-400">סטטוס</dt>
                  <dd className={UNIT_STATUS[selected.status].text}>{UNIT_STATUS[selected.status].label}</dd>
                  <dt className="text-slate-400">מפקד</dt>
                  <dd>{selected.commander}</dd>
                  <dt className="text-slate-400">גזרה</dt>
                  <dd>{selected.sector}</dd>
                  <dt className="text-slate-400">קשר אחרון</dt>
                  <dd className="font-mono">{selected.lastContact}</dd>
                </dl>
              </div>
            ) : (
              <div className="rounded border border-dashed border-slate-700 p-3 text-xs text-slate-400">
                לחץ על כוח במפה לפרטים ולקריאה ישירה בקשר. גרור כוח כדי לעדכן את מיקומו.
              </div>
            )}
            <ul className="mt-3 flex flex-col gap-1.5 text-[11px]">
              {Object.entries(UNIT_STATUS).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2 text-slate-300">
                  <span className={`h-2.5 w-2.5 rounded-full ${v.color}`} />
                  {v.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <RoutesPanel
        routes={routes}
        onAddRoute={onAddRoute}
        onUpdateRoute={onUpdateRoute}
        onDeleteRoute={onDeleteRoute}
        audioEnabled={audioEnabled}
      />
    </div>
  );
}
