import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALERT_LEVELS,
  ViewScreen,
  AlertLevel,
  Agency,
  Milestone,
  MilestoneStatus,
  TacticalUnit,
  TacticalIncident,
  LogEntry,
  LogSeverity,
} from './types/tactical';
import {
  buildDemoMilestones,
  INITIAL_KPIS,
  buildDemoIncidents,
  INITIAL_UNITS,
  INITIAL_AGENCIES,
  buildDemoLogs,
  DEFAULT_MAIN_FREQUENCY,
  DEFAULT_SHIFT,
} from './data/tacticalData';
import { HeaderNav } from './components/HeaderNav';
import { HudCenter } from './components/HudCenter';
import { KpiRow } from './components/KpiRow';
import { RadarControls } from './components/RadarControls';
import { MilestonePatch, MilestonesTimeline } from './components/MilestonesTimeline';
import { RightSidebar } from './components/RightSidebar';
import { TacticalMapScreen } from './components/TacticalMapScreen';
import { INCIDENT_STATUS_LABEL, IncidentPatch, IncidentsScreen } from './components/IncidentsScreen';
import { ForcesScreen, UnitPatch } from './components/ForcesScreen';
import { UNIT_STATUS } from './components/TacticalMapScreen';
import { AGENCY_STATUS, AgenciesScreen, AgencyPatch } from './components/AgenciesScreen';
import { MilestoneModal } from './components/MilestoneModal';
import { LprModal } from './components/LprModal';
import { SimModal } from './components/SimModal';
import { playCompleteChime, playEmergencyAlarm } from './utils/audio';
import { clockTime, hhmm, isoDate } from './utils/time';
import { STATUS_BADGE, milestoneWindow, normalizeMilestones, phaseCountdowns } from './utils/schedule';
import {
  arrayOf,
  clearStored,
  isBoolean,
  nextIdNumber,
  oneOf,
  usePersistentState,
  withDefault,
} from './utils/persist';
import { SCREENS } from './components/screens';
import { Radio } from 'lucide-react';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const DEFAULT_ALERT: AlertLevel = 'כוננות ג׳ - מצב מבצעי מוגבר';
/** Oldest log entries are dropped past this, so localStorage can't fill up over a long shift */
const MAX_LOGS = 500;

// Shape checks for data restored from localStorage (anything else falls back to the demo data)
const isScreen = oneOf<ViewScreen>(SCREENS.map((s) => s.id));
const isAlertLevel = oneOf<AlertLevel>(ALERT_LEVELS);
const isMilestones = arrayOf<Milestone>({
  id: 'string', code: 'string', title: 'string', scheduledDate: 'string', scheduledTime: 'string', durationMin: 'number',
  owner: 'string', description: 'string', statusType: 'string', statusBadge: 'string', tasks: 'array',
});
const isIncidents = arrayOf<TacticalIncident>({
  id: 'string', date: 'string', time: 'string', tier: 'number', tierLabel: 'string', title: 'string', location: 'string',
  details: 'string', status: 'string', assignedUnits: 'array',
});
const isUnits = arrayOf<TacticalUnit>({
  id: 'string', callSign: 'string', type: 'string', status: 'string', commander: 'string', personnel: 'number',
  sector: 'string', x: 'number', y: 'number', lastContact: 'string', signalStrength: 'number',
});
const isAgencies = arrayOf<Agency>({
  id: 'string', name: 'string', role: 'string', liaison: 'string', status: 'string', lastSync: 'string',
});
const isFrequency = (v: unknown): v is string => typeof v === 'string' && /^\d{4}$/.test(v);
const isShift = (v: unknown): v is typeof DEFAULT_SHIFT =>
  typeof v === 'object' && v !== null &&
  typeof (v as Record<string, unknown>).commanderName === 'string' &&
  typeof (v as Record<string, unknown>).shiftName === 'string';

// Saves from before dates were added get today's date rather than being discarded
const addToday = (field: string) => withDefault(field, () => isoDate());

const isLogs = arrayOf<LogEntry>({
  id: 'string', date: 'string', timestamp: 'string', severity: 'string', source: 'string', action: 'string',
});

export default function App() {
  // Radio Transmission Live Toast — one timer, so a new message never gets cut short by an older one
  const [toast, setToast] = useState<{ text: string; ms: number; key: number } | null>(null);
  const showToast = useCallback((text: string, ms = 4000) => {
    setToast({ text, ms, key: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.ms);
    return () => clearTimeout(t);
  }, [toast]);

  // Warn once if the browser refuses to save (private mode, blocked storage, full quota)
  const saveErrorShown = useRef(false);
  const onSaveError = useCallback(() => {
    if (saveErrorShown.current) return;
    saveErrorShown.current = true;
    showToast('השמירה בדפדפן נכשלה - השינויים יישמרו רק עד רענון הדף', 7000);
  }, [showToast]);

  // Everything below is saved to the browser (localStorage) and restored on reload
  const [currentScreen, setCurrentScreen] = usePersistentState('screen', () => 'clock' as ViewScreen, isScreen, onSaveError);
  const [alertLevel, setAlertLevel] = usePersistentState('alertLevel', () => DEFAULT_ALERT, isAlertLevel, onSaveError);
  const [audioEnabled, setAudioEnabled] = usePersistentState('audio', () => true, isBoolean, onSaveError);
  const [milestones, setMilestones] = usePersistentState(
    'milestones', () => buildDemoMilestones(), isMilestones, onSaveError, addToday('scheduledDate')
  );
  const [incidents, setIncidents] = usePersistentState(
    'incidents', () => buildDemoIncidents(), isIncidents, onSaveError, addToday('date')
  );
  const [units, setUnits] = usePersistentState('units', () => INITIAL_UNITS, isUnits, onSaveError);
  const [logs, setLogs] = usePersistentState('logs', () => buildDemoLogs(), isLogs, onSaveError, addToday('date'));
  const [mainFrequency, setMainFrequency] = usePersistentState(
    'frequency', () => DEFAULT_MAIN_FREQUENCY, isFrequency, onSaveError
  );
  const [shift, setShift] = usePersistentState('shift', () => DEFAULT_SHIFT, isShift, onSaveError);
  const [agencies, setAgencies] = usePersistentState('agencies', () => INITIAL_AGENCIES, isAgencies, onSaveError);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Modals state
  // Store the id, not a copy, so the modal always shows the current row
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const [isLprModalOpen, setIsLprModalOpen] = useState(false);
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);

  // Target clocks run on the browser clock: countdowns are derived from the schedule each tick
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  const { activeRemainingSec, nextCountdownSec } = phaseCountdowns(milestones, now);

  // Live telemetry: moving units drift on the map and refresh their last contact
  useEffect(() => {
    const interval = setInterval(() => {
      setUnits((prev) =>
        prev.map((u) => {
          if (u.status !== 'en-route' && u.type !== 'drone') return u;
          return {
            ...u,
            x: clamp(u.x + (Math.random() - 0.5) * 3, 5, 95),
            y: clamp(u.y + (Math.random() - 0.5) * 3, 5, 95),
            lastContact: clockTime(),
          };
        })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    // iOS Safari (and some embedded browsers) don't implement the Fullscreen API at all
    if (!document.fullscreenEnabled || typeof document.documentElement.requestFullscreen !== 'function') {
      showToast('מסך מלא אינו נתמך בדפדפן זה', 3000);
      return;
    }
    const op = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    op.catch((err) => console.warn('Fullscreen error:', err));
  };

  // KPIs that can be derived from live state are, so they never disagree with the screens
  const kpis = useMemo(() => {
    const onAir = units.filter((u) => u.status !== 'offline');
    const personnel = onAir.reduce((sum, u) => sum + u.personnel, 0);
    const connected = agencies.filter((a) => a.status === 'connected').length;
    return INITIAL_KPIS.map((k) => {
      if (k.action === 'forces') {
        return { ...k, value: String(personnel), subLabel: `${onAir.length} צוותים בקשר` };
      }
      if (k.action === 'agencies') {
        // Name the worst-off agency, so the card never contradicts the agencies screen
        const problem =
          agencies.find((a) => a.status === 'disconnected') ?? agencies.find((a) => a.status === 'degraded');
        const subLabel = problem
          ? `${problem.name} ${problem.status === 'disconnected' ? 'מנותק' : 'בתקשורת לקויה'}`
          : 'כל הגורמים מחוברים';
        return { ...k, value: `${connected}/${agencies.length}`, subLabel };
      }
      return k;
    });
  }, [units, agencies]);

  const unresolvedIncidentsCount = incidents.filter((i) => i.status !== 'resolved').length;

  // ID counters continue from the highest saved id — restarting them after a reload would
  // hand out ids that already exist in the restored data
  const incidentSeq = useRef(nextIdNumber(incidents.map((i) => i.id), 7300) - 1);
  const logSeq = useRef(nextIdNumber(logs.map((l) => l.id), 500) - 1);

  const appendLog = useCallback((severity: LogSeverity, source: string, action: string) => {
    const entry: LogEntry = {
      id: `LOG-${String(++logSeq.current).padStart(4, '0')}`,
      date: isoDate(),
      timestamp: clockTime(),
      severity,
      source,
      action,
    };
    setLogs((prev) => [entry, ...prev].slice(0, MAX_LOGS));
  }, [setLogs]);

  const handleSimulateTransmission = () => {
    showToast(`קשר "ברק" תדר ${mainFrequency}: חפ"ק לכלל הכוחות בגזרה - הגבירו עירנות בציר 60`);
  };

  const handlePingUnit = (callSign: string) => {
    showToast(`קריאה ישירה בקשר מוצפן אל כוח ${callSign} - בדיקת קליטה ומיקום`, 3500);
  };

  const MS_SOURCE = 'חפ"ק אג"מ מרחב יהודה';
  const msSeq = useRef(nextIdNumber(milestones.map((m) => m.id), 100) - 1);

  // Back to the demo data: clears the saved copy (other open tabs follow via the storage event)
  const handleResetData = () => {
    clearStored();
    setMilestones(buildDemoMilestones());
    setIncidents(buildDemoIncidents());
    setUnits(INITIAL_UNITS);
    setLogs(buildDemoLogs());
    setAlertLevel(DEFAULT_ALERT);
    setAgencies(INITIAL_AGENCIES);
    setMainFrequency(DEFAULT_MAIN_FREQUENCY);
    setShift(DEFAULT_SHIFT);
    setSelectedMilestoneId(null);
    showToast('הנתונים אופסו לנתוני ההדגמה', 3000);
  };

  const handleUpdateMilestoneStatus = (id: string, newStatus: MilestoneStatus) => {
    const target = milestones.find((m) => m.id === id);
    if (!target || target.statusType === newStatus) return;
    // Completing the running phase promotes the next one; the target clocks follow automatically
    setMilestones(normalizeMilestones(milestones.map((m) => (m.id === id ? { ...m, statusType: newStatus } : m))));
    appendLog('NOMINAL', MS_SOURCE, `אבן דרך ${target.code} "${target.title}": ${STATUS_BADGE[newStatus]}`);
  };

  const handleEditMilestone = (id: string, patch: MilestonePatch, isNew: boolean) => {
    const target = milestones.find((m) => m.id === id);
    if (!target) return;
    const changed = (Object.keys(patch) as (keyof MilestonePatch)[]).some((k) => patch[k] !== target[k]);
    if (changed) setMilestones(normalizeMilestones(milestones.map((m) => (m.id === id ? { ...m, ...patch } : m))));
    if (isNew || changed) {
      const label = `${patch.code ?? target.code} "${patch.title ?? target.title}"`;
      appendLog('NOMINAL', MS_SOURCE, isNew ? `הוספת אבן דרך ${label} בשעה ${patch.scheduledTime ?? target.scheduledTime}` : `עריכת אבן דרך ${label}`);
    }
  };

  const handleAddMilestone = () => {
    const id = `MS-${++msSeq.current}`;
    // New row starts when the last row ends
    const last = milestones[milestones.length - 1];
    const start = last ? milestoneWindow(last).end : new Date(Math.ceil(now.getTime() / (5 * 60_000)) * 5 * 60_000);
    const row: Milestone = {
      id,
      code: `M-${milestones.length + 1}`,
      title: 'משימה חדשה',
      scheduledDate: isoDate(start),
      scheduledTime: hhmm(start),
      durationMin: 30,
      owner: '',
      description: '',
      statusType: 'scheduled',
      statusBadge: STATUS_BADGE.scheduled,
      tasks: [],
    };
    setMilestones((prev) => normalizeMilestones([...prev, row]));
    return id;
  };

  const handleDeleteMilestone = (id: string, discardDraft = false) => {
    const target = milestones.find((m) => m.id === id);
    setMilestones((prev) => normalizeMilestones(prev.filter((m) => m.id !== id)));
    if (target && !discardDraft) appendLog('WARNING', MS_SOURCE, `מחיקת אבן דרך ${target.code} "${target.title}"`);
  };

  const handleAdvanceMilestone = (id: string) => {
    if (audioEnabled) playCompleteChime();
    handleUpdateMilestoneStatus(id, 'completed');
  };

  const handleAddIncident = (newInc: Partial<TacticalIncident>) => {
    const fullInc: TacticalIncident = {
      id: `INC-${++incidentSeq.current}`,
      date: isoDate(),
      time: clockTime(),
      tier: newInc.tier || 2,
      tierLabel: newInc.tierLabel || 'חריג - בבדיקה',
      title: newInc.title || 'אירוע חריג בגזרה',
      location: newInc.location || 'מרחב יהודה',
      details: newInc.details || '',
      status: 'active',
      assignedUnits: newInc.assignedUnits || ['כוח כוננות חפ"ק'],
    };

    setIncidents((prev) => [fullInc, ...prev]);
    appendLog(
      fullInc.tier === 1 ? 'CRITICAL' : 'WARNING',
      'יומן מבצעים',
      `פתיחת אירוע חדש ${fullInc.id}: ${fullInc.title}`
    );
  };

  const handleResolveIncident = (id: string) => {
    setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'resolved' as const } : i)));
    appendLog('NOMINAL', 'יומן מבצעים', `סגירת אירוע ${id}`);
  };

  const handleEditIncident = (id: string, patch: IncidentPatch) => {
    const target = incidents.find((i) => i.id === id);
    if (!target) return;
    const changed = (Object.keys(patch) as (keyof IncidentPatch)[]).filter(
      (k) => JSON.stringify(patch[k]) !== JSON.stringify(target[k])
    );
    if (changed.length === 0) return;
    setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

    const notes: string[] = [];
    if (patch.status && patch.status !== target.status) {
      notes.push(`סטטוס: ${INCIDENT_STATUS_LABEL[target.status]} ← ${INCIDENT_STATUS_LABEL[patch.status]}`);
    }
    if (patch.tier && patch.tier !== target.tier) notes.push(`דרג ${target.tier} ← ${patch.tier}`);
    const escalated = patch.tier === 1 && target.tier !== 1;
    appendLog(
      escalated ? 'CRITICAL' : 'NOMINAL',
      'יומן מבצעים',
      `עריכת אירוע ${id}: ${patch.title ?? target.title}${notes.length ? ` (${notes.join(', ')})` : ''}`
    );
  };

  const handleEditUnit = (id: string, patch: UnitPatch) => {
    const target = units.find((u) => u.id === id);
    if (!target) return;
    const changed = (Object.keys(patch) as (keyof UnitPatch)[]).some((k) => patch[k] !== target[k]);
    if (!changed) return;

    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        const next = { ...u, ...patch };
        // Signal follows the radio link: none when offline, a fresh reading when it comes back
        if (next.status === 'offline') next.signalStrength = 0;
        else if (u.status === 'offline') next.signalStrength = 85;
        if (next.status !== u.status) next.lastContact = clockTime();
        return next;
      })
    );

    // Incidents reference units by call sign — carry a rename over so assignments don't go stale
    const renamed = patch.callSign && patch.callSign !== target.callSign ? patch.callSign : null;
    if (renamed) {
      setIncidents((prev) =>
        prev.map((i) =>
          i.assignedUnits.includes(target.callSign)
            ? { ...i, assignedUnits: i.assignedUnits.map((c) => (c === target.callSign ? renamed : c)) }
            : i
        )
      );
    }

    const notes: string[] = [];
    if (renamed) notes.push(`אות קריאה: ${target.callSign} ← ${renamed}`);
    if (patch.commander !== undefined && patch.commander !== target.commander) {
      notes.push(`מפקד: ${target.commander || '—'} ← ${patch.commander || '—'}`);
    }
    if (patch.status && patch.status !== target.status) {
      notes.push(`סטטוס: ${UNIT_STATUS[target.status].label} ← ${UNIT_STATUS[patch.status].label}`);
    }
    appendLog(
      patch.status === 'offline' && target.status !== 'offline' ? 'WARNING' : 'NOMINAL',
      'שליטה בכוחות',
      `עריכת כוח ${renamed ?? target.callSign}${notes.length ? ` (${notes.join(', ')})` : ''}`
    );
  };

  const handleFrequencyChange = (frequency: string) => {
    if (frequency === mainFrequency) return;
    setMainFrequency(frequency);
    appendLog('WARNING', 'קשר', `החלפת תדר רשת ראשית: ${mainFrequency} ← ${frequency}`);
  };

  const handleShiftChange = (next: typeof DEFAULT_SHIFT) => {
    if (next.commanderName === shift.commanderName && next.shiftName === shift.shiftName) return;
    setShift(next);
    appendLog('NOMINAL', 'מפקד משמרת', `עדכון משמרת: משמרת ${next.shiftName}, מפקד ${next.commanderName}`);
  };

  const handleEditAgency = (id: string, patch: AgencyPatch) => {
    const target = agencies.find((a) => a.id === id);
    if (!target) return;
    const changed = (Object.keys(patch) as (keyof AgencyPatch)[]).some((k) => patch[k] !== target[k]);
    if (!changed) return;
    const statusChanged = patch.status !== undefined && patch.status !== target.status;
    setAgencies((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch, lastSync: statusChanged ? clockTime() : a.lastSync } : a))
    );

    const contact = (a: Pick<Agency, 'frequency' | 'phone'>) => (a.frequency ? `תדר ${a.frequency}` : `טלפון ${a.phone ?? '—'}`);
    const next = { ...target, ...patch };
    const notes: string[] = [];
    if (contact(next) !== contact(target)) notes.push(`${contact(target)} ← ${contact(next)}`);
    if (statusChanged) notes.push(`סטטוס: ${AGENCY_STATUS[target.status].label} ← ${AGENCY_STATUS[next.status].label}`);
    if (next.liaison !== target.liaison) notes.push(`קישור: ${target.liaison || '—'} ← ${next.liaison || '—'}`);
    appendLog(
      next.status === 'disconnected' && statusChanged ? 'WARNING' : 'NOMINAL',
      'תיאום גורמי חוץ',
      `עריכת גורם חוץ ${next.name}${notes.length ? ` (${notes.join(', ')})` : ''}`
    );
  };

  const handleContactAgency = (agency: Agency) => {
    showToast(
      agency.frequency
        ? `קריאה ל${agency.name} בתדר ${agency.frequency} - ${agency.liaison || 'מוקד'}`
        : `חיוג ל${agency.name}: ${agency.phone ?? ''} - ${agency.liaison || 'מוקד'}`,
      3500
    );
  };

  const handleAlertLevelChange = (level: AlertLevel) => {
    setAlertLevel(level);
    appendLog(level === 'פע״מ - פקודת לחימה' ? 'CRITICAL' : 'WARNING', 'מפקד משמרת', `שינוי רמת כוננות: ${level}`);
  };

  const handleTriggerSimScenario = (name: string, description: string) => {
    handleAlertLevelChange('פע״מ - פקודת לחימה');
    handleAddIncident({
      title: `תרגיל קיצון: ${name}`,
      location: 'גזרת חברון וציר 60',
      details: description,
      tier: 1,
      tierLabel: 'תרגיל - דחיפות עליונה',
      assignedUnits: ['כלל כוחות הגזרה', 'יס"מ 9', 'רחפן תרמי'],
    });
    showToast(`תרגיל קיצון הופעל: ${name} - כלל הכוחות מונחים להצטרף לרשת הקשר הראשית!`, 7000);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'clock':
        return (
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            {/* Target Clocks & C2 Fast Controls (left column) */}
            <div className="w-full shrink-0 xl:order-last xl:w-80">
              <RadarControls
                onToggleFullscreen={toggleFullscreen}
                isFullscreen={isFullscreen}
                onOpenSimModal={() => setIsSimModalOpen(true)}
                onResetData={handleResetData}
                audioEnabled={audioEnabled}
                activePhaseRemainingSec={activeRemainingSec}
                nextPhaseCountdownSec={nextCountdownSec}
              />
            </div>
            {/* Milestones & Battle Tasks Timeline */}
            <div className="min-w-0 flex-1">
              <MilestonesTimeline
                milestones={milestones}
                now={now}
                onSelectMilestone={(m) => setSelectedMilestoneId(m.id)}
                onAdvanceMilestone={handleAdvanceMilestone}
                onUpdateMilestone={handleEditMilestone}
                onAddMilestone={handleAddMilestone}
                onDeleteMilestone={handleDeleteMilestone}
                audioEnabled={audioEnabled}
              />
            </div>
          </div>
        );
      case 'map':
        return (
          <TacticalMapScreen units={units} onSelectUnit={(u) => handlePingUnit(u.callSign)} audioEnabled={audioEnabled} />
        );
      case 'incidents':
      case 'log':
        return (
          <IncidentsScreen
            // key forces the tab to reset when switching between "incidents" and "log"
            key={currentScreen}
            initialTab={currentScreen === 'log' ? 'log' : 'incidents'}
            incidents={incidents}
            logs={logs}
            onAddIncident={handleAddIncident}
            onResolveIncident={handleResolveIncident}
            onUpdateIncident={handleEditIncident}
            audioEnabled={audioEnabled}
          />
        );
      case 'forces':
        return (
          <ForcesScreen units={units} onPingUnit={handlePingUnit} onUpdateUnit={handleEditUnit} audioEnabled={audioEnabled} />
        );
      case 'agencies':
        return (
          <AgenciesScreen
            agencies={agencies}
            onUpdateAgency={handleEditAgency}
            onContactAgency={handleContactAgency}
            audioEnabled={audioEnabled}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#070d19] text-[#dae2fd] font-['Assistant',sans-serif] flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Universal Command Bar */}
      <HeaderNav
        currentScreen={currentScreen}
        onScreenChange={setCurrentScreen}
        alertLevel={alertLevel}
        onAlertLevelChange={handleAlertLevelChange}
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((v) => !v)}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        commanderName={shift.commanderName}
        shiftName={shift.shiftName}
        onShiftChange={handleShiftChange}
        unresolvedIncidentsCount={unresolvedIncidentsCount}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-4 flex flex-col gap-3">
        <HudCenter
          audioEnabled={audioEnabled}
          onSimulateTransmission={handleSimulateTransmission}
          mainFrequency={mainFrequency}
          onFrequencyChange={handleFrequencyChange}
        />

        <KpiRow
          kpis={kpis}
          onOpenLprAlert={() => {
            if (audioEnabled) playEmergencyAlarm();
            setIsLprModalOpen(true);
          }}
          onOpenForces={() => setCurrentScreen('forces')}
          onOpenRoutes={() => setCurrentScreen('map')}
          onOpenAgencies={() => setCurrentScreen('agencies')}
        />

        {/* Screen content + SECURE-V4 control channels (rendered once for all screens; sidebar sits on the right in RTL, hidden on mobile where the header nav covers it) */}
        <div className="flex flex-col lg:flex-row gap-3 items-start">
          <div className="min-w-0 flex-1 w-full">{renderScreen()}</div>
          <RightSidebar
            currentScreen={currentScreen}
            onScreenChange={setCurrentScreen}
            audioEnabled={audioEnabled}
            unresolvedIncidentsCount={unresolvedIncidentsCount}
            activeUnitsCount={units.filter((u) => u.status !== 'offline').length}
          />
        </div>
      </main>

      {/* Floating Radio Transmission Toast Banner */}
      {toast && (
        <div
          key={toast.key}
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] bg-[#0e172a]/95 border-2 border-cyan-400 text-slate-100 px-4 py-2.5 rounded-md shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom"
        >
          <div className="p-1.5 rounded-full bg-cyan-500/20 text-cyan-400 animate-pulse">
            <Radio size={18} />
          </div>
          <span className="text-xs font-semibold">{toast.text}</span>
        </div>
      )}

      {/* Modals */}
      {selectedMilestone && (
        <MilestoneModal
          milestone={selectedMilestone}
          onClose={() => setSelectedMilestoneId(null)}
          onUpdateStatus={handleUpdateMilestoneStatus}
          audioEnabled={audioEnabled}
        />
      )}

      {isLprModalOpen && <LprModal onClose={() => setIsLprModalOpen(false)} />}

      {isSimModalOpen && (
        <SimModal
          onClose={() => setIsSimModalOpen(false)}
          onTriggerScenario={handleTriggerSimScenario}
          audioEnabled={audioEnabled}
        />
      )}
    </div>
  );
}
