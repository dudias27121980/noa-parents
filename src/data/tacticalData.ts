import {
  Agency,
  AlertLevel,
  KpiCard,
  LogEntry,
  ParkingLot,
  Milestone,
  SimScenario,
  TacticalIncident,
  TacticalRoute,
  TacticalUnit,
} from '../types/tactical';
import { normalizeMilestones } from '../utils/schedule';
import { hhmm, isoDate } from '../utils/time';

// All data below is fictional demo data for the dashboard UI.

// Demo schedule is laid out around the moment it is built (first load or data reset), so the target
// clocks (which run on the browser clock) show a live phase. Edit times in the UI to set real ones.
export const buildDemoMilestones = (loadTime: Date = new Date()): Milestone[] => {
  // Start date + time `offsetMin` from load, on a 5-minute grid (crosses midnight correctly)
  const at = (offsetMin: number) => {
    const d = new Date(loadTime);
    d.setMinutes(Math.floor(d.getMinutes() / 5) * 5 + offsetMin, 0, 0);
    return { scheduledDate: isoDate(d), scheduledTime: hhmm(d) };
  };

  const tasks = (msId: string, done: boolean, texts: string[]) =>
    texts.map((text, i) => ({ id: `${msId}-T${i + 1}`, text, done }));

  return normalizeMilestones([
    {
      id: 'MS-01',
      code: 'H-60',
      title: 'כינוס מפקדים ותדריך פתיחה',
      ...at(-90),
      durationMin: 30,
      owner: 'מפקד המרחב',
      description: 'תדריך פתיחת משמרת, הצגת תמונת מצב מודיעינית וחלוקת גזרות אחריות.',
      statusType: 'completed',
      statusBadge: '',
      tasks: tasks('MS-01', true, ['הצגת תמונת מודיעין', 'חלוקת גזרות', 'אישור נהלי קשר']),
    },
    {
      id: 'MS-02',
      code: 'H-30',
      title: 'פריסת מחסומים בצירים ראשיים',
      ...at(-60),
      durationMin: 35,
      owner: 'מפקד פלוגת סיור',
      description: 'הצבת מחסומים ניידים בצומתי מפתח לאורך ציר 60 וציר 35, כולל מצלמות LPR.',
      statusType: 'completed',
      statusBadge: '',
      tasks: tasks('MS-02', true, ['מחסום צומת הגוש', 'מחסום כניסה צפונית', 'חיבור מצלמות LPR']),
    },
    {
      id: 'MS-03',
      code: 'H-HOUR',
      title: 'סריקה ממוקדת במרחב חברון',
      ...at(-25),
      durationMin: 45,
      owner: 'מפקד יס"מ',
      description: 'סריקה בגזרה המזרחית בליווי רחפן תרמי. דיווח מצב כל 10 דקות לחפ"ק.',
      statusType: 'active',
      statusBadge: '',
      // Active phase: the first task is already done
      tasks: tasks('MS-03', false, ['כניסה לגזרה', 'סריקת מבנים 1-12', 'סריקת מבנים 13-24', 'יציאה ודיווח']).map((t, i) =>
        i === 0 ? { ...t, done: true } : t
      ),
    },
    {
      id: 'MS-04',
      code: 'H+45',
      title: 'החלפת כוחות וריענון',
      ...at(25),
      durationMin: 40,
      owner: 'קצין אג"מ',
      description: 'החלפת כוחות הסיור במחסומים, תדלוק ורענון ציוד.',
      statusType: 'next',
      statusBadge: '',
      tasks: tasks('MS-04', false, ['תיאום זמני החלפה', 'תדלוק רכבים', 'העברת מקל']),
    },
    {
      id: 'MS-05',
      code: 'H+120',
      title: 'סיכום ביניים ותחקיר חם',
      ...at(70),
      durationMin: 30,
      owner: 'מפקד המרחב',
      description: 'סיכום ביניים של הפעילות, הפקת לקחים ראשוניים ועדכון דרג ממונה.',
      statusType: 'scheduled',
      statusBadge: '',
      tasks: tasks('MS-05', false, ['איסוף דיווחים', 'תחקיר חם', 'דיווח לדרג ממונה']),
    },
  ]);
};

export const INITIAL_KPIS: KpiCard[] = [
  {
    id: 'kpi-parking',
    label: 'תמונת מצב חניונים',
    value: '7/7',
    subLabel: 'כל החניונים פנויים',
    trend: '',
    tone: 'nominal',
    action: 'parking',
  },
  {
    id: 'kpi-forces',
    label: 'כוחות בשטח',
    value: '42',
    unit: 'לוחמים',
    subLabel: '8 צוותים פרוסים',
    trend: 'כשירות 94%',
    tone: 'nominal',
    action: 'forces',
  },
  {
    id: 'kpi-routes',
    label: 'צירים פתוחים',
    value: '5/6',
    subLabel: 'ציר 35 חסום חלקית',
    trend: 'עומס בינוני',
    tone: 'warning',
    action: 'routes',
  },
  {
    id: 'kpi-agencies',
    label: 'כוחות חבירים',
    value: '5/6',
    subLabel: 'מד"א בתקשורת לקויה',
    trend: 'סנכרון 30 שנ׳',
    tone: 'info',
    action: 'agencies',
  },
];

export const buildDemoIncidents = (date: string = isoDate()): TacticalIncident[] => [
  {
    id: 'INC-7241',
    date,
    time: '07:02:14',
    tier: 1,
    tierLabel: 'דחוף - סכנת חיים',
    title: 'רכב חשוד זוהה במצלמת LPR',
    location: 'ציר 60, צומת הגוש',
    details: 'לוחית רישוי תואמת רשימת מעקב. הרכב נע דרומה במהירות גבוהה.',
    status: 'active',
    assignedUnits: ['סיור 21', 'רחפן תרמי'],
  },
  {
    id: 'INC-7238',
    date,
    time: '06:48:51',
    tier: 2,
    tierLabel: 'חריג - בבדיקה',
    title: 'דיווח על התקהלות',
    location: 'כניסה צפונית לחברון',
    details: 'כ-30 איש מתקהלים סמוך למחסום. אין דיווח על אלימות.',
    status: 'monitoring',
    assignedUnits: ['סיור 14'],
  },
  {
    id: 'INC-7230',
    date,
    time: '06:21:07',
    tier: 3,
    tierLabel: 'שגרתי',
    title: 'תקלת מצלמה במחסום',
    location: 'מחסום 300',
    details: 'מצלמת LPR אינה משדרת. טכנאי בדרך.',
    status: 'resolved',
    assignedUnits: ['צוות טכני'],
  },
];

export const INITIAL_UNITS: TacticalUnit[] = [
  {
    id: 'U-01',
    callSign: 'נשר 1',
    type: 'command',
    status: 'deployed',
    commander: 'רפ"ק לוי',
    personnel: 4,
    sector: 'חפ"ק קדמי',
    x: 48,
    y: 46,
    lastContact: '07:14:02',
    signalStrength: 98,
  },
  {
    id: 'U-02',
    callSign: 'סיור 21',
    type: 'patrol',
    status: 'en-route',
    commander: 'פקד אברהם',
    personnel: 3,
    sector: 'ציר 60 דרום',
    x: 36,
    y: 70,
    lastContact: '07:13:48',
    signalStrength: 86,
  },
  {
    id: 'U-03',
    callSign: 'סיור 14',
    type: 'patrol',
    status: 'deployed',
    commander: 'רס"ב מזרחי',
    personnel: 3,
    sector: 'כניסה צפונית',
    x: 52,
    y: 18,
    lastContact: '07:13:55',
    signalStrength: 91,
  },
  {
    id: 'U-04',
    callSign: 'יס"מ 9',
    type: 'swat',
    status: 'deployed',
    commander: 'רפ"ק דהן',
    personnel: 12,
    sector: 'גזרה מזרחית',
    x: 72,
    y: 40,
    lastContact: '07:14:05',
    signalStrength: 79,
  },
  {
    id: 'U-05',
    callSign: 'עין 3',
    type: 'drone',
    status: 'deployed',
    commander: 'מפעיל רחפן',
    personnel: 2,
    sector: 'כיסוי אווירי',
    x: 64,
    y: 56,
    lastContact: '07:14:06',
    signalStrength: 95,
  },
  {
    id: 'U-06',
    callSign: 'מגן 2',
    type: 'medical',
    status: 'standby',
    commander: 'חובש בכיר',
    personnel: 2,
    sector: 'עתודה',
    x: 24,
    y: 34,
    lastContact: '07:10:30',
    signalStrength: 88,
  },
  {
    id: 'U-07',
    callSign: 'סיור 33',
    type: 'patrol',
    status: 'offline',
    commander: 'רס"ל כהן',
    personnel: 3,
    sector: 'ציר 35',
    x: 16,
    y: 60,
    lastContact: '06:58:12',
    signalStrength: 0,
  },
];

export const INITIAL_AGENCIES: Agency[] = [
  {
    id: 'AG-01',
    name: 'מד"א',
    role: 'רפואה והצלה',
    liaison: 'מוקד מרחבי',
    frequency: '2170',
    phone: null,
    status: 'degraded',
    lastSync: '07:12:40',
  },
  {
    id: 'AG-02',
    name: 'כבאות והצלה',
    role: 'כיבוי וחילוץ',
    liaison: 'קצין קישור',
    frequency: '2140',
    phone: null,
    status: 'connected',
    lastSync: '07:13:58',
  },
  {
    id: 'AG-03',
    name: 'פיקוד העורף',
    role: 'התגוננות אזרחית',
    liaison: 'נציג מחוז',
    frequency: '2120',
    phone: null,
    status: 'connected',
    lastSync: '07:13:50',
  },
  {
    id: 'AG-04',
    name: 'מוקד עירוני',
    role: 'תשתיות ותנועה',
    liaison: 'מנהל משמרת',
    frequency: null,
    phone: '106',
    status: 'connected',
    lastSync: '07:11:05',
  },
  {
    id: 'AG-05',
    name: 'חטיבה מרחבית',
    role: 'תיאום צבאי',
    liaison: 'קמ"ן חטיבה',
    frequency: '1010',
    phone: null,
    status: 'connected',
    lastSync: '07:14:01',
  },
  {
    id: 'AG-06',
    name: 'חברת החשמל',
    role: 'תשתיות אנרגיה',
    liaison: 'מוקד תקלות',
    frequency: null,
    phone: '103',
    status: 'disconnected',
    lastSync: '06:40:22',
  },
];

export const buildDemoLogs = (date: string = isoDate()): LogEntry[] => [
  {
    id: 'LOG-0412',
    date,
    timestamp: '07:02:14',
    severity: 'CRITICAL',
    source: 'מערכת LPR',
    action: 'זיהוי לוחית ברשימת מעקב - פתיחת אירוע INC-7241',
  },
  {
    id: 'LOG-0409',
    date,
    timestamp: '06:48:51',
    severity: 'WARNING',
    source: 'יומן מבצעים',
    action: 'פתיחת אירוע INC-7238: דיווח על התקהלות',
  },
  {
    id: 'LOG-0402',
    date,
    timestamp: '06:30:00',
    severity: 'NOMINAL',
    source: 'חפ"ק אג"מ מרחב יהודה',
    action: 'אבן דרך H-30 "פריסת מחסומים בצירים ראשיים": הושלם בהצלחה',
  },
  {
    id: 'LOG-0398',
    date,
    timestamp: '06:00:12',
    severity: 'NOMINAL',
    source: 'מערכת',
    action: 'פתיחת משמרת ב׳ - מפקד משמרת נצ"מ כהן',
  },
];

export const INITIAL_SCENARIOS: SimScenario[] = [
  {
    id: 'SIM-A',
    name: 'פיגוע דריסה בצומת',
    description: 'רכב פרץ מחסום ופגע בכוח. נדרש חסימת צירים מיידית, פינוי נפגעים ומרדף.',
  },
  {
    id: 'SIM-B',
    name: 'אירוע רב-נפגעים',
    description: 'פיצוץ במבנה ציבורי. נדרש תיאום מד"א, כבאות ופיקוד העורף, והקמת מתחם נפגעים.',
  },
  {
    id: 'SIM-C',
    name: 'חדירת מחבל ליישוב',
    description: 'התרעה על חדירה בגדר המערכת. הקפצת כיתת כוננות, יס"מ ורחפן תרמי.',
  },
];

/** Main command net — 4-digit radio frequency */
export const DEFAULT_MAIN_FREQUENCY = '1480';

export const DEFAULT_SHIFT = { commanderName: 'נצ"מ כהן', shiftName: "ב'" };

export const DEFAULT_ALERT_LEVEL: AlertLevel = 'כוננות ג׳ - מצב מבצעי מוגבר';

export const DEFAULT_HQ_NAME = 'חפ"ק מרחב יהודה - ימי המכפלה סוכות תשפ"ז';
/** The default before schema 4; a name still equal to it is replaced by the current default */
export const PREVIOUS_DEFAULT_HQ_NAME = 'חפ"ק מרחב יהודה';

/** The HQ's parking lots. Status only until capacities are entered (capacity 0 = not set) */
export const INITIAL_PARKING_LOTS: ParkingLot[] = [
  'יתק"א עליון',
  'יתק"א תחתון',
  'מנחת',
  'מאוחדת',
  'אלייקים',
  'חשוף עליון',
  'עיריה',
].map((name, i) => ({ id: `P-${i + 1}`, name, status: 'available', capacity: 0, occupied: 0, note: '', updated: '' }));

export const INITIAL_ROUTES: TacticalRoute[] = [
  { id: 'R-60', name: 'ציר 60', status: 'open', note: '' },
  { id: 'R-35', name: 'ציר 35', status: 'partial', note: 'מחסום 300 - נתיב אחד סגור' },
  { id: 'R-356', name: 'ציר 356', status: 'open', note: '' },
  { id: 'R-317', name: 'ציר 317', status: 'open', note: '' },
  { id: 'R-3698', name: 'כביש 3698', status: 'open', note: '' },
  { id: 'R-367', name: 'ציר 367', status: 'open', note: '' },
];
