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
  scheduledTime: string;
  owner: string;
  description: string;
  statusType: MilestoneStatus;
  statusBadge: string;
  progressPercent: number;
  tasks: string[];
}

export type KpiTone = 'critical' | 'warning' | 'nominal' | 'info';
export type KpiAction = 'lpr' | 'forces' | 'routes' | 'agencies';

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

export type IncidentTier = 1 | 2 | 3;
export type IncidentStatus = 'active' | 'monitoring' | 'resolved';

export interface TacticalIncident {
  id: string;
  time: string;
  tier: IncidentTier;
  tierLabel: string;
  title: string;
  location: string;
  details: string;
  status: IncidentStatus;
  assignedUnits: string[];
}

export type AgencyStatus = 'connected' | 'degraded' | 'disconnected';

export interface Agency {
  id: string;
  name: string;
  role: string;
  liaison: string;
  channel: string;
  status: AgencyStatus;
  lastSync: string;
}

export type LogSeverity = 'NOMINAL' | 'WARNING' | 'CRITICAL';

export interface BlackBoxEntry {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  source: string;
  action: string;
  hash: string;
}
