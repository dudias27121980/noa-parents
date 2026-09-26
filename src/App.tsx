import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ViewScreen,
  AlertLevel,
  Milestone,
  MilestoneStatus,
  TacticalUnit,
  TacticalIncident,
  BlackBoxEntry,
  LogSeverity,
} from './types/tactical';
import {
  INITIAL_MILESTONES,
  INITIAL_KPIS,
  INITIAL_INCIDENTS,
  INITIAL_UNITS,
  INITIAL_AGENCIES,
  INITIAL_BLACKBOX_LOGS,
} from './data/tacticalData';
import { HeaderNav } from './components/HeaderNav';
import { HudCenter } from './components/HudCenter';
import { KpiRow } from './components/KpiRow';
import { RadarControls } from './components/RadarControls';
import { MilestonesTimeline } from './components/MilestonesTimeline';
import { RightSidebar } from './components/RightSidebar';
import { TacticalMapScreen } from './components/TacticalMapScreen';
import { IncidentsScreen } from './components/IncidentsScreen';
import { ForcesScreen } from './components/ForcesScreen';
import { AgenciesScreen } from './components/AgenciesScreen';
import { MilestoneModal } from './components/MilestoneModal';
import { LprModal } from './components/LprModal';
import { SimModal } from './components/SimModal';
import { BlackBoxModal } from './components/BlackBoxModal';
import { playCompleteChime, playEmergencyAlarm } from './utils/audio';
import { clockTime, formatDuration, shortHash } from './utils/time';
import { Radio } from 'lucide-react';

const STATUS_BADGE: Record<MilestoneStatus, string> = {
  completed: 'הושלם בהצלחה',
  active: 'פעיל כעת',
  next: 'הבא בתור',
  scheduled: 'מתוכנן',
};

const PHASE_MIN_SEC = 15 * 60;
const PHASE_GAP_SEC = 30 * 60;

/**
 * Milestones run strictly in order: exactly one 'active' (the first open one unless one is
 * already running), the following open one is 'next', the rest 'scheduled'.
 */
const advanceMilestones = (list: Milestone[], id: string, status: MilestoneStatus): Milestone[] => {
  const updated = list.map((m) =>
    m.id === id ? { ...m, statusType: status, progressPercent: status === 'completed' ? 100 : m.progressPercent } : m
  );
  const open = updated.filter((m) => m.statusType !== 'completed');
  const active = open.find((m) => m.statusType === 'active') ?? open[0];
  const upcoming = open.find((m) => m !== active);
  return updated.map((m) => {
    if (m.statusType === 'completed') return { ...m, statusBadge: STATUS_BADGE.completed };
    const statusType: MilestoneStatus = m === active ? 'active' : m === upcoming ? 'next' : 'scheduled';
    return { ...m, statusType, statusBadge: STATUS_BADGE[statusType] };
  });
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ViewScreen>('clock');
  const [alertLevel, setAlertLevel] = useState<AlertLevel>('כוננות ג׳ - מצב מבצעי מוגבר');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tactical Data state
  const [milestones, setMilestones] = useState<Milestone[]>(INITIAL_MILESTONES);
  const [incidents, setIncidents] = useState<TacticalIncident[]>(INITIAL_INCIDENTS);
  const [units, setUnits] = useState<TacticalUnit[]>(INITIAL_UNITS);
  const [agencies] = useState(INITIAL_AGENCIES);
  const [logs, setLogs] = useState<BlackBoxEntry[]>(INITIAL_BLACKBOX_LOGS);

  // Modals state
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [isLprModalOpen, setIsLprModalOpen] = useState(false);
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [isBlackBoxOpen, setIsBlackBoxOpen] = useState(false);

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

  // Live countdowns
  const [activePhaseSec, setActivePhaseSec] = useState(18 * 60 + 39);
  const [nextPhaseSec, setNextPhaseSec] = useState(34 * 60 + 7);
  useEffect(() => {
    const interval = setInterval(() => {
      setActivePhaseSec((s) => Math.max(0, s - 1));
      setNextPhaseSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
        return { ...k, value: `${connected}/${agencies.length}` };
      }
      return k;
    });
  }, [units, agencies]);

  const unresolvedIncidentsCount = incidents.filter((i) => i.status !== 'resolved').length;

  const incidentSeq = useRef(7300);
  const logSeq = useRef(500);

  const appendLog = useCallback((severity: LogSeverity, source: string, action: string) => {
    const entry: BlackBoxEntry = {
      id: `LOG-${String(++logSeq.current).padStart(4, '0')}`,
      timestamp: clockTime(),
      severity,
      source,
      action,
      hash: shortHash(),
    };
    setLogs((prev) => [entry, ...prev]);
  }, []);

  const handleSimulateTransmission = () => {
    showToast('קשר "ברק" 148.950MHz: חפ"ק לכלל הכוחות בגזרה - הגבירו עירנות בציר 60');
  };

  const handlePingUnit = (callSign: string) => {
    showToast(`קריאה ישירה בקשר מוצפן אל כוח ${callSign} - בדיקת קליטה ומיקום`, 3500);
  };

  const handleUpdateMilestoneStatus = (id: string, newStatus: MilestoneStatus) => {
    const target = milestones.find((m) => m.id === id);
    if (!target || target.statusType === newStatus) return;

    const next = advanceMilestones(milestones, id, newStatus);
    setMilestones(next);
    appendLog('NOMINAL', 'חפ"ק אג"מ מרחב יהודה', `אבן דרך ${target.code} "${target.title}": ${STATUS_BADGE[newStatus]}`);

    // Completing the running phase starts the next one — restart the target clocks accordingly
    if (target.statusType === 'active' && newStatus === 'completed') {
      const hasActive = next.some((m) => m.statusType === 'active');
      const hasNext = next.some((m) => m.statusType === 'next');
      const newActive = hasActive ? Math.max(nextPhaseSec, PHASE_MIN_SEC) : 0;
      setActivePhaseSec(newActive);
      setNextPhaseSec(hasNext ? newActive + PHASE_GAP_SEC : 0);
    }
  };

  const handleAdvanceMilestone = (id: string) => {
    if (audioEnabled) playCompleteChime();
    handleUpdateMilestoneStatus(id, 'completed');
  };

  const handleAddIncident = (newInc: Partial<TacticalIncident>) => {
    const fullInc: TacticalIncident = {
      id: `INC-${++incidentSeq.current}`,
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
                onOpenBlackBoxLogs={() => setIsBlackBoxOpen(true)}
                audioEnabled={audioEnabled}
                activePhaseRemaining={formatDuration(activePhaseSec)}
                nextPhaseCountdown={formatDuration(nextPhaseSec)}
              />
            </div>
            {/* Milestones & Battle Tasks Timeline */}
            <div className="min-w-0 flex-1">
              <MilestonesTimeline
                milestones={milestones}
                onSelectMilestone={setSelectedMilestone}
                onAdvanceMilestone={handleAdvanceMilestone}
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
            audioEnabled={audioEnabled}
          />
        );
      case 'forces':
        return <ForcesScreen units={units} onPingUnit={handlePingUnit} audioEnabled={audioEnabled} />;
      case 'agencies':
        return <AgenciesScreen agencies={agencies} audioEnabled={audioEnabled} />;
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
        commanderName='נצ"מ כהן'
        unresolvedIncidentsCount={unresolvedIncidentsCount}
        shiftName="ב'"
      />

      {/* Main Viewport Container */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-4 flex flex-col gap-3">
        <HudCenter audioEnabled={audioEnabled} onSimulateTransmission={handleSimulateTransmission} />

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
          onClose={() => setSelectedMilestone(null)}
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

      {isBlackBoxOpen && <BlackBoxModal logs={logs} onClose={() => setIsBlackBoxOpen(false)} />}
    </div>
  );
}
