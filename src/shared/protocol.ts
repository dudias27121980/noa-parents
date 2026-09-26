import {
  Agency,
  AlertLevel,
  LogEntry,
  Milestone,
  MilestoneStatus,
  TacticalIncident,
  TacticalUnit,
} from '../types/tactical';

/**
 * Wire protocol between stations (browsers) and the shared server.
 * The server is the single source of truth: stations send Actions, the server applies them,
 * assigns ids and log timestamps, and broadcasts the resulting changes to every station.
 */

export interface Shift {
  commanderName: string;
  shiftName: string;
}

export interface SharedState {
  milestones: Milestone[];
  incidents: TacticalIncident[];
  units: TacticalUnit[];
  agencies: Agency[];
  /** Newest first; stations receive at most LOG_WINDOW entries, the server keeps all of them */
  logs: LogEntry[];
  alertLevel: AlertLevel;
  mainFrequency: string;
  shift: Shift;
}

export const LOG_WINDOW = 500;

export type CollectionName = 'milestones' | 'incidents' | 'units' | 'agencies';
export type SingletonName = 'alertLevel' | 'mainFrequency' | 'shift';

/* ---------- Edits: only the fields a station actually changed are sent ---------- */

export type MilestoneFields = Pick<
  Milestone,
  'code' | 'title' | 'scheduledDate' | 'scheduledTime' | 'durationMin' | 'owner' | 'description'
>;
export type MilestonePatch = Partial<MilestoneFields>;
export type IncidentPatch = Partial<
  Pick<TacticalIncident, 'title' | 'location' | 'details' | 'tier' | 'tierLabel' | 'status' | 'assignedUnits'>
>;
export type UnitPatch = Partial<Pick<TacticalUnit, 'callSign' | 'type' | 'status' | 'commander' | 'personnel' | 'sector'>>;
export type AgencyPatch = Partial<Pick<Agency, 'name' | 'role' | 'liaison' | 'frequency' | 'phone' | 'status'>>;
export type NewIncident = Partial<Pick<TacticalIncident, 'title' | 'location' | 'details' | 'tier' | 'tierLabel' | 'assignedUnits'>>;

export type Action =
  | { type: 'milestone.setStatus'; id: string; status: MilestoneStatus }
  | { type: 'milestone.update'; id: string; patch: MilestonePatch }
  | { type: 'milestone.add'; fields: MilestoneFields }
  | { type: 'milestone.delete'; id: string }
  | { type: 'incident.add'; incident: NewIncident }
  | { type: 'incident.resolve'; id: string }
  | { type: 'incident.update'; id: string; patch: IncidentPatch }
  | { type: 'unit.update'; id: string; patch: UnitPatch }
  | { type: 'agency.update'; id: string; patch: AgencyPatch }
  | { type: 'alertLevel.set'; level: AlertLevel }
  | { type: 'frequency.set'; frequency: string }
  | { type: 'shift.set'; shift: Shift }
  | { type: 'sim.trigger'; name: string; description: string }
  | { type: 'demo.reset' };

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** Changes produced by one action (or a server tick), applied in the same way on every station */
export interface StatePatch {
  upsert?: Partial<{ [K in CollectionName]: SharedState[K] }>;
  remove?: Partial<Record<CollectionName, string[]>>;
  set?: Partial<Pick<SharedState, SingletonName>>;
  /** New log entries, newest first */
  logs?: LogEntry[];
}

export interface StationInfo {
  name: string;
  /** Open connections (the same station may have more than one tab) */
  connections: number;
}

export interface Notice {
  level: 'critical' | 'info';
  text: string;
  /** Station that caused it; the station itself does not get its own notices */
  from: string;
}

export type ClientMessage = { t: 'action'; reqId: number; action: Action };

export type ServerMessage =
  | { t: 'snapshot'; state: SharedState; stations: StationInfo[]; you: string }
  | { t: 'patch'; patch: StatePatch }
  | { t: 'result'; reqId: number; result: ActionResult }
  | { t: 'presence'; stations: StationInfo[] }
  | { t: 'notice'; notice: Notice };

/** WebSocket close codes the client acts on */
export const CLOSE_UNAUTHORIZED = 4001;

export const applyPatch = (state: SharedState, patch: StatePatch): SharedState => {
  const next: SharedState = { ...state, ...patch.set };
  (['milestones', 'incidents', 'units', 'agencies'] as const).forEach((name) => {
    const up = patch.upsert?.[name];
    const rm = patch.remove?.[name];
    if (!up && !rm) return;
    let list: { id: string }[] = state[name];
    if (rm?.length) list = list.filter((row) => !rm.includes(row.id));
    if (up?.length) {
      const byId = new Map(up.map((row) => [row.id, row]));
      list = list.map((row) => byId.get(row.id) ?? row);
      const existing = new Set(list.map((row) => row.id));
      list = [...list, ...up.filter((row) => !existing.has(row.id))];
    }
    // Milestones arrive already normalized (sorted); keep the server's order for them
    if (name === 'milestones' && up?.length) {
      const order = new Map(up.map((row, i) => [row.id, i]));
      if (up.length === list.length) list = [...list].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    }
    (next as unknown as Record<CollectionName, unknown>)[name] = list;
  });
  if (patch.logs?.length) next.logs = [...patch.logs, ...state.logs].slice(0, LOG_WINDOW);
  return next;
};
