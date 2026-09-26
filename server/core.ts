import {
  ALERT_LEVELS,
  AgencyStatus,
  IncidentStatus,
  LogEntry,
  LogSeverity,
  Milestone,
  MilestoneStatus,
  TacticalIncident,
  UnitStatus,
  UnitType,
} from '../src/types/tactical';
import {
  Action,
  ActionResult,
  CollectionName,
  MilestoneFields,
  Notice,
  SharedState,
  SingletonName,
  StatePatch,
  applyPatch,
} from '../src/shared/protocol';
import {
  AGENCY_STATUS_LABEL,
  INCIDENT_STATUS_LABEL,
  TIER_LABEL,
  UNIT_STATUS_LABEL,
  UNIT_TYPE_LABEL,
} from '../src/shared/labels';
import {
  DEFAULT_ALERT_LEVEL,
  DEFAULT_MAIN_FREQUENCY,
  DEFAULT_SHIFT,
  INITIAL_AGENCIES,
  INITIAL_UNITS,
  buildDemoIncidents,
  buildDemoLogs,
  buildDemoMilestones,
} from '../src/data/tacticalData';
import { STATUS_BADGE, normalizeMilestones } from '../src/utils/schedule';
import { clockTime, formatDate, isIsoDate, isoDate, parseHHMM } from '../src/utils/time';
import { nextIdNumber } from '../src/utils/ids';
import { changedFields } from '../src/shared/diff';
import { Db } from './db';

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

/* ---------- core ---------- */

export function createCore({ db, now = () => new Date() }: { db: Db; now?: () => Date }) {
  const seed = (): SharedState => {
    const t = now();
    return {
      milestones: buildDemoMilestones(t),
      incidents: buildDemoIncidents(isoDate(t)),
      units: INITIAL_UNITS,
      agencies: INITIAL_AGENCIES,
      logs: buildDemoLogs(isoDate(t)),
      alertLevel: DEFAULT_ALERT_LEVEL,
      mainFrequency: DEFAULT_MAIN_FREQUENCY,
      shift: DEFAULT_SHIFT,
    };
  };

  const writeAll = (s: SharedState) =>
    db.transaction(() => {
      (['milestones', 'incidents', 'units', 'agencies'] as const).forEach((c) => db.replaceCollection(c, s[c]));
      db.setSingleton('alertLevel', s.alertLevel);
      db.setSingleton('mainFrequency', s.mainFrequency);
      db.setSingleton('shift', s.shift);
      db.clearLogs();
      db.appendLogs(s.logs);
    });

  let state = db.load();
  if (!state) {
    state = seed();
    writeAll(state);
  }

  // Ids are allocated here, by the one server, so two stations can never create the same number
  let incidentSeq = nextIdNumber(state.incidents.map((i) => i.id), 7300);
  let milestoneSeq = nextIdNumber(state.milestones.map((m) => m.id), 100);
  let logSeq = Math.max(db.maxLogNumber() + 1, nextIdNumber(state.logs.map((l) => l.id), 500));
  const nextLogId = () => `LOG-${String(logSeq++).padStart(4, '0')}`;

  const commit = (tx: Tx) => {
    const { patch } = tx;
    db.transaction(() => {
      (['incidents', 'units', 'agencies'] as const).forEach((c) => {
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
      const patch = changedFields(target, clean);
      if (Object.keys(patch).length === 0) return;

      const next = { ...target, ...patch };
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
        'תיאום גורמי חוץ',
        `עריכת גורם חוץ ${next.name}${notes.length ? ` (${notes.join(', ')})` : ''}`
      );
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
