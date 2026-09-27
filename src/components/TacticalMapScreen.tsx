import { PointerEvent as ReactPointerEvent, ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Car, Crosshair, Drone, Flag, HeartPulse, Map as MapIcon, MapPin, Navigation, X } from 'lucide-react';
import {
  MapPoint,
  ParkingLot,
  RouteStatus,
  TacticalIncident,
  TacticalRoute,
  TacticalUnit,
  UnitStatus,
  UnitType,
} from '../types/tactical';
import { Panel } from './ui';
import { PARKING_STATUS_LABEL, ROUTE_STATUS_LABEL, TIER_LABEL, UNIT_STATUS_LABEL, UNIT_TYPE_LABEL } from '../shared/labels';
import { RoutePatch, RouteFields } from '../shared/protocol';
import { GRID_COLS, GRID_ROWS, gridRef } from '../shared/mapGrid';
import { LEVEL_STYLE, lotRatio, occupancyLevel, percent } from '../shared/parking';
import { playRadioChirp } from '../utils/audio';
import { RoutesPanel } from './RoutesPanel';
import sectorMap from '../assets/sector-map.webp';

interface Props {
  units: TacticalUnit[];
  routes: TacticalRoute[];
  incidents: TacticalIncident[];
  parkingLots: ParkingLot[];
  onSelectUnit: (u: TacticalUnit) => void;
  /** Dropped after dragging on the map; x/y in percent */
  onMoveUnit: (id: string, x: number, y: number) => void;
  /** Mark, move or (null) take off the map */
  onPlaceIncident: (id: string, pos: MapPoint | null) => void;
  onPlaceLot: (id: string, pos: MapPoint | null) => void;
  onAddRoute: (fields: RouteFields) => void;
  onUpdateRoute: (id: string, patch: RoutePatch) => void;
  onDeleteRoute: (id: string) => void;
  audioEnabled: boolean;
}

export { UNIT_TYPE_LABEL };

export const UNIT_STATUS: Record<UnitStatus, { label: string; color: string; text: string; border: string }> = {
  deployed: { label: UNIT_STATUS_LABEL.deployed, color: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-400' },
  'en-route': { label: UNIT_STATUS_LABEL['en-route'], color: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400' },
  standby: { label: UNIT_STATUS_LABEL.standby, color: 'bg-cyan-400', text: 'text-cyan-300', border: 'border-cyan-400' },
  offline: { label: UNIT_STATUS_LABEL.offline, color: 'bg-red-500', text: 'text-red-300', border: 'border-red-500' },
};

const UNIT_ICON: Record<UnitType, typeof Car> = {
  patrol: Car,
  swat: Crosshair,
  drone: Drone,
  medical: HeartPulse,
  command: Flag,
};

const TIER_PIN: Record<1 | 2 | 3, { bg: string; text: string }> = {
  1: { bg: 'bg-red-600', text: 'text-red-200' },
  2: { bg: 'bg-orange-500', text: 'text-orange-200' },
  3: { bg: 'bg-sky-500', text: 'text-sky-200' },
};

// Routes 60 and 35 traced along the roads of the sector image (percent of the map). Other routes
// have no drawing; they still appear in the routes list and the KPI.
const ROUTE_GEOMETRY: Record<string, [number, number][]> = {
  'R-60': [
    [65, 0], [65.9, 6.2], [65, 10.7], [62, 15.1], [60.3, 17.8], [60.3, 26.7], [60.5, 29.3], [58, 30.7], [54.3, 32.4],
    [53.3, 34.2], [52.8, 37.3], [52.3, 41.8], [51.5, 46.2], [51.6, 48], [52.8, 48.7], [54.5, 50.7], [56.5, 53.3],
    [58.3, 56], [58.9, 59.1], [58.5, 61.8], [57, 64], [55.5, 66.2], [57.5, 66.8], [59.3, 68.6], [61, 70.7],
    [61.6, 73.8], [61.4, 77.3], [60.6, 80.4], [60.3, 84.4], [59.9, 88], [60.3, 92.4], [61.1, 96.4], [61.3, 100],
  ],
  'R-35': [
    [0, 58.2], [1.5, 61.3], [3.8, 64.7], [6, 65.8], [10, 67.1], [12, 69.8], [13.3, 71.6], [15, 72.2], [17, 70.2],
    [20, 68.9], [23, 70.2], [25, 71.1], [26.5, 70.7], [29, 68], [31, 67.4], [35, 67.6], [40, 68.3], [43.5, 69.2],
    [45, 68.3], [48, 67.6], [51, 66.9], [55.5, 66.2],
  ],
};

const ROUTE_STROKE: Record<RouteStatus, { stroke: string; width: number; dash?: string }> = {
  open: { stroke: 'rgba(52,211,153,0.55)', width: 3 },
  partial: { stroke: 'rgba(251,191,36,0.95)', width: 4, dash: '10 6' },
  closed: { stroke: 'rgba(239,68,68,0.95)', width: 5, dash: '4 4' },
};

type Layer = 'units' | 'incidents' | 'parking' | 'routes' | 'grid';
const LAYERS: { id: Layer; label: string }[] = [
  { id: 'units', label: 'כוחות' },
  { id: 'incidents', label: 'אירועים' },
  { id: 'parking', label: 'חניונים' },
  { id: 'routes', label: 'צירים' },
  { id: 'grid', label: 'רשת' },
];

type Selection = { kind: 'unit' | 'incident' | 'lot'; id: string } | null;

const clamp = (v: number) => Math.min(100, Math.max(0, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function TacticalMapScreen({
  units,
  routes,
  incidents,
  parkingLots,
  onSelectUnit,
  onMoveUnit,
  onPlaceIncident,
  onPlaceLot,
  onAddRoute,
  onUpdateRoute,
  onDeleteRoute,
  audioEnabled,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ units: true, incidents: true, parking: true, routes: true, grid: true });
  // Marking an item: the next click on the map places it
  const [placing, setPlacing] = useState<{ kind: 'incident' | 'lot'; id: string; name: string } | null>(null);

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPlacing(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  const toPercent = (clientX: number, clientY: number): MapPoint => {
    const r = mapRef.current!.getBoundingClientRect();
    return { x: round1(clamp(((clientX - r.left) / r.width) * 100)), y: round1(clamp(((clientY - r.top) / r.height) * 100)) };
  };

  const openIncidents = incidents.filter((i) => i.status !== 'resolved');
  const placedIncidents = openIncidents.filter((i) => i.mapPos);
  const placedLots = parkingLots.filter((p) => p.mapPos);
  const unplaced = [
    ...openIncidents.filter((i) => !i.mapPos).map((i) => ({ kind: 'incident' as const, id: i.id, name: `${i.id} · ${i.title}` })),
    ...parkingLots.filter((p) => !p.mapPos).map((p) => ({ kind: 'lot' as const, id: p.id, name: `חניון ${p.name}` })),
  ];
  const problems = routes.filter((r) => r.status !== 'open');

  const selUnit = selected?.kind === 'unit' ? units.find((u) => u.id === selected.id) : undefined;
  const selIncident = selected?.kind === 'incident' ? incidents.find((i) => i.id === selected.id) : undefined;
  const selLot = selected?.kind === 'lot' ? parkingLots.find((p) => p.id === selected.id) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="מפה טקטית - מרחב יהודה"
        icon={<MapIcon size={16} />}
        actions={
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="שכבות מפה">
            {LAYERS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={layers[l.id]}
                onClick={() => setLayers((s) => ({ ...s, [l.id]: !s[l.id] }))}
                className={`rounded border px-2 py-0.5 text-[11px] font-semibold transition ${
                  layers[l.id] ? 'border-cyan-500/70 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="xl:flex-1">
            <div
              ref={mapRef}
              data-testid="tactical-map"
              onClick={(e) => {
                if (!placing) return;
                const pos = toPercent(e.clientX, e.clientY);
                (placing.kind === 'incident' ? onPlaceIncident : onPlaceLot)(placing.id, pos);
                setSelected({ kind: placing.kind, id: placing.id });
                setPlacing(null);
              }}
              className={`relative aspect-[16/9] w-full touch-none select-none overflow-hidden rounded border border-cyan-800/70 bg-[#06101f] shadow-[inset_0_0_40px_rgba(0,0,0,0.6)] ${
                placing ? 'cursor-crosshair ring-2 ring-cyan-400/70' : ''
              }`}
            >
              <img
                src={sectorMap}
                alt=""
                aria-hidden
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                style={{ filter: 'saturate(0.8) brightness(0.78) contrast(1.08)' }}
              />
              <span className="pointer-events-none absolute inset-0 bg-[#06101f]/20" />
              <span
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(6,16,31,0.65) 100%)' }}
              />

              {layers.grid && <GridOverlay />}

              {layers.routes && (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                  {routes
                    .filter((r) => ROUTE_GEOMETRY[r.id])
                    .map((r) => {
                      const s = ROUTE_STROKE[r.status];
                      const points = ROUTE_GEOMETRY[r.id].map(([x, y]) => `${x},${y}`).join(' ');
                      return (
                        <g key={r.id} data-route={r.id} data-status={r.status}>
                          <polyline points={points} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={s.width + 3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                          <polyline
                            points={points}
                            fill="none"
                            stroke={s.stroke}
                            strokeWidth={s.width}
                            strokeDasharray={s.dash}
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })}
                </svg>
              )}

              {/* North arrow */}
              <div className="pointer-events-none absolute left-2 top-7 flex flex-col items-center rounded bg-black/55 px-1.5 py-1 text-cyan-200">
                <Navigation size={16} className="fill-cyan-300/60" />
                <span className="text-[10px] font-bold leading-none">צ׳</span>
              </div>

              {layers.routes && problems.length > 0 && (
                <span className="pointer-events-none absolute bottom-2 left-2 max-w-[60%] rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-amber-200">
                  {problems.map((r) => `${r.name} (${ROUTE_STATUS_LABEL[r.status]})`).join(' · ')}
                </span>
              )}

              {layers.parking &&
                placedLots.map((lot) => {
                  const r = lotRatio(lot);
                  const style = lot.status === 'closed' || r === null ? null : LEVEL_STYLE[occupancyLevel(r)];
                  return (
                    <DraggableMarker
                      key={lot.id}
                      pos={lot.mapPos!}
                      mapRef={mapRef}
                      toPercent={toPercent}
                      label={`חניון ${lot.name}`}
                      disabled={!!placing}
                      onDrop={(pos) => onPlaceLot(lot.id, pos)}
                      onTap={() => setSelected({ kind: 'lot', id: lot.id })}
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 text-[11px] font-black text-white shadow-lg ${
                          style ? `${style.bar} border-black/50` : 'border-slate-400 bg-slate-600'
                        } ${selected?.kind === 'lot' && selected.id === lot.id ? 'ring-4 ring-cyan-300/60' : ''}`}
                      >
                        P
                      </span>
                      <MarkerLabel>
                        {lot.name}
                        {r !== null && lot.status !== 'closed' ? ` ${percent(r)}%` : lot.status === 'closed' ? ' (סגור)' : ''}
                      </MarkerLabel>
                    </DraggableMarker>
                  );
                })}

              {layers.incidents &&
                placedIncidents.map((inc) => (
                  <DraggableMarker
                    key={inc.id}
                    pos={inc.mapPos!}
                    mapRef={mapRef}
                    toPercent={toPercent}
                    label={`אירוע ${inc.title}`}
                    disabled={!!placing}
                    onDrop={(pos) => onPlaceIncident(inc.id, pos)}
                    onTap={() => setSelected({ kind: 'incident', id: inc.id })}
                  >
                    {inc.tier === 1 && <span className="absolute left-1/2 top-3 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-red-500/50" />}
                    <span
                      className={`relative flex h-6 w-6 rotate-45 items-center justify-center rounded-sm border-2 border-black/60 shadow-lg ${TIER_PIN[inc.tier].bg} ${
                        selected?.kind === 'incident' && selected.id === inc.id ? 'ring-4 ring-cyan-300/60' : ''
                      }`}
                    >
                      <AlertTriangle size={13} className="-rotate-45 text-white" />
                    </span>
                    <MarkerLabel>{inc.title}</MarkerLabel>
                  </DraggableMarker>
                ))}

              {layers.units &&
                units.map((u) => {
                  const st = UNIT_STATUS[u.status];
                  const Icon = UNIT_ICON[u.type];
                  const isSel = selected?.kind === 'unit' && selected.id === u.id;
                  return (
                    <DraggableMarker
                      key={u.id}
                      pos={u}
                      mapRef={mapRef}
                      toPercent={toPercent}
                      label={u.callSign}
                      dataUnitId={u.id}
                      disabled={!!placing}
                      onDrop={(pos) => onMoveUnit(u.id, pos.x, pos.y)}
                      onTap={() => {
                        // A click without movement: select and call the unit
                        if (audioEnabled) playRadioChirp();
                        setSelected({ kind: 'unit', id: u.id });
                        onSelectUnit(u);
                      }}
                    >
                      <span
                        className={`flex h-6 w-8 items-center justify-center rounded-[3px] border-2 bg-[#0b1426]/90 shadow-lg ${st.border} ${
                          isSel ? 'ring-4 ring-cyan-300/60' : ''
                        } ${u.status === 'offline' ? 'opacity-80' : ''}`}
                      >
                        <Icon size={14} className={st.text} />
                      </span>
                      <MarkerLabel>{u.callSign}</MarkerLabel>
                    </DraggableMarker>
                  );
                })}

              {placing && (
                <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                  <span className="rounded bg-cyan-600/90 px-3 py-1 text-xs font-bold text-white shadow-lg">
                    לחיצה על המפה לסימון: {placing.name} · Esc לביטול
                  </span>
                </div>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">גרירת סמל משנה את מיקומו בכל העמדות. לחיצה על סמל לפרטים.</p>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-3 text-xs xl:w-72">
            <SelectionCard
              unit={selUnit}
              incident={selIncident}
              lot={selLot}
              onClose={() => setSelected(null)}
              onRemoveIncident={(id) => {
                onPlaceIncident(id, null);
                setSelected(null);
              }}
              onRemoveLot={(id) => {
                onPlaceLot(id, null);
                setSelected(null);
              }}
            />

            {unplaced.length > 0 && (
              <div className="rounded border border-slate-700/70 bg-black/20 p-2">
                <div className="mb-1.5 font-bold text-slate-300">לא מסומנים במפה</div>
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {unplaced.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-300">{item.name}</span>
                      <button
                        type="button"
                        data-edit-control
                        onClick={() => setPlacing(placing?.id === item.id ? null : item)}
                        className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-semibold ${
                          placing?.id === item.id ? 'border-cyan-400 bg-cyan-500/25 text-cyan-100' : 'border-slate-600 text-slate-300 hover:bg-white/5'
                        }`}
                        aria-label={`סימון במפה: ${item.name}`}
                      >
                        <MapPin size={11} /> {placing?.id === item.id ? 'ביטול' : 'סמן'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Legend />
          </aside>
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

/** Reference grid: lines, column letters along the top, row numbers down the right */
function GridOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {GRID_COLS.slice(1).map((_, i) => (
        <span key={`c${i}`} className="absolute inset-y-0 w-px bg-cyan-200/20" style={{ right: `${((i + 1) / GRID_COLS.length) * 100}%` }} />
      ))}
      {Array.from({ length: GRID_ROWS - 1 }, (_, i) => (
        <span key={`r${i}`} className="absolute inset-x-0 h-px bg-cyan-200/20" style={{ top: `${((i + 1) / GRID_ROWS) * 100}%` }} />
      ))}
      {GRID_COLS.map((c, i) => (
        <span
          key={c}
          className="absolute top-0.5 rounded-sm bg-black/55 px-1 text-[10px] font-bold text-cyan-100"
          style={{ right: `${((i + 0.5) / GRID_COLS.length) * 100}%`, transform: 'translateX(50%)' }}
        >
          {c}
        </span>
      ))}
      {Array.from({ length: GRID_ROWS }, (_, i) => (
        <span
          key={i}
          className="absolute right-0.5 -translate-y-1/2 rounded-sm bg-black/55 px-1 font-mono text-[10px] font-bold text-cyan-100"
          style={{ top: `${((i + 0.5) / GRID_ROWS) * 100}%` }}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}

function MarkerLabel({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-[calc(100%+2px)] -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1 text-[10px] font-semibold text-slate-100">
      {children}
    </span>
  );
}

const DRAG_THRESHOLD_PX = 4;

/** A marker that is clicked to select, or dragged to a new place on the map */
function DraggableMarker({
  pos,
  mapRef,
  toPercent,
  label,
  dataUnitId,
  disabled,
  onDrop,
  onTap,
  children,
}: {
  pos: MapPoint;
  mapRef: RefObject<HTMLDivElement | null>;
  toPercent: (clientX: number, clientY: number) => MapPoint;
  label: string;
  dataUnitId?: string;
  disabled: boolean;
  onDrop: (pos: MapPoint) => void;
  onTap: () => void;
  children: ReactNode;
}) {
  // While dragging, the marker follows the pointer locally; the new position is sent on drop only
  const [drag, setDrag] = useState<{ x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const dragging = !!drag?.moved;
  const x = dragging ? drag.x : pos.x;
  const y = dragging ? drag.y : pos.y;

  return (
    <button
      type="button"
      aria-label={label}
      data-unit-id={dataUnitId}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        if (!mapRef.current) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ x: pos.x, y: pos.y, startX: e.clientX, startY: e.clientY, moved: false });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD_PX;
        if (moved) setDrag({ ...drag, ...toPercent(e.clientX, e.clientY), moved });
      }}
      onPointerUp={() => {
        if (drag?.moved) onDrop({ x: drag.x, y: drag.y });
        else if (drag) onTap();
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
      className={`group absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing disabled:cursor-crosshair ${
        dragging ? 'z-20' : 'z-10 transition-[left,top] duration-700'
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {children}
    </button>
  );
}

function SelectionCard({
  unit,
  incident,
  lot,
  onClose,
  onRemoveIncident,
  onRemoveLot,
}: {
  unit?: TacticalUnit;
  incident?: TacticalIncident;
  lot?: ParkingLot;
  onClose: () => void;
  onRemoveIncident: (id: string) => void;
  onRemoveLot: (id: string) => void;
}) {
  if (!unit && !incident && !lot) {
    return (
      <div className="rounded border border-dashed border-slate-700 p-3 text-slate-400">
        לחיצה על סמל במפה לפרטים (ובכוח: קריאה בקשר). גרירה משנה מיקום. אירועים וחניונים מסמנים במפה מהרשימה למטה.
      </div>
    );
  }
  const rows: [string, ReactNode][] = [];
  let title = '';
  let remove: (() => void) | null = null;
  if (unit) {
    title = unit.callSign;
    rows.push(
      ['סוג', UNIT_TYPE_LABEL[unit.type]],
      ['סטטוס', <span className={UNIT_STATUS[unit.status].text}>{UNIT_STATUS[unit.status].label}</span>],
      ['מפקד', unit.commander],
      ['גזרה', unit.sector],
      ['ריבוע', gridRef(unit)],
      ['קשר אחרון', <span className="font-mono">{unit.lastContact}</span>]
    );
  } else if (incident) {
    title = incident.title;
    rows.push(
      ['מספר', incident.id],
      ['דרג', <span className={TIER_PIN[incident.tier].text}>{`${incident.tier} - ${TIER_LABEL[incident.tier]}`}</span>],
      ['מיקום', incident.location || '—'],
      ['ריבוע', incident.mapPos ? gridRef(incident.mapPos) : '—'],
      ['כוחות', incident.assignedUnits.join(', ') || '—']
    );
    remove = () => onRemoveIncident(incident.id);
  } else if (lot) {
    const r = lotRatio(lot);
    title = `חניון ${lot.name}`;
    rows.push(
      ['מצב', PARKING_STATUS_LABEL[lot.status]],
      ['תפוסה', r === null ? 'לא הוגדרה קיבולת' : `${lot.occupied}/${lot.capacity} (${percent(r)}%)`],
      ['ריבוע', lot.mapPos ? gridRef(lot.mapPos) : '—']
    );
    remove = () => onRemoveLot(lot.id);
  }
  return (
    <div className="rounded border border-cyan-800/60 bg-black/30 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-sm font-bold text-cyan-200">{title}</div>
        <button type="button" onClick={onClose} aria-label="סגירת פרטים" className="text-slate-400 hover:text-slate-200">
          <X size={14} />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-400">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {remove && (
        <button type="button" data-edit-control onClick={remove} className="mt-2 text-[11px] text-slate-400 underline hover:text-slate-200">
          הסרה מהמפה
        </button>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded border border-slate-800 p-2 text-[11px] text-slate-300">
      {Object.entries(UNIT_STATUS).map(([k, v]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-3.5 rounded-[2px] border-2 ${v.border}`} /> {v.label}
        </span>
      ))}
      {([1, 2, 3] as const).map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rotate-45 ${TIER_PIN[t].bg}`} /> אירוע דרג {t}
        </span>
      ))}
      <span className="col-span-2 flex items-center gap-1.5">
        {(['green', 'yellow', 'orange', 'red'] as const).map((l) => (
          <span key={l} className={`h-2.5 w-2.5 rounded-sm ${LEVEL_STYLE[l].bar}`} />
        ))}
        חניון לפי תפוסה
      </span>
    </div>
  );
}
