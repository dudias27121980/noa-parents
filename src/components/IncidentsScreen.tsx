import { FormEvent, ReactNode, useState } from 'react';
import { CheckCircle2, FileText, MapPin, Plus, Siren, Users } from 'lucide-react';
import { IncidentStatus, IncidentTier, LogEntry, LogSeverity, TacticalIncident } from '../types/tactical';
import { Field, InlineEditor, Panel, fieldClass } from './ui';
import { formatDate } from '../utils/time';
import { playClick, playCompleteChime, playEmergencyAlarm } from '../utils/audio';

type Tab = 'incidents' | 'log';

export type IncidentPatch = Partial<
  Pick<TacticalIncident, 'title' | 'location' | 'details' | 'tier' | 'tierLabel' | 'status' | 'assignedUnits'>
>;

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  active: 'פעיל',
  monitoring: 'במעקב',
  resolved: 'נסגר',
};

interface Props {
  incidents: TacticalIncident[];
  logs: LogEntry[];
  onAddIncident: (inc: Partial<TacticalIncident>) => void;
  onResolveIncident: (id: string) => void;
  onUpdateIncident: (id: string, patch: IncidentPatch) => void;
  audioEnabled: boolean;
  initialTab?: Tab;
}

const TIER_STYLE: Record<IncidentTier, string> = {
  1: 'border-red-500/70 bg-red-500/10 text-red-200',
  2: 'border-amber-400/60 bg-amber-400/10 text-amber-200',
  3: 'border-slate-600 bg-slate-600/10 text-slate-300',
};

const TIER_LABEL: Record<IncidentTier, string> = {
  1: 'דחוף - סכנת חיים',
  2: 'חריג - בבדיקה',
  3: 'שגרתי',
};

export const SEVERITY_STYLE: Record<LogSeverity, string> = {
  CRITICAL: 'text-red-300 bg-red-500/15',
  WARNING: 'text-amber-200 bg-amber-400/15',
  NOMINAL: 'text-emerald-300 bg-emerald-500/10',
};

export function IncidentsScreen({
  incidents,
  logs,
  onAddIncident,
  onResolveIncident,
  onUpdateIncident,
  audioEnabled,
  initialTab = 'incidents',
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Keep the row being edited visible even if its status changes filter membership mid-edit
  const visible = incidents.filter((i) => filter === 'all' || i.status !== 'resolved' || i.id === editingId);

  return (
    <Panel
      title={tab === 'incidents' ? 'ניהול אירועים' : 'יומן מבצעים'}
      icon={tab === 'incidents' ? <Siren size={16} /> : <FileText size={16} />}
      actions={
        <div className="flex gap-1 text-xs">
          {(['incidents', 'log'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                if (audioEnabled) playClick();
                setTab(t);
              }}
              className={`rounded px-2 py-1 font-semibold ${
                tab === t ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t === 'incidents' ? 'אירועים' : 'יומן'}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'incidents' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-xs">
              <FilterButton active={filter === 'open'} onClick={() => setFilter('open')}>
                פתוחים ({incidents.filter((i) => i.status !== 'resolved').length})
              </FilterButton>
              <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
                הכל ({incidents.length})
              </FilterButton>
              <span className="ms-2 hidden text-[11px] text-slate-500 sm:inline">לחיצה כפולה על אירוע לעריכה</span>
            </div>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1 rounded border border-cyan-500/60 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20"
            >
              <Plus size={14} /> פתיחת אירוע
            </button>
          </div>

          {showForm && (
            <NewIncidentForm
              onSubmit={(inc) => {
                if (audioEnabled) (inc.tier === 1 ? playEmergencyAlarm : playClick)();
                onAddIncident(inc);
                setShowForm(false);
              }}
              onCancel={() => setShowForm(false)}
            />
          )}

          {visible.length === 0 && (
            <div className="rounded border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
              אין אירועים פתוחים בגזרה
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {visible.map((inc) =>
              editingId === inc.id ? (
                <li key={inc.id}>
                  <IncidentEditor
                    incident={inc}
                    onSave={(patch) => {
                      if (audioEnabled) playClick();
                      onUpdateIncident(inc.id, patch);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
              <li
                key={inc.id}
                onDoubleClick={() => {
                  if (editingId) return; // one editor at a time
                  if (audioEnabled) playClick();
                  setEditingId(inc.id);
                }}
                title="לחיצה כפולה לעריכה"
                className={`cursor-default select-none rounded border p-3 transition hover:brightness-125 ${TIER_STYLE[inc.tier]} ${inc.status === 'resolved' ? 'opacity-50' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{inc.id}</span>
                      <span className="rounded bg-black/30 px-1.5 text-[10px] font-bold">{inc.tierLabel}</span>
                      {inc.status === 'monitoring' && (
                        <span className="rounded bg-cyan-500/20 px-1.5 text-[10px] text-cyan-200">במעקב</span>
                      )}
                      {inc.status === 'resolved' && (
                        <span className="rounded bg-emerald-500/20 px-1.5 text-[10px] text-emerald-200">נסגר</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-100">{inc.title}</div>
                  </div>
                  <span className="font-mono text-xs text-slate-400" dir="ltr">
                    {formatDate(inc.date)} {inc.time}
                  </span>
                </div>
                {inc.details && <p className="mt-1 text-xs text-slate-300">{inc.details}</p>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {inc.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} /> {inc.assignedUnits.join(', ')}
                    </span>
                  </div>
                  {inc.status !== 'resolved' && (
                    <button
                      onClick={() => {
                        if (audioEnabled) playCompleteChime();
                        onResolveIncident(inc.id);
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 rounded border border-emerald-500/60 px-2 py-1 font-bold text-emerald-200 hover:bg-emerald-500/15"
                    >
                      <CheckCircle2 size={12} /> סגירת אירוע
                    </button>
                  )}
                </div>
              </li>
              )
            )}
          </ul>
        </div>
      ) : (
        <LogTable logs={logs} />
      )}
    </Panel>
  );
}

function LogTable({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-xs">
        <thead className="text-slate-400">
          <tr className="border-b border-slate-800">
            <th className="p-2 text-start font-semibold">תאריך</th>
            <th className="p-2 text-start font-semibold">שעה</th>
            <th className="p-2 text-start font-semibold">חומרה</th>
            <th className="p-2 text-start font-semibold">מקור</th>
            <th className="p-2 text-start font-semibold">פעולה</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-slate-800/60 hover:bg-white/5">
              <td className="whitespace-nowrap p-2 font-mono text-slate-400">{formatDate(l.date)}</td>
              <td className="p-2 font-mono text-slate-300">{l.timestamp}</td>
              <td className="p-2">
                <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${SEVERITY_STYLE[l.severity]}`}>
                  {l.severity}
                </span>
              </td>
              <td className="p-2 text-slate-300">{l.source}</td>
              <td className="p-2 text-slate-100">{l.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 font-semibold ${
        active ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function NewIncidentForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (inc: Partial<TacticalIncident>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [tier, setTier] = useState<IncidentTier>(2);
  const [units, setUnits] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const assigned = units
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({
      title: title.trim(),
      location: location.trim() || undefined,
      details: details.trim(),
      tier,
      tierLabel: TIER_LABEL[tier],
      assignedUnits: assigned.length ? assigned : undefined,
    });
  };

  const input =
    'w-full rounded border border-slate-700 bg-black/30 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500';

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-2 rounded border border-cyan-800/60 bg-black/20 p-3 sm:grid-cols-2">
      <input className={input} placeholder="כותרת האירוע *" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      <input className={input} placeholder="מיקום" value={location} onChange={(e) => setLocation(e.target.value)} />
      <textarea
        className={`${input} sm:col-span-2`}
        rows={2}
        placeholder="פרטים"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <select className={input} value={tier} onChange={(e) => setTier(Number(e.target.value) as IncidentTier)}>
        {([1, 2, 3] as const).map((t) => (
          <option key={t} value={t} className="bg-[#0b1426]">
            דרג {t} - {TIER_LABEL[t]}
          </option>
        ))}
      </select>
      <input className={input} placeholder="כוחות משויכים (מופרדים בפסיק)" value={units} onChange={(e) => setUnits(e.target.value)} />
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
          ביטול
        </button>
        <button type="submit" className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500">
          פתח אירוע
        </button>
      </div>
    </form>
  );
}

function IncidentEditor({
  incident,
  onSave,
  onCancel,
}: {
  incident: TacticalIncident;
  onSave: (patch: IncidentPatch) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(incident.title);
  const [location, setLocation] = useState(incident.location);
  const [details, setDetails] = useState(incident.details);
  const [tier, setTier] = useState<IncidentTier>(incident.tier);
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [units, setUnits] = useState(incident.assignedUnits.join(', '));

  const invalid = !title.trim();

  const save = () => {
    const assignedUnits = units
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    onSave({
      title: title.trim(),
      location: location.trim(),
      details: details.trim(),
      tier,
      // Keep a custom label (e.g. drills) unless the tier itself changed
      tierLabel: tier === incident.tier ? incident.tierLabel : TIER_LABEL[tier],
      status,
      assignedUnits,
    });
  };

  return (
    <InlineEditor onSubmit={save} onCancel={onCancel} invalid={invalid} className="grid-cols-1 sm:grid-cols-4">
      <Field label="כותרת *" className="sm:col-span-2">
        <input className={fieldClass(invalid)} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <Field label="דרג">
        <select className={fieldClass()} value={tier} onChange={(e) => setTier(Number(e.target.value) as IncidentTier)}>
          {([1, 2, 3] as const).map((t) => (
            <option key={t} value={t} className="bg-[#0b1426]">
              דרג {t} - {TIER_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="סטטוס">
        <select className={fieldClass()} value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)}>
          {(Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[]).map((st) => (
            <option key={st} value={st} className="bg-[#0b1426]">
              {INCIDENT_STATUS_LABEL[st]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="מיקום" className="sm:col-span-2">
        <input className={fieldClass()} value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="כוחות משויכים (מופרדים בפסיק)" className="sm:col-span-2">
        <input className={fieldClass()} value={units} onChange={(e) => setUnits(e.target.value)} />
      </Field>
      <Field label="פרטים" className="sm:col-span-4">
        <textarea className={fieldClass()} rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
    </InlineEditor>
  );
}
