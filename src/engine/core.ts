import {
  ALERT_LEVELS,
  AgencyStatus,
  IncidentStatus,
  LogEntry,
  LogSeverity,
  ParkingLot,
  ParkingStatus,
  Milestone,
  MilestoneStatus,
  MilestoneTask,
  RouteStatus,
  TacticalIncident,
  TacticalUnit,
  UnitStatus,
  UnitType,
} from '../types/tactical';
import {
  Action,
  ActionResult,
  COLLECTIONS,
  CollectionName,
  MilestoneFields,
  Notice,
  ParkingFields,
  SharedState,
  SingletonName,
  StatePatch,
  applyPatch,
} from '../shared/protocol';
import {
  AGENCY_STATUS_LABEL,
  INCIDENT_STATUS_LABEL,
  PARKING_STATUS_LABEL,
  ROUTE_STATUS_LABEL,
  TIER_LABEL,
  UNIT_STATUS_LABEL,
  UNIT_TYPE_LABEL,
} from '../shared/labels';
import {
  DEFAULT_ALERT_LEVEL,
  DEFAULT_HQ_NAME,
  PREVIOUS_DEFAULT_HQ_NAME,
  DEFAULT_MAIN_FREQUENCY,
  DEFAULT_SHIFT,
  INITIAL_AGENCIES,
  INITIAL_ROUTES,
  INITIAL_SCENARIOS,
  INITIAL_UNITS,
  buildDemoIncidents,
  INITIAL_PARKING_LOTS,
  buildDemoLogs,
  buildDemoMilestones,
} from '../data/tacticalData';
import { STATUS_BADGE, normalizeMilestones } from '../utils/schedule';
import { clockTime, formatDate, isIsoDate, isoDate, parseHHMM } from '../utils/time';
import { nextIdNumber } from '../utils/ids';
import { changedFields } from '../shared/diff';
import { lotRatio, percent, statusForOccupancy } from '../shared/parking';
import type { Db } from './dbTypes';

export interface Outcome {
  result: ActionResult;
  /** Changes to broadcast to every station */
  patch?: StatePatch;
  /** Everything changed (reset): stations get a fresh snapshot instead of a patch */
  reset?: boolean;
  notice?: Omit<Notice, 'from'>;
}

const MS_SOURCE = 'חפ"ק אג"מ מרחב יהודה';
const COMBAT_ORDER = 'פע״מ - פקודת לחימה';

const MILESTONE_STATUSES: MilestoneStatus[] = ['completed', 'active', 'next', 'scheduled'];
const INCIDENT_STATUSES = Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[];
const UNIT_STATUSES = Object.keys(UNIT_STATUS_LABEL) as UnitStatus[];
const UNIT_TYPES = Object.keys(UNIT_TYPE_LABEL) as UnitType[];
const AGENCY_STATUSES = Object.keys(AGENCY_STATUS_LABEL) as AgencyStatus[];

/* ---------- input validation (never trust a station's payload) ---------- */

class Invalid extends Error {}
const fail = (message: string): never => {
  throw new Invalid(message);
};
const NOT_FOUND = 'הרשומה לא נמצאה - ייתכן שנמחקה בעמדה אחרת';

const str = (v: unknown, field: string, { required = false, max = 500 } = {}): string => {
  if (typeof v !== 'string') return fail(`שדה לא תקין: ${field}`);
  const s = v.trim();
  if (required && !s) return fail(`שדה חובה: ${field}`);
  if (s.length > max) return fail(`ערך ארוך מדי: ${field}`);
  return s;
};
const oneOf = <T extends string | number>(v: unknown, values: readonly T[], field: string): T =>
  values.includes(v as T) ? (v as T) : fail(`ערך לא תקין: ${field}`);
const int = (v: unknown, min: number, max: number, field: string): number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fail(`מספר לא תקין: ${field}`);
const frequencyOf = (v: unknown): string =>
  typeof v === 'string' && /^\d{4}$/.test(v) ? v : fail('תדר חייב להיות 4 ספרות');
const phoneOf = (v: unknown): string =>
  typeof v === 'string' && /^\*?\d[\d\s-]{1,14}$/.test(v.trim()) ? v.trim() : fail('מספר טלפון לא תקין');
const obj = (v: unknown, field: string): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(`נתונים חסרים: ${field}`);

const validateMilestoneFields = (raw: Record<string, unknown>, partial: boolean): Partial<MilestoneFields> => {
  const out: Partial<MilestoneFields> = {};
  const has = (k: string) => k in raw || !partial;
  if (has('code')) out.code = str(raw.code, 'קוד', { required: true, max: 20 });
  if (has('title')) out.title = str(raw.title, 'כותרת', { required: true, max: 200 });
  if (has('scheduledDate')) out.scheduledDate = isIsoDate(String(raw.scheduledDate)) ? String(raw.scheduledDate) : fail('תאריך לא תקין');
  if (has('scheduledTime')) out.scheduledTime = parseHHMM(String(raw.scheduledTime)) !== null ? String(raw.scheduledTime) : fail('שעה לא תקינה');
  if (has('durationMin')) out.durationMin = int(raw.durationMin, 1, 1440, 'משך');
  if (has('owner')) out.owner = str(raw.owner ?? '', 'אחראי', { max: 100 });
  if (has('description')) out.description = str(raw.description ?? '', 'תיאור', { max: 1000 });
  return out;
};

/* ---------- transaction: collects changes, applies them to a working copy ---------- */

class Tx {
  patch: StatePatch = {};
  notice?: Omit<Notice, 'from'>;

  constructor(
    public state: SharedState,
    private station: string,
    private now: Date,
    private nextLogId: () => string
  ) {}

  upsert<K extends CollectionName>(name: K, rows: SharedState[K]) {
    this.state = applyPatch(this.state, { upsert: { [name]: rows } });
    const byId = new Map<string, { id: string }>((this.patch.upsert?.[name] ?? []).map((r: { id: string }) => [r.id, r]));
    (rows as { id: string }[]).forEach((r) => byId.set(r.id, r));
    this.patch.upsert = { ...this.patch.upsert, [name]: [...byId.values()] };
  }

  remove(name: Exclude<CollectionName, 'milestones'>, ids: string[]) {
    this.state = applyPatch(this.state, { remove: { [name]: ids } });
    this.patch.remove = { ...this.patch.remove, [name]: [...(this.patch.remove?.[name] ?? []), ...ids] };
    // A record created and deleted in the same action must not be re-sent
    const up = this.patch.upsert?.[name] as { id: string }[] | undefined;
    if (up) this.patch.upsert = { ...this.patch.upsert, [name]: up.filter((r) => !ids.includes(r.id)) };
  }

  /** Milestones are always sent whole: normalizing can re-order rows and change several statuses */
  setMilestones(list: Milestone[]) {
    const next = normalizeMilestones(list);
    const removed = this.state.milestones.filter((m) => !next.some((n) => n.id === m.id)).map((m) => m.id);
    this.state = { ...this.state, milestones: next };
    this.patch.upsert = { ...this.patch.upsert, milestones: next };
    if (removed.length) this.patch.remove = { ...this.patch.remove, milestones: removed };
  }

  set<K extends SingletonName>(key: K, value: SharedState[K]) {
    this.state = { ...this.state, [key]: value };
    this.patch.set = { ...this.patch.set, [key]: value };
  }

  log(severity: LogSeverity, source: string, action: string) {
    const entry: LogEntry = {
      id: this.nextLogId(),
      date: isoDate(this.now),
      timestamp: clockTime(this.now),
      severity,
      source,
      action,
      station: this.station,
    };
    this.state = applyPatch(this.state, { logs: [entry] });
    this.patch.logs = [entry, ...(this.patch.logs ?? [])];
  }
}

/* ---------- schema ---------- */

/**
 * 1: first shared server. 2: tasks as {id,text,done}; LPR alerts, routes, drill scenarios, HQ name.
 * 3: parking lots replace the LPR alerts.
 * 4: the HQ name becomes the page title (untouched old default → the new one).
 */
const SCHEMA_VERSION = 4;

/** Upgrades a database from any earlier version in place, keeping everything already entered */
const migrate = (s: SharedState, fresh: SharedState): SharedState => ({
  ...s,
  milestones: s.milestones.map((m) => ({
    ...m,
    tasks: (m.tasks as unknown[]).map((t, i): MilestoneTask =>
      typeof t === 'string' ? { id: `${m.id}-T${i + 1}`, text: t, done: m.statusType === 'completed' } : (t as MilestoneTask)
    ),
  })),
  parkingLots: s.parkingLots?.length ? s.parkingLots : fresh.parkingLots,
  routes: s.routes?.length ? s.routes : fresh.routes,
  scenarios: s.scenarios?.length ? s.scenarios : fresh.scenarios,
  hqName: s.hqName && s.hqName !== PREVIOUS_DEFAULT_HQ_NAME ? s.hqName : fresh.hqName,
});

const PARKING_STATUSES: readonly ParkingStatus[] = ['available', 'filling', 'full', 'closed'];
const ROUTE_STATUSES: readonly RouteStatus[] = ['open', 'partial', 'closed'];

/** " - 31/40 (77%)" for a lot with a capacity, "" otherwise */
const occupancyText = (lot: ParkingLot) => {
  const r = lotRatio(lot);
  return r === null ? '' : ` - ${lot.occupied}/${lot.capacity} (${percent(r)}%)`;
};

/** Parking lot fields from a station; `partial` for an update (only the fields sent) */
const parkingFields = (raw: Record<string, unknown>, partial: boolean): Partial<ParkingFields> => {
  const has = (k: string) => k in raw || !partial;
  const out: Partial<ParkingFields> = {};
  if (has('name')) out.name = str(raw.name, 'שם חניון', { required: true, max: 40 });
  if (has('status')) out.status = oneOf(raw.status, PARKING_STATUSES, 'מצב');
  if (has('capacity')) out.capacity = int(raw.capacity ?? 0, 0, 100_000, 'קיבולת');
  if (has('occupied')) out.occupied = int(raw.occupied ?? 0, 0, 100_000, 'תפוסה');
  if (has('note')) out.note = str(raw.note ?? '', 'הערה', { max: 200 });
  return out;
};

const coord = (v: unknown, field: string) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 10) / 10 : fail(`מיקום לא תקין: ${field}`);

/* ---------- core ---------- */

export function createCore({ db, now = () => new Date() }: { db: Db; now?: () => Date }) {
  const seed = (): SharedState => {
    const t = now();
    return {
      milestones: buildDemoMilestones(t),
      incidents: buildDemoIncidents(isoDate(t)),
      units: INITIAL_UNITS,
      agencies: INITIAL_AGENCIES,
      parkingLots: INITIAL_PARKING_LOTS,
      routes: INITIAL_ROUTES,
      scenarios: INITIAL_SCENARIOS,
      logs: buildDemoLogs(isoDate(t)),
      alertLevel: DEFAULT_ALERT_LEVEL,
      mainFrequency: DEFAULT_MAIN_FREQUENCY,
      shift: DEFAULT_SHIFT,
      hqName: DEFAULT_HQ_NAME,
    };
  };

  const writeAll = (s: SharedState) =>
    db.transaction(() => {
      COLLECTIONS.forEach((c) => db.replaceCollection(c, s[c]));
      db.setSingleton('alertLevel', s.alertLevel);
      db.setSingleton('mainFrequency', s.mainFrequency);
      db.setSingleton('shift', s.shift);
      db.setSingleton('hqName', s.hqName);
      db.setSingleton('schemaVersion', SCHEMA_VERSION);
      db.clearLogs();
      db.appendLogs(s.logs);
    });

  let state = db.load();
  if (!state) {
    state = seed();
    writeAll(state);
  } else if ((db.getSingleton<number>('schemaVersion') ?? 1) < SCHEMA_VERSION) {
    state = migrate(state, seed());
    const migrated = state;
    db.transaction(() => {
      db.replaceCollection('milestones', migrated.milestones);
      (['parkingLots', 'routes', 'scenarios'] as const).forEach((c) => db.replaceCollection(c, migrated[c]));
      db.setSingleton('hqName', migrated.hqName);
      db.setSingleton('schemaVersion', SCHEMA_VERSION);
    });
  }

  // Ids are allocated here, by the one server, so two stations can never create the same number
  let incidentSeq = nextIdNumber(state.incidents.map((i) => i.id), 7300);
  let milestoneSeq = nextIdNumber(state.milestones.map((m) => m.id), 100);
  // Other collections: never reuse the number of a deleted record (a station may still have it open)
  const seqs = {} as Record<'units' | 'agencies' | 'parkingLots' | 'routes' | 'scenarios', number>;
  const resetSeqs = () => {
    seqs.units = nextIdNumber(state!.units.map((r) => r.id), 10);
    seqs.agencies = nextIdNumber(state!.agencies.map((r) => r.id), 10);
    seqs.parkingLots = nextIdNumber(state!.parkingLots.map((r) => r.id), 1);
    seqs.routes = nextIdNumber(state!.routes.map((r) => r.id), 1000);
    seqs.scenarios = nextIdNumber(state!.scenarios.map((r) => r.id), 10);
  };
  resetSeqs();
  const newId = (c: keyof typeof seqs, prefix: string) => `${prefix}-${seqs[c]++}`;
  let logSeq = Math.max(db.maxLogNumber() + 1, nextIdNumber(state.logs.map((l) => l.id), 500));
  const nextLogId = () => `LOG-${String(logSeq++).padStart(4, '0')}`;

  const commit = (tx: Tx) => {
    const { patch } = tx;
    db.transaction(() => {
      COLLECTIONS.filter((c) => c !== 'milestones').forEach((c) => {
        if (patch.upsert?.[c]?.length) db.upsert(c, patch.upsert[c]!);
        if (patch.remove?.[c]?.length) db.remove(c, patch.remove[c]!);
      });
      if (patch.upsert?.milestones) db.replaceCollection('milestones', tx.state.milestones);
      Object.entries(patch.set ?? {}).forEach(([k, v]) => db.setSingleton(k as SingletonName, v));
      if (patch.logs?.length) db.appendLogs(patch.logs);
    });
    state = tx.state;
  };

  const findIncident = (s: SharedState, id: unknown) => s.incidents.find((i) => i.id === id) ?? fail(NOT_FOUND);

  const addIncident = (tx: Tx, raw: Record<string, unknown>): TacticalIncident => {
    const tier = raw.tier === undefined ? 2 : oneOf(raw.tier, [1, 2, 3] as const, 'דרג');
    const assigned = Array.isArray(raw.assignedUnits)
      ? raw.assignedUnits.map((u) => str(u, 'כוח', { max: 50 })).filter(Boolean)
      : [];
    const t = now();
    const incident: TacticalIncident = {
      id: `INC-${incidentSeq++}`,
      date: isoDate(t),
      time: clockTime(t),
      tier,
      tierLabel: raw.tierLabel ? str(raw.tierLabel, 'תווית דרג', { max: 50 }) : TIER_LABEL[tier],
      title: (raw.title !== undefined && str(raw.title, 'כותרת', { max: 200 })) || 'אירוע חריג בגזרה',
      location: (raw.location !== undefined && str(raw.location, 'מיקום', { max: 200 })) || 'מרחב יהודה',
      details: raw.details !== undefined ? str(raw.details, 'פרטים', { max: 2000 }) : '',
      status: 'active',
      assignedUnits: assigned.length ? assigned : ['כוח כוננות חפ"ק'],
    };
    tx.upsert('incidents', [incident]);
    tx.log(tier === 1 ? 'CRITICAL' : 'WARNING', 'יומן מבצעים', `פתיחת אירוע חדש ${incident.id}: ${incident.title}`);
    if (tier === 1) tx.notice = { level: 'critical', text: `אירוע דחוף נפתח: ${incident.title}` };
    return incident;
  };

  const setAlertLevel = (tx: Tx, level: unknown) => {
    const next = oneOf(level, ALERT_LEVELS, 'רמת כוננות');
    if (next === tx.state.alertLevel) return;
    tx.set('alertLevel', next);
    const critical = next === COMBAT_ORDER;
    tx.log(critical ? 'CRITICAL' : 'WARNING', 'מפקד משמרת', `שינוי רמת כוננות: ${next}`);
    tx.notice = { level: critical ? 'critical' : 'info', text: `רמת כוננות: ${next}` };
  };

  const handlers: { [T in Action['type']]: (tx: Tx, a: Extract<Action, { type: T }>) => string | void } = {
    'milestone.setStatus'(tx, a) {
      const target = tx.state.milestones.find((m) => m.id === a.id) ?? fail(NOT_FOUND);
      const status = oneOf(a.status, MILESTONE_STATUSES, 'סטטוס');
      if (target.statusType === status) return;
      tx.setMilestones(tx.state.milestones.map((m) => (m.id === a.id ? { ...m, statusType: status } : m)));
      tx.log('NOMINAL', MS_SOURCE, `אבן דרך ${target.code} "${target.title}": ${STATUS_BADGE[status]}`);
    },

    'milestone.update'(tx, a) {
      const target = tx.state.milestones.find((m) => m.id === a.id) ?? fail(NOT_FOUND);
      const patch = changedFields(target, validateMilestoneFields(obj(a.patch, 'שינויים'), true));
      if (Object.keys(patch).length === 0) return;
      const next = { ...target, ...patch };
      tx.setMilestones(tx.state.milestones.map((m) => (m.id === a.id ? next : m)));
      tx.log('NOMINAL', MS_SOURCE, `עריכת אבן דרך ${next.code} "${next.title}"`);
    },

    'milestone.add'(tx, a) {
      const fields = validateMilestoneFields(obj(a.fields, 'שורה'), false) as MilestoneFields;
      const row: Milestone = {
        id: `MS-${milestoneSeq++}`,
        ...fields,
        statusType: 'scheduled',
        statusBadge: STATUS_BADGE.scheduled,
        tasks: [],
      };
      tx.setMilestones([...tx.state.milestones, row]);
      tx.log(
        'NOMINAL',
        MS_SOURCE,
        `הוספת אבן דרך ${row.code} "${row.title}" ב-${formatDate(row.scheduledDate)} ${row.scheduledTime}`
      );
      return row.id;
    },

    'milestone.delete'(tx, a) {
      const target = tx.state.milestones.find((m) => m.id === a.id) ?? fail(NOT_FOUND);
      tx.setMilestones(tx.state.milestones.filter((m) => m.id !== a.id));
      tx.log('WARNING', MS_SOURCE, `מחיקת אבן דרך ${target.code} "${target.title}"`);
    },

    'incident.add'(tx, a) {
      return addIncident(tx, obj(a.incident, 'אירוע')).id;
    },

    'incident.resolve'(tx, a) {
      const target = findIncident(tx.state, a.id);
      if (target.status === 'resolved') return;
      tx.upsert('incidents', [{ ...target, status: 'resolved' }]);
      tx.log('NOMINAL', 'יומן מבצעים', `סגירת אירוע ${target.id}`);
    },

    'incident.update'(tx, a) {
      const target = findIncident(tx.state, a.id);
      const raw = obj(a.patch, 'שינויים');
      const clean: Partial<TacticalIncident> = {};
      if ('title' in raw) clean.title = str(raw.title, 'כותרת', { required: true, max: 200 });
      if ('location' in raw) clean.location = str(raw.location, 'מיקום', { max: 200 });
      if ('details' in raw) clean.details = str(raw.details, 'פרטים', { max: 2000 });
      if ('tier' in raw) clean.tier = oneOf(raw.tier, [1, 2, 3] as const, 'דרג');
      if ('tierLabel' in raw) clean.tierLabel = str(raw.tierLabel, 'תווית דרג', { required: true, max: 50 });
      if ('status' in raw) clean.status = oneOf(raw.status, INCIDENT_STATUSES, 'סטטוס');
      if ('assignedUnits' in raw) {
        if (!Array.isArray(raw.assignedUnits)) fail('כוחות משויכים לא תקינים');
        clean.assignedUnits = (raw.assignedUnits as unknown[]).map((u) => str(u, 'כוח', { max: 50 })).filter(Boolean);
      }
      const patch = changedFields(target, clean);
      if (Object.keys(patch).length === 0) return;
      const next = { ...target, ...patch };
      tx.upsert('incidents', [next]);

      const notes: string[] = [];
      if (patch.status) notes.push(`סטטוס: ${INCIDENT_STATUS_LABEL[target.status]} ← ${INCIDENT_STATUS_LABEL[patch.status]}`);
      if (patch.tier) notes.push(`דרג ${target.tier} ← ${patch.tier}`);
      const escalated = patch.tier === 1 && target.tier !== 1;
      tx.log(
        escalated ? 'CRITICAL' : 'NOMINAL',
        'יומן מבצעים',
        `עריכת אירוע ${target.id}: ${next.title}${notes.length ? ` (${notes.join(', ')})` : ''}`
      );
      if (escalated) tx.notice = { level: 'critical', text: `הסלמה לדרג 1: ${next.title}` };
    },

    'unit.update'(tx, a) {
      const target = tx.state.units.find((u) => u.id === a.id) ?? fail(NOT_FOUND);
      const raw = obj(a.patch, 'שינויים');
      const clean: Partial<typeof target> = {};
      if ('callSign' in raw) {
        clean.callSign = str(raw.callSign, 'אות קריאה', { required: true, max: 30 });
        if (tx.state.units.some((u) => u.id !== target.id && u.callSign === clean.callSign)) fail('אות הקריאה תפוס');
      }
      if ('type' in raw) clean.type = oneOf(raw.type, UNIT_TYPES, 'סוג');
      if ('status' in raw) clean.status = oneOf(raw.status, UNIT_STATUSES, 'סטטוס');
      if ('commander' in raw) clean.commander = str(raw.commander, 'מפקד', { max: 60 });
      if ('personnel' in raw) clean.personnel = int(raw.personnel, 0, 999, 'לוחמים');
      if ('sector' in raw) clean.sector = str(raw.sector, 'גזרה', { max: 100 });
      if ('x' in raw) clean.x = coord(raw.x, 'x');
      if ('y' in raw) clean.y = coord(raw.y, 'y');
      const patch = changedFields(target, clean);
      if (Object.keys(patch).length === 0) return;

      const next = { ...target, ...patch };
      // Moving a unit on the map is routine telemetry: broadcast, but keep it out of the log
      const onlyMoved = Object.keys(patch).every((k) => k === 'x' || k === 'y');
      if (onlyMoved) {
        tx.upsert('units', [next]);
        return;
      }
      // Signal follows the radio link: none when offline, a fresh reading when it comes back
      if (next.status === 'offline') next.signalStrength = 0;
      else if (target.status === 'offline') next.signalStrength = 85;
      if (next.status !== target.status) next.lastContact = clockTime(now());
      tx.upsert('units', [next]);

      // Incidents reference units by call sign — carry a rename over so assignments don't go stale
      const renamed = patch.callSign ?? null;
      if (renamed) {
        const affected = tx.state.incidents
          .filter((i) => i.assignedUnits.includes(target.callSign))
          .map((i) => ({ ...i, assignedUnits: i.assignedUnits.map((c) => (c === target.callSign ? renamed : c)) }));
        if (affected.length) tx.upsert('incidents', affected);
      }

      const notes: string[] = [];
      if (renamed) notes.push(`אות קריאה: ${target.callSign} ← ${renamed}`);
      if (patch.status) notes.push(`סטטוס: ${UNIT_STATUS_LABEL[target.status]} ← ${UNIT_STATUS_LABEL[patch.status]}`);
      if (patch.commander !== undefined) notes.push(`מפקד: ${target.commander || '—'} ← ${patch.commander || '—'}`);
      tx.log(
        patch.status === 'offline' ? 'WARNING' : 'NOMINAL',
        'שליטה בכוחות',
        `עריכת כוח ${next.callSign}${notes.length ? ` (${notes.join(', ')})` : ''}`
      );
    },

    'agency.update'(tx, a) {
      const target = tx.state.agencies.find((ag) => ag.id === a.id) ?? fail(NOT_FOUND);
      const raw = obj(a.patch, 'שינויים');
      const clean: Partial<typeof target> = {};
      if ('name' in raw) clean.name = str(raw.name, 'שם', { required: true, max: 60 });
      if ('role' in raw) clean.role = str(raw.role, 'תפקיד', { max: 100 });
      if ('liaison' in raw) clean.liaison = str(raw.liaison, 'איש קישור', { max: 60 });
      if ('status' in raw) clean.status = oneOf(raw.status, AGENCY_STATUSES, 'סטטוס');
      if ('frequency' in raw) clean.frequency = raw.frequency === null ? null : frequencyOf(raw.frequency);
      if ('phone' in raw) clean.phone = raw.phone === null ? null : phoneOf(raw.phone);
      const patch = changedFields(target, clean);
      if (Object.keys(patch).length === 0) return;

      const next = { ...target, ...patch };
      if (!next.frequency && !next.phone) fail('נדרש תדר או מספר טלפון');
      const statusChanged = next.status !== target.status;
      if (statusChanged) next.lastSync = clockTime(now());
      tx.upsert('agencies', [next]);

      const contact = (x: typeof target) => (x.frequency ? `תדר ${x.frequency}` : `טלפון ${x.phone ?? '—'}`);
      const notes: string[] = [];
      if (contact(next) !== contact(target)) notes.push(`${contact(target)} ← ${contact(next)}`);
      if (statusChanged) notes.push(`סטטוס: ${AGENCY_STATUS_LABEL[target.status]} ← ${AGENCY_STATUS_LABEL[next.status]}`);
      if (next.liaison !== target.liaison) notes.push(`קישור: ${target.liaison || '—'} ← ${next.liaison || '—'}`);
      tx.log(
        next.status === 'disconnected' && statusChanged ? 'WARNING' : 'NOMINAL',
        'תיאום כוחות חבירים',
        `עריכת כוח חביר ${next.name}${notes.length ? ` (${notes.join(', ')})` : ''}`
      );
    },

    'task.add'(tx, a) {
      const ms = tx.state.milestones.find((m) => m.id === a.milestoneId) ?? fail(NOT_FOUND);
      const task: MilestoneTask = {
        id: `${ms.id}-T${nextIdNumber(ms.tasks.map((t) => t.id), 1)}`,
        text: str(a.text, 'משימה', { required: true, max: 200 }),
        done: false,
      };
      tx.setMilestones(tx.state.milestones.map((m) => (m.id === ms.id ? { ...m, tasks: [...m.tasks, task] } : m)));
      tx.log('NOMINAL', MS_SOURCE, `משימה נוספה ל-${ms.code} "${ms.title}": ${task.text}`);
      return task.id;
    },

    'task.update'(tx, a) {
      const ms = tx.state.milestones.find((m) => m.id === a.milestoneId) ?? fail(NOT_FOUND);
      const task = ms.tasks.find((t) => t.id === a.taskId) ?? fail(NOT_FOUND);
      const raw = obj(a.patch, 'שינויים');
      const clean: Partial<MilestoneTask> = {};
      if ('text' in raw) clean.text = str(raw.text, 'משימה', { required: true, max: 200 });
      if ('done' in raw) clean.done = typeof raw.done === 'boolean' ? raw.done : fail('ערך לא תקין: בוצע');
      const patch = changedFields(task, clean);
      if (Object.keys(patch).length === 0) return;
      const next = { ...task, ...patch };
      tx.setMilestones(
        tx.state.milestones.map((m) => (m.id === ms.id ? { ...m, tasks: m.tasks.map((t) => (t.id === task.id ? next : t)) } : m))
      );
      const what =
        patch.done === undefined ? `עריכת משימה ב-${ms.code}: ${next.text}` : `${ms.code}: "${next.text}" ${next.done ? 'בוצעה' : 'סומנה כלא בוצעה'}`;
      tx.log('NOMINAL', MS_SOURCE, what);
    },

    'task.delete'(tx, a) {
      const ms = tx.state.milestones.find((m) => m.id === a.milestoneId) ?? fail(NOT_FOUND);
      const task = ms.tasks.find((t) => t.id === a.taskId) ?? fail(NOT_FOUND);
      tx.setMilestones(tx.state.milestones.map((m) => (m.id === ms.id ? { ...m, tasks: m.tasks.filter((t) => t.id !== task.id) } : m)));
      tx.log('WARNING', MS_SOURCE, `משימה נמחקה מ-${ms.code}: ${task.text}`);
    },

    'unit.add'(tx, a) {
      const raw = obj(a.fields, 'כוח');
      const callSign = str(raw.callSign, 'אות קריאה', { required: true, max: 30 });
      if (tx.state.units.some((u) => u.callSign === callSign)) fail('אות הקריאה תפוס');
      const status = oneOf(raw.status, UNIT_STATUSES, 'סטטוס');
      const t = now();
      // New units appear near the map centre, spread a little so they don't stack; drag to place them
      const spread = (tx.state.units.length % 5) * 4 - 8;
      const unit: TacticalUnit = {
        id: newId('units', 'U'),
        callSign,
        type: oneOf(raw.type, UNIT_TYPES, 'סוג'),
        status,
        commander: str(raw.commander ?? '', 'מפקד', { max: 60 }),
        personnel: int(raw.personnel, 0, 999, 'לוחמים'),
        sector: str(raw.sector ?? '', 'גזרה', { max: 100 }),
        x: 50 + spread,
        y: 50 + spread,
        lastContact: clockTime(t),
        signalStrength: status === 'offline' ? 0 : 90,
      };
      tx.upsert('units', [unit]);
      tx.log('NOMINAL', 'שליטה בכוחות', `כוח חדש: ${unit.callSign} (${UNIT_TYPE_LABEL[unit.type]}, ${unit.personnel} לוחמים)`);
      return unit.id;
    },

    'unit.delete'(tx, a) {
      const target = tx.state.units.find((u) => u.id === a.id) ?? fail(NOT_FOUND);
      tx.remove('units', [target.id]);
      // Incidents keep the call sign as history of who was assigned
      tx.log('WARNING', 'שליטה בכוחות', `כוח הוסר מהסד״כ: ${target.callSign}`);
    },

    'agency.add'(tx, a) {
      const raw = obj(a.fields, 'גורם');
      const agency = {
        id: newId('agencies', 'AG'),
        name: str(raw.name, 'שם', { required: true, max: 60 }),
        role: str(raw.role ?? '', 'תפקיד', { max: 100 }),
        liaison: str(raw.liaison ?? '', 'איש קישור', { max: 60 }),
        status: oneOf(raw.status, AGENCY_STATUSES, 'סטטוס'),
        frequency: raw.frequency == null ? null : frequencyOf(raw.frequency),
        phone: raw.phone == null ? null : phoneOf(raw.phone),
        lastSync: clockTime(now()),
      };
      if (!agency.frequency && !agency.phone) fail('נדרש תדר או מספר טלפון');
      tx.upsert('agencies', [agency]);
      tx.log('NOMINAL', 'תיאום כוחות חבירים', `כוח חביר חדש: ${agency.name}`);
      return agency.id;
    },

    'agency.delete'(tx, a) {
      const target = tx.state.agencies.find((ag) => ag.id === a.id) ?? fail(NOT_FOUND);
      tx.remove('agencies', [target.id]);
      tx.log('WARNING', 'תיאום כוחות חבירים', `כוח חביר הוסר: ${target.name}`);
    },

    'parking.add'(tx, a) {
      const raw = obj(a.fields, 'חניון');
      const fields = parkingFields(raw, false) as ParkingFields;
      if (tx.state.parkingLots.some((p) => p.name === fields.name)) fail('חניון בשם הזה כבר קיים');
      if (fields.capacity > 0 && fields.occupied > fields.capacity) fail(`תפוסה (${fields.occupied}) גדולה מהקיבולת (${fields.capacity})`);
      const lot: ParkingLot = { id: newId('parkingLots', 'P'), ...fields, updated: clockTime(now()) };
      lot.status = statusForOccupancy(lot);
      tx.upsert('parkingLots', [lot]);
      tx.log('NOMINAL', 'חניונים', `חניון נוסף: ${lot.name}${occupancyText(lot)}`);
      return lot.id;
    },

    'parking.update'(tx, a) {
      const target = tx.state.parkingLots.find((p) => p.id === a.id) ?? fail(NOT_FOUND);
      const clean = parkingFields(obj(a.patch, 'שינויים'), true);
      if (clean.name && tx.state.parkingLots.some((p) => p.id !== target.id && p.name === clean.name)) fail('חניון בשם הזה כבר קיים');
      const patch = changedFields(target, clean);
      if (Object.keys(patch).length === 0) return;
      const next: ParkingLot = { ...target, ...patch, updated: clockTime(now()) };
      if (next.capacity > 0 && next.occupied > next.capacity) fail(`תפוסה (${next.occupied}) גדולה מהקיבולת (${next.capacity})`);
      // New numbers set the status, unless the station chose one in the same change (e.g. closing the lot)
      if (!('status' in patch) && ('occupied' in patch || 'capacity' in patch)) next.status = statusForOccupancy(next);
      tx.upsert('parkingLots', [next]);

      const statusChanged = next.status !== target.status;
      const blocked = statusChanged && (next.status === 'full' || next.status === 'closed');
      const numbersChanged = 'occupied' in patch || 'capacity' in patch;
      tx.log(
        blocked ? 'WARNING' : 'NOMINAL',
        'חניונים',
        statusChanged
          ? `${next.name}: ${PARKING_STATUS_LABEL[target.status]} ← ${PARKING_STATUS_LABEL[next.status]}${occupancyText(next)}${next.note ? ` (${next.note})` : ''}`
          : numbersChanged
            ? `תפוסת ${next.name}${occupancyText(next)}`
            : `עדכון חניון ${next.name}`
      );
      if (blocked) tx.notice = { level: 'info', text: `חניון ${next.name} ${PARKING_STATUS_LABEL[next.status]}${next.note ? `: ${next.note}` : ''}` };
    },

    'parking.delete'(tx, a) {
      const target = tx.state.parkingLots.find((p) => p.id === a.id) ?? fail(NOT_FOUND);
      tx.remove('parkingLots', [target.id]);
      tx.log('WARNING', 'חניונים', `חניון הוסר: ${target.name}`);
    },

    'route.add'(tx, a) {
      const raw = obj(a.fields, 'ציר');
      const name = str(raw.name, 'שם ציר', { required: true, max: 40 });
      if (tx.state.routes.some((r) => r.name === name)) fail('ציר בשם הזה כבר קיים');
      const route = {
        id: newId('routes', 'R'),
        name,
        status: oneOf(raw.status, ROUTE_STATUSES, 'מצב'),
        note: str(raw.note ?? '', 'הערה', { max: 200 }),
      };
      tx.upsert('routes', [route]);
      tx.log('NOMINAL', 'תנועה וצירים', `ציר נוסף: ${route.name} (${ROUTE_STATUS_LABEL[route.status]})`);
      return route.id;
    },

    'route.update'(tx, a) {
      const target = tx.state.routes.find((r) => r.id === a.id) ?? fail(NOT_FOUND);
      const raw = obj(a.patch, 'שינויים');
      const clean: Partial<typeof target> = {};
      if ('name' in raw) {
        clean.name = str(raw.name, 'שם ציר', { required: true, max: 40 });
        if (tx.state.routes.some((r) => r.id !== target.id && r.name === clean.name)) fail('ציר בשם הזה כבר קיים');
      }
      if ('status' in raw) clean.status = oneOf(raw.status, ROUTE_STATUSES, 'מצב');
      if ('note' in raw) clean.note = str(raw.note, 'הערה', { max: 200 });
      const patch = changedFields(target, clean);
      if (Object.keys(patch).length === 0) return;
      const next = { ...target, ...patch };
      tx.upsert('routes', [next]);
      const closed = patch.status === 'closed';
      tx.log(
        closed ? 'WARNING' : 'NOMINAL',
        'תנועה וצירים',
        patch.status
          ? `${next.name}: ${ROUTE_STATUS_LABEL[target.status]} ← ${ROUTE_STATUS_LABEL[next.status]}${next.note ? ` (${next.note})` : ''}`
          : `עריכת ציר ${next.name}`
      );
      if (closed) tx.notice = { level: 'info', text: `${next.name} נסגר${next.note ? `: ${next.note}` : ''}` };
    },

    'route.delete'(tx, a) {
      const target = tx.state.routes.find((r) => r.id === a.id) ?? fail(NOT_FOUND);
      tx.remove('routes', [target.id]);
      tx.log('WARNING', 'תנועה וצירים', `ציר הוסר: ${target.name}`);
    },

    'scenario.add'(tx, a) {
      const raw = obj(a.fields, 'תרחיש');
      const scenario = {
        id: newId('scenarios', 'SIM'),
        name: str(raw.name, 'שם תרחיש', { required: true, max: 100 }),
        description: str(raw.description ?? '', 'תיאור', { max: 1000 }),
      };
      tx.upsert('scenarios', [scenario]);
      tx.log('NOMINAL', 'תרגילים', `תרחיש תרגיל נוסף: ${scenario.name}`);
      return scenario.id;
    },

    'scenario.update'(tx, a) {
      const target = tx.state.scenarios.find((sc) => sc.id === a.id) ?? fail(NOT_FOUND);
      const raw = obj(a.patch, 'שינויים');
      const clean: Partial<typeof target> = {};
      if ('name' in raw) clean.name = str(raw.name, 'שם תרחיש', { required: true, max: 100 });
      if ('description' in raw) clean.description = str(raw.description, 'תיאור', { max: 1000 });
      const patch = changedFields(target, clean);
      if (Object.keys(patch).length === 0) return;
      tx.upsert('scenarios', [{ ...target, ...patch }]);
      tx.log('NOMINAL', 'תרגילים', `עריכת תרחיש: ${patch.name ?? target.name}`);
    },

    'scenario.delete'(tx, a) {
      const target = tx.state.scenarios.find((sc) => sc.id === a.id) ?? fail(NOT_FOUND);
      tx.remove('scenarios', [target.id]);
      tx.log('WARNING', 'תרגילים', `תרחיש הוסר: ${target.name}`);
    },

    'hqName.set'(tx, a) {
      const name = str(a.name, 'שם החפ"ק', { required: true, max: 60 });
      if (name === tx.state.hqName) return;
      const prev = tx.state.hqName;
      tx.set('hqName', name);
      tx.log('NOMINAL', 'מפקד משמרת', `שם החפ"ק: ${prev} ← ${name}`);
    },

    'alertLevel.set'(tx, a) {
      setAlertLevel(tx, a.level);
    },

    'frequency.set'(tx, a) {
      const next = frequencyOf(a.frequency);
      const prev = tx.state.mainFrequency;
      if (next === prev) return;
      tx.set('mainFrequency', next);
      tx.log('WARNING', 'קשר', `החלפת תדר רשת ראשית: ${prev} ← ${next}`);
      tx.notice = { level: 'info', text: `תדר רשת ראשית הוחלף ל-${next}` };
    },

    'shift.set'(tx, a) {
      const raw = obj(a.shift, 'משמרת');
      const shift = {
        commanderName: str(raw.commanderName, 'מפקד משמרת', { required: true, max: 60 }),
        shiftName: str(raw.shiftName, 'משמרת', { required: true, max: 20 }),
      };
      const prev = tx.state.shift;
      if (shift.commanderName === prev.commanderName && shift.shiftName === prev.shiftName) return;
      tx.set('shift', shift);
      tx.log('NOMINAL', 'מפקד משמרת', `עדכון משמרת: משמרת ${shift.shiftName}, מפקד ${shift.commanderName}`);
    },

    'sim.trigger'(tx, a) {
      const name = str(a.name, 'שם תרגיל', { required: true, max: 100 });
      const description = str(a.description, 'תיאור', { max: 1000 });
      setAlertLevel(tx, COMBAT_ORDER);
      addIncident(tx, {
        title: `תרגיל קיצון: ${name}`,
        location: 'גזרת חברון וציר 60',
        details: description,
        tier: 1,
        tierLabel: 'תרגיל - דחיפות עליונה',
        assignedUnits: ['כלל כוחות הגזרה', 'יס"מ 9', 'רחפן תרמי'],
      });
      tx.notice = { level: 'critical', text: `תרגיל קיצון הופעל: ${name} - כלל הכוחות מונחים להצטרף לרשת הקשר הראשית!` };
    },

    'demo.reset'() {
      // handled in dispatch (replaces the whole state)
    },
  };

  return {
    getState: () => state!,

    dispatch(station: string, action: Action): Outcome {
      if (typeof action !== 'object' || action === null || !(action.type in handlers)) {
        return { result: { ok: false, error: 'פעולה לא מוכרת' } };
      }

      if (action.type === 'demo.reset') {
        const fresh = seed();
        const tx = new Tx(fresh, station, now(), nextLogId);
        tx.log('WARNING', 'מערכת', 'איפוס כל הנתונים לנתוני ההדגמה');
        writeAll(tx.state);
        state = tx.state;
        incidentSeq = nextIdNumber(state.incidents.map((i) => i.id), 7300);
        resetSeqs();
        milestoneSeq = nextIdNumber(state.milestones.map((m) => m.id), 100);
        return { result: { ok: true }, reset: true, notice: { level: 'info', text: 'הנתונים אופסו לנתוני ההדגמה' } };
      }

      const tx = new Tx(state!, station, now(), nextLogId);
      try {
        const handler = handlers[action.type] as (tx: Tx, a: Action) => string | void;
        const id = handler(tx, action);
        const changed = Object.keys(tx.patch).length > 0;
        if (changed) commit(tx);
        return {
          result: id ? { ok: true, id } : { ok: true },
          patch: changed ? tx.patch : undefined,
          notice: changed ? tx.notice : undefined,
        };
      } catch (err) {
        if (err instanceof Invalid) return { result: { ok: false, error: err.message } };
        throw err;
      }
    },

    /** Live telemetry: moving units drift on the map and refresh their last contact */
    tick(random: () => number = Math.random): StatePatch | null {
      const clamp = (v: number) => Math.min(95, Math.max(5, v));
      const moved = state!.units
        .filter((u) => u.status === 'en-route' || u.type === 'drone')
        .map((u) => ({
          ...u,
          x: clamp(u.x + (random() - 0.5) * 3),
          y: clamp(u.y + (random() - 0.5) * 3),
          lastContact: clockTime(now()),
        }));
      if (moved.length === 0) return null;
      const tx = new Tx(state!, 'מערכת', now(), nextLogId);
      tx.upsert('units', moved);
      commit(tx);
      return tx.patch;
    },
  };
}

export type Core = ReturnType<typeof createCore>;
