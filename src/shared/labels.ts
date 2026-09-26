import { AgencyStatus, IncidentStatus, IncidentTier, UnitStatus, UnitType } from '../types/tactical';

// Hebrew labels shared by the UI and the server (which writes them into the operations log)

export const TIER_LABEL: Record<IncidentTier, string> = {
  1: 'דחוף - סכנת חיים',
  2: 'חריג - בבדיקה',
  3: 'שגרתי',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  active: 'פעיל',
  monitoring: 'במעקב',
  resolved: 'נסגר',
};

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  patrol: 'סיור',
  swat: 'יחידה מיוחדת',
  drone: 'רחפן',
  medical: 'רפואה',
  command: 'פיקוד',
};

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  deployed: 'פרוס',
  'en-route': 'בתנועה',
  standby: 'בהמתנה',
  offline: 'אין קשר',
};

export const AGENCY_STATUS_LABEL: Record<AgencyStatus, string> = {
  connected: 'מחובר',
  degraded: 'תקשורת לקויה',
  disconnected: 'מנותק',
};
