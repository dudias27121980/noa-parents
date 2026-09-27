import { ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AlertLevel, Agency, KpiCard, MilestoneStatus, ParkingLot, TacticalIncident, ViewScreen } from './types/tactical';
import { INITIAL_KPIS } from './data/tacticalData';
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
import { ParkingModal } from './components/ParkingModal';
import { TitleBanner } from './components/TitleBanner';
import { WorshipModal } from './components/WorshipModal';
import { BusModal } from './components/BusModal';
import { busTotals, fmt, worshipSummary } from './shared/buses';
import { OccupancyLevel, lotRatio, occupancyLevel, parkingTotals, percent } from './shared/parking';
import { SimModal } from './components/SimModal';
import { SCREENS } from './components/screens';
import { playCompleteChime, playEmergencyAlarm, playParkingAlarm, playRadioChirp } from './utils/audio';
import { phaseCountdowns } from './utils/schedule';
import { isBoolean, oneOf, usePersistentState } from './utils/persist';
import {
  Action,
  AgencyFields,
  AgencyPatch,
  IncidentPatch,
  MilestoneFields,
  MilestonePatch,
  SharedState,
  Shift,
  TaskPatch,
  UnitFields,
  UnitPatch,
} from './shared/protocol';
import { ROUTE_STATUS_LABEL } from './shared/labels';
import { SharedStore, StoreView } from './sync/store';
import { Radio, WifiOff } from 'lucide-react';

// Per-station preferences stay in this browser; everything operational lives on the server
const isScreen = oneOf<ViewScreen>(SCREENS.map((s) => s.id));

/** Parking tile colour by overall occupancy: green, yellow (50%), dark orange (75%), red (90%) */
const LEVEL_TONE: Record<OccupancyLevel, KpiCard['tone']> = { green: 'nominal', yellow: 'caution', orange: 'high', red: 'critical' };

interface Props {
  store: SharedStore;
  /** Omitted in the offline file, which has no login */
  onLogout?: () => void;
  /** Extra buttons in the header (the offline file's backup export/import) */
  headerActions?: ReactNode;
}

export default function App({ store, onLogout, headerActions }: Props) {
  const view = useSyncExternalStore(store.subscribe, store.getView);

  if (!view.state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070d19] font-['Assistant',sans-serif] text-slate-300">
        <div className="flex items-center gap-3 text-sm" role="status">
          <span className="h-3 w-3 animate-ping rounded-full bg-cyan-400" />
          {view.status === 'offline' ? 'אין חיבור לשרת - מנסה שוב…' : 'מתחבר לשרת…'}
        </div>
      </div>
    );
  }

  return <Dashboard store={store} view={view} state={view.state} onLogout={onLogout} headerActions={headerActions} />;
}

function Dashboard({
  store,
  view,
  state,
  onLogout,
  headerActions,
}: Props & { view: StoreView; state: SharedState }) {
  const { milestones, incidents, units, agencies, parkingLots, worshipReports, buses, routes, scenarios, logs, alertLevel, mainFrequency, shift, hqName } =
    state;
  const online = view.status === 'online';
  // Wall display: the whole working area is view-only (the server refuses changes too)
  const readOnly = view.readOnly;

  // Radio Transmission Live Toast — one timer, so a new message never gets cut short by an older one
  const [toast, setToast] = useState<{ text: string; ms: number; key: number; critical?: boolean } | null>(null);
  const showToast = useCallback((text: string, ms = 4000, critical = false) => {
    setToast({ text, ms, key: Date.now(), critical });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.ms);
    return () => clearTimeout(t);
  }, [toast]);

  const [currentScreen, setCurrentScreen] = usePersistentState('screen', () => 'clock' as ViewScreen, isScreen);
  const [audioEnabled, setAudioEnabled] = usePersistentState('audio', () => true, isBoolean);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Store the id, not a copy, so the modal always shows the current row (including other stations' edits)
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const [isParkingModalOpen, setIsParkingModalOpen] = useState(false);
  const [isWorshipModalOpen, setIsWorshipModalOpen] = useState(false);
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);

  // Target clocks run on the browser clock: countdowns are derived from the schedule each tick
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  const { activeRemainingSec, nextCountdownSec } = phaseCountdowns(milestones, now);

  // Alerts raised by other stations (urgent incident, alert level, drill)
  useEffect(
    () =>
      store.onNotice((n) => {
        if (audioEnabled) (n.level === 'critical' ? playEmergencyAlarm : playRadioChirp)();
        showToast(`${n.from}: ${n.text}`, n.level === 'critical' ? 8000 : 5000, n.level === 'critical');
      }),
    [store, audioEnabled, showToast]
  );

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

  // Every KPI is computed from the live shared data, so the cards never disagree with the screens
  const kpis = useMemo(() => {
    const onAir = units.filter((u) => u.status !== 'offline');
    const personnel = onAir.reduce((sum, u) => sum + u.personnel, 0);
    const deployed = units.filter((u) => u.status === 'deployed').length;
    const connected = agencies.filter((a) => a.status === 'connected').length;
    const lotsWithRoom = parkingLots.filter((p) => p.status === 'available' || p.status === 'filling');
    const namesOf = (status: ParkingLot['status']) =>
      parkingLots
        .filter((p) => p.status === status)
        .map((p) => p.name)
        .join(', ');
    const fullLots = namesOf('full');
    const closedLots = namesOf('closed');
    const totals = parkingTotals(parkingLots);
    // The fullest open lot with a capacity
    const fullest = parkingLots
      .filter((p) => p.status !== 'closed' && p.capacity > 0)
      .sort((a, b) => b.occupied / b.capacity - a.occupied / a.capacity)[0];
    const openRoutes = routes.filter((r) => r.status === 'open').length;
    const blockedRoute = routes.find((r) => r.status === 'closed') ?? routes.find((r) => r.status === 'partial');
    const closedRoutes = routes.filter((r) => r.status === 'closed').length;
    const problemAgency = agencies.find((a) => a.status === 'disconnected') ?? agencies.find((a) => a.status === 'degraded');

    const worship = worshipSummary(worshipReports);
    const bus = busTotals(buses);

    return INITIAL_KPIS.map((k): KpiCard => {
      switch (k.action) {
        case 'parking': {
          const blocked = [fullLots && `מלאים: ${fullLots}`, closedLots && `סגורים: ${closedLots}`].filter(Boolean).join(' · ');
          if (totals.ratio === null) {
            // No capacities entered yet: the status picture only
            return {
              ...k,
              value: `${lotsWithRoom.length}/${parkingLots.length}`,
              unit: 'פנויים',
              tone: parkingLots.length && !lotsWithRoom.length ? 'critical' : blocked ? 'warning' : 'nominal',
              subLabel: blocked || 'כל החניונים פנויים',
              trend: 'להזנת קיבולת ורכבים: לחיצה על הריבוע',
            };
          }
          return {
            ...k,
            value: `${percent(totals.ratio)}%`,
            unit: 'תפוסה',
            tone: LEVEL_TONE[occupancyLevel(totals.ratio)],
            subLabel: `${totals.occupied}/${totals.capacity} רכבים · ${totals.free} מקומות פנויים`,
            trend: blocked || (fullest ? `הכי מלא: ${fullest.name} ${percent(fullest.occupied / fullest.capacity)}%` : ''),
          };
        }
        case 'forces':
          return { ...k, value: String(personnel), subLabel: `${onAir.length} צוותים בקשר`, trend: `${deployed} פרוסים` };
        case 'routes':
          return {
            ...k,
            value: `${openRoutes}/${routes.length}`,
            tone: closedRoutes ? 'critical' : blockedRoute ? 'warning' : 'nominal',
            subLabel: blockedRoute ? `${blockedRoute.name} ${ROUTE_STATUS_LABEL[blockedRoute.status]}` : 'כל הצירים פתוחים',
            trend: closedRoutes ? `${closedRoutes} סגורים` : blockedRoute?.note || '',
          };
        case 'agencies':
          return {
            ...k,
            value: `${connected}/${agencies.length}`,
            subLabel: problemAgency
              ? `${problemAgency.name} ${problemAgency.status === 'disconnected' ? 'מנותק' : 'בתקשורת לקויה'}`
              : 'כל הכוחות החבירים מחוברים',
            trend: '',
          };
        case 'worship': {
          if (!worship.latest) return { ...k, value: '—', subLabel: 'אין דיווחים', trend: 'להזנת דיווח: לחיצה על הריבוע', tone: 'info' };
          const c = worship.change;
          return {
            ...k,
            value: fmt(worship.latest.count),
            unit: 'מתפללים',
            tone: 'info',
            side: { label: 'מתחילת האירוע', value: fmt(worship.total) },
            subLabel: `דיווח אחרון ${worship.latest.time}${c === null ? '' : c === 0 ? ' · ללא שינוי' : ` · ${c > 0 ? '▲' : '▼'} ${fmt(Math.abs(c))}`}`,
            trend: worship.peak ? `שיא: ${fmt(worship.peak.count)} ב-${worship.peak.time}` : '',
          };
        }
        case 'buses': {
          if (!bus.buses) return { ...k, value: '0/0', subLabel: 'אין אוטובוסים', trend: 'להזנת אוטובוסים: לחיצה על הריבוע', tone: 'info' };
          const r = bus.perRoute;
          return {
            ...k,
            value: `${bus.departed}/${bus.buses}`,
            unit: 'יצאו',
            tone: 'info',
            subLabel: `י-ם←ק"א ${fmt(r['jlm-ka'].passengers)} · ק"א←י-ם ${fmt(r['ka-jlm'].passengers)} · שאטלים ${fmt(r.shuttle.passengers)}`,
            trend: `סה"כ ${fmt(bus.passengers)} נוסעים${bus.enRoute ? ` · ${bus.enRoute} בדרך` : ''}`,
          };
        }
      }
    });
  }, [units, agencies, parkingLots, routes, worshipReports, buses]);

  // Parking alarm: five seconds of beeps and a red message when the overall occupancy, or any single open
  // lot, reaches 90%. Only on the crossing (not when the page opens already red), at every station that
  // sees it, and one alarm even when several cross in the same change.
  const parkingRatio = useMemo(() => parkingTotals(parkingLots).ratio, [parkingLots]);
  const parkingLevel = parkingRatio === null ? null : occupancyLevel(parkingRatio);
  const redLots = useMemo(
    () =>
      parkingLots.filter((p) => {
        const r = lotRatio(p);
        return p.status !== 'closed' && r !== null && occupancyLevel(r) === 'red';
      }),
    [parkingLots]
  );
  const lastParking = useRef({ level: parkingLevel, red: new Set(redLots.map((p) => p.id)) });
  useEffect(() => {
    const was = lastParking.current;
    lastParking.current = { level: parkingLevel, red: new Set(redLots.map((p) => p.id)) };
    const newlyRed = redLots.filter((p) => !was.red.has(p.id));
    const overallCrossed = parkingLevel === 'red' && was.level !== 'red';
    if (!newlyRed.length && !overallCrossed) return;
    if (audioEnabled) playParkingAlarm();
    const lines = [
      ...newlyRed.map((p) => `חניון ${p.name} הגיע ל-${percent(lotRatio(p)!)}%`),
      overallCrossed ? `תפוסת החניונים הגיעה ל-${percent(parkingRatio!)}%` : '',
    ].filter(Boolean);
    showToast(lines.join(' · '), 8000, true);
  }, [parkingLevel, parkingRatio, redLots, audioEnabled, showToast]);

  const unresolvedIncidentsCount = incidents.filter((i) => i.status !== 'resolved').length;

  /** Sends an action to the server; the change arrives back (on every station) as a patch */
  const send = useCallback(
    async (action: Action) => {
      const result = await store.dispatch(action);
      if (!result.ok) showToast(result.error, 6000, true);
      return result;
    },
    [store, showToast]
  );

  const handleSimulateTransmission = () => {
    showToast(`קשר "ברק" תדר ${mainFrequency}: חפ"ק לכלל הכוחות בגזרה - הגבירו עירנות בציר 60`);
  };

  const handlePingUnit = (callSign: string) => {
    showToast(`קריאה ישירה בקשר מוצפן אל כוח ${callSign} - בדיקת קליטה ומיקום`, 3500);
  };

  const handleContactAgency = (agency: Agency) => {
    showToast(
      agency.frequency
        ? `קריאה ל${agency.name} בתדר ${agency.frequency} - ${agency.liaison || 'מוקד'}`
        : `חיוג ל${agency.name}: ${agency.phone ?? ''} - ${agency.liaison || 'מוקד'}`,
      3500
    );
  };

  const handleResetData = async () => {
    const r = await send({ type: 'demo.reset' });
    if (r.ok) {
      setSelectedMilestoneId(null);
      showToast('הנתונים אופסו לנתוני ההדגמה', 3000);
    }
  };

  const handleUpdateMilestoneStatus = (id: string, status: MilestoneStatus) =>
    void send({ type: 'milestone.setStatus', id, status });
  const handleEditMilestone = (id: string, patch: MilestonePatch) => void send({ type: 'milestone.update', id, patch });
  const handleAddMilestone = (fields: MilestoneFields) => void send({ type: 'milestone.add', fields });
  const handleDeleteMilestone = (id: string) => void send({ type: 'milestone.delete', id });
  const handleAdvanceMilestone = (id: string) => {
    if (audioEnabled) playCompleteChime();
    handleUpdateMilestoneStatus(id, 'completed');
  };

  const handleAddIncident = (incident: Partial<TacticalIncident>) => void send({ type: 'incident.add', incident });
  const handleResolveIncident = (id: string) => void send({ type: 'incident.resolve', id });
  const handleEditIncident = (id: string, patch: IncidentPatch) => void send({ type: 'incident.update', id, patch });
  const handleEditUnit = (id: string, patch: UnitPatch) => void send({ type: 'unit.update', id, patch });
  const handleAddUnit = (fields: UnitFields) => void send({ type: 'unit.add', fields });
  const handleDeleteUnit = (id: string) => void send({ type: 'unit.delete', id });
  const handleMoveUnit = (id: string, x: number, y: number) => void send({ type: 'unit.update', id, patch: { x, y } });
  const handleEditAgency = (id: string, patch: AgencyPatch) => void send({ type: 'agency.update', id, patch });
  const handleAddAgency = (fields: AgencyFields) => void send({ type: 'agency.add', fields });
  const handleDeleteAgency = (id: string) => void send({ type: 'agency.delete', id });
  const handleAddTask = (milestoneId: string, text: string) => void send({ type: 'task.add', milestoneId, text });
  const handleUpdateTask = (milestoneId: string, taskId: string, patch: TaskPatch) =>
    void send({ type: 'task.update', milestoneId, taskId, patch });
  const handleDeleteTask = (milestoneId: string, taskId: string) => void send({ type: 'task.delete', milestoneId, taskId });
  const handleHqNameChange = (name: string) => void send({ type: 'hqName.set', name });
  const handleFrequencyChange = (frequency: string) => void send({ type: 'frequency.set', frequency });
  const handleShiftChange = (next: Shift) => void send({ type: 'shift.set', shift: next });
  const handleAlertLevelChange = (level: AlertLevel) => void send({ type: 'alertLevel.set', level });

  const handleTriggerSimScenario = async (name: string, description: string) => {
    const r = await send({ type: 'sim.trigger', name, description });
    if (r.ok) showToast(`תרגיל קיצון הופעל: ${name} - כלל הכוחות מונחים להצטרף לרשת הקשר הראשית!`, 7000);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'clock':
        return (
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            {/* Target Clocks & C2 Fast Controls (left column) */}
            <div className="w-full shrink-0 xl:order-last xl:w-80">
              <RadarControls
                units={units}
                onToggleFullscreen={toggleFullscreen}
                isFullscreen={isFullscreen}
                onOpenSimModal={() => setIsSimModalOpen(true)}
                onResetData={() => void handleResetData()}
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
          <TacticalMapScreen
            units={units}
            routes={routes}
            incidents={incidents}
            parkingLots={parkingLots}
            onPlaceIncident={(id, mapPos) => void send({ type: 'incident.update', id, patch: { mapPos } })}
            onPlaceLot={(id, mapPos) => void send({ type: 'parking.update', id, patch: { mapPos } })}
            onSelectUnit={(u) => handlePingUnit(u.callSign)}
            onMoveUnit={handleMoveUnit}
            onAddRoute={(fields) => void send({ type: 'route.add', fields })}
            onUpdateRoute={(id, patch) => void send({ type: 'route.update', id, patch })}
            onDeleteRoute={(id) => void send({ type: 'route.delete', id })}
            audioEnabled={audioEnabled}
          />
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
          <ForcesScreen
            units={units}
            onPingUnit={handlePingUnit}
            onUpdateUnit={handleEditUnit}
            onAddUnit={handleAddUnit}
            onDeleteUnit={handleDeleteUnit}
            audioEnabled={audioEnabled}
          />
        );
      case 'agencies':
        return (
          <AgenciesScreen
            agencies={agencies}
            onUpdateAgency={handleEditAgency}
            onContactAgency={handleContactAgency}
            onAddAgency={handleAddAgency}
            onDeleteAgency={handleDeleteAgency}
            audioEnabled={audioEnabled}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#070d19] text-[#dae2fd] font-['Assistant',sans-serif] flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      <TitleBanner name={hqName} onChange={handleHqNameChange} readOnly={readOnly} />
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
        station={view.you ?? ''}
        stations={view.stations}
        connection={view.status}
        onLogout={onLogout}
        extraActions={headerActions}
        readOnly={readOnly}
      />

      {!online && (
        <div role="alert" className="sticky top-[57px] z-20 flex items-center justify-center gap-2 bg-red-700/90 px-3 py-2 text-sm font-bold text-white">
          <WifiOff size={16} />
          מנותק מהשרת - מנסה להתחבר מחדש. הנתונים המוצגים עלולים להיות לא עדכניים ואי אפשר לערוך.
        </div>
      )}

      {/* Main Viewport Container — read-only while disconnected, so nothing is edited against stale data */}
      <main
        inert={!online || readOnly}
        data-readonly={readOnly || undefined}
        className={`flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-4 flex flex-col gap-3 transition-opacity ${online ? '' : 'opacity-50'}`}
      >
        <HudCenter
          audioEnabled={audioEnabled}
          onSimulateTransmission={handleSimulateTransmission}
          mainFrequency={mainFrequency}
          onFrequencyChange={handleFrequencyChange}
        />

        <KpiRow
          kpis={kpis}
          onOpenParking={() => setIsParkingModalOpen(true)}
          onOpenWorship={() => setIsWorshipModalOpen(true)}
          onOpenBuses={() => setIsBusModalOpen(true)}
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
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] bg-[#0e172a]/95 border-2 text-slate-100 px-4 py-2.5 rounded-md shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom ${
            toast.critical ? 'border-red-500' : 'border-cyan-400'
          }`}
        >
          <div className={`p-1.5 rounded-full animate-pulse ${toast.critical ? 'bg-red-500/20 text-red-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
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
          onAddTask={handleAddTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          audioEnabled={audioEnabled}
        />
      )}

      {isWorshipModalOpen && (
        <WorshipModal
          reports={worshipReports}
          onAdd={(fields) => send({ type: 'worship.add', fields })}
          onUpdate={(id, patch) => void send({ type: 'worship.update', id, patch })}
          onDelete={(id) => void send({ type: 'worship.delete', id })}
          onClose={() => setIsWorshipModalOpen(false)}
        />
      )}
      {isBusModalOpen && (
        <BusModal
          buses={buses}
          onAdd={(fields) => void send({ type: 'bus.add', fields })}
          onUpdate={(id, patch) => void send({ type: 'bus.update', id, patch })}
          onDelete={(id) => void send({ type: 'bus.delete', id })}
          onClose={() => setIsBusModalOpen(false)}
        />
      )}
      {isParkingModalOpen && (
        <ParkingModal
          lots={parkingLots}
          onAdd={(fields) => void send({ type: 'parking.add', fields })}
          onUpdate={(id, patch) => void send({ type: 'parking.update', id, patch })}
          onDelete={(id) => void send({ type: 'parking.delete', id })}
          onClose={() => setIsParkingModalOpen(false)}
        />
      )}

      {isSimModalOpen && (
        <SimModal
          scenarios={scenarios}
          onAddScenario={(fields) => void send({ type: 'scenario.add', fields })}
          onUpdateScenario={(id, patch) => void send({ type: 'scenario.update', id, patch })}
          onDeleteScenario={(id) => void send({ type: 'scenario.delete', id })}
          onClose={() => setIsSimModalOpen(false)}
          onTriggerScenario={(name, description) => void handleTriggerSimScenario(name, description)}
          audioEnabled={audioEnabled}
        />
      )}
    </div>
  );
}
