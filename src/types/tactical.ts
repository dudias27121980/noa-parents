export type ViewScreen = 'clock' | 'map' | 'incidents' | 'forces' | 'agencies' | 'log';

export const ALERT_LEVELS = [
  'שגרה - מצב רגיל',
  'כוננות ב׳ - עירנות מוגברת',
  'כוננות ג׳ - מצב מבצעי מוגבר',
  'פע״מ - פקודת לחימה',
] as const;

export type AlertLevel = (typeof ALERT_LEVELS)[number];

export type MilestoneStatus = 'completed' | 'active' | 'next' | 'scheduled';

export interface Milestone {
  id: string;
  code: string;
  title: string;
  /** Start date "YYYY-MM-DD" and time "HH:MM" on the browser's local clock */
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  owner: string;
  description: string;
  statusType: MilestoneStatus;
  statusBadge: string;
  tasks: MilestoneTask[];
}

export interface MilestoneTask {
  /** Unique within its milestone */
  id: string;
  text: string;
  done: boolean;
}

export type ParkingStatus = 'available' | 'filling' | 'full' | 'closed';

/** A parking lot in the parking status picture */
export interface ParkingLot {
  id: string;
  name: string;
  status: ParkingStatus;
  /** Number of spaces; 0 = not set (then only the status is shown) */
  capacity: number;
  occupied: number;
  note: string;
  /** Server clock time ("HH:MM:SS") of the last change */
  updated: string;
  /** Where it is marked on the tactical map; absent until someone marks it */
  mapPos?: MapPoint | null;
}

export type RouteStatus = 'open' | 'partial' | 'closed';

export interface TacticalRoute {
  id: string;
  name: string;
  status: RouteStatus;
  note: string;
}

export interface SimScenario {
  id: string;
  name: string;
  description: string;
}

/** caution (yellow) and high (dark orange): the parking occupancy steps between nominal and critical */
export type KpiTone = 'critical' | 'high' | 'warning' | 'caution' | 'nominal' | 'info';
export type KpiAction = 'parking' | 'forces' | 'routes' | 'agencies' | 'worship' | 'buses';

export interface KpiCard {
  id: string;
  label: string;
  value: string;
  unit?: string;
  subLabel: string;
  trend: string;
  tone: KpiTone;
  action: KpiAction;
}

export type UnitType = 'patrol' | 'swat' | 'drone' | 'medical' | 'command';
export type UnitStatus = 'deployed' | 'en-route' | 'standby' | 'offline';

export interface TacticalUnit {
  id: string;
  callSign: string;
  type: UnitType;
  status: UnitStatus;
  commander: string;
  personnel: number;
  sector: string;
  /** Map position in percent (0-100) of the map canvas */
  x: number;
  y: number;
  lastContact: string;
  signalStrength: number;
}

/** A point on the tactical map, in percent (0-100) of its width and height */
export interface MapPoint {
  x: number;
  y: number;
}

export type IncidentTier = 1 | 2 | 3;
export type IncidentStatus = 'active' | 'monitoring' | 'resolved';

export interface TacticalIncident {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  time: string;
  tier: IncidentTier;
  tierLabel: string;
  title: string;
  location: string;
  details: string;
  status: IncidentStatus;
  assignedUnits: string[];
  /** Where it is marked on the tactical map; absent until someone marks it */
  mapPos?: MapPoint | null;
}

export type AgencyStatus = 'connected' | 'degraded' | 'disconnected';

export interface Agency {
  id: string;
  name: string;
  role: string;
  liaison: string;
  /** 4-digit radio frequency, or null when reached by phone only */
  frequency: string | null;
  phone: string | null;
  status: AgencyStatus;
  lastSync: string;
}

export type LogSeverity = 'NOMINAL' | 'WARNING' | 'CRITICAL';

export interface LogEntry {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  timestamp: string;
  severity: LogSeverity;
  source: string;
  action: string;
  /** Station that performed the action (absent for system/demo entries) */
  station?: string;
}

/** A report of how many worshippers are at the site, at a given time */
export interface WorshipReport {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" as reported */
  time: string;
  count: number;
  note: string;
}

/** Line 201 each way, and the shuttles */
export type BusRoute = 'jlm-ka' | 'ka-jlm' | 'shuttle';
export type BusStatus = 'waiting' | 'en-route' | 'arrived';

/** One bus trip (a bus doing several trips has a row for each) */
export interface BusTrip {
  id: string;
  /** Bus number / licence as written by the HQ */
  number: string;
  route: BusRoute;
  status: BusStatus;
  passengers: number;
  /** Planned or actual departure "HH:MM"; empty if unknown */
  departure: string;
  note: string;
}
