import { FormEvent, ReactNode, useState } from 'react';
import { CheckCircle2, FileText, MapPin, Plus, Siren, Users } from 'lucide-react';
import { BlackBoxEntry, IncidentTier, LogSeverity, TacticalIncident } from '../types/tactical';
import { Panel } from './ui';
import { playClick, playCompleteChime, playEmergencyAlarm } from '../utils/audio';

type Tab = 'incidents' | 'log';

interface Props {
  incidents: TacticalIncident[];
  logs: BlackBoxEntry[];
  onAddIncident: (inc: Partial<TacticalIncident>) => void;
  onResolveIncident: (id: string) => void;
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
  audioEnabled,
  initialTab = 'incidents',
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const visible = incidents.filter((i) => filter === 'all' || i.status !== 'resolved');

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
            <div className="flex gap-1 text-xs">
              <FilterButton active={filter === 'open'} onClick={() => setFilter('open')}>
                פתוחים ({incidents.filter((i) => i.status !== 'resolved').length})
              </FilterButton>
              <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
                הכל ({incidents.length})
              </FilterButton>
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
            {visible.map((inc) => (
              <li
                key={inc.id}
                className={`rounded border p-3 ${TIER_STYLE[inc.tier]} ${inc.status === 'resolved' ? 'opacity-50' : ''}`}
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
                  <span className="font-mono text-xs text-slate-400">{inc.time}</span>
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
                      className="flex items-center gap-1 rounded border border-emerald-500/60 px-2 py-1 font-bold text-emerald-200 hover:bg-emerald-500/15"
                    >
                      <CheckCircle2 size={12} /> סגירת אירוע
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <LogTable logs={logs} />
      )}
    </Panel>
  );
}

export function LogTable({ logs }: { logs: BlackBoxEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="text-slate-400">
          <tr className="border-b border-slate-800">
            <th className="p-2 text-start font-semibold">שעה</th>
            <th className="p-2 text-start font-semibold">חומרה</th>
            <th className="p-2 text-start font-semibold">מקור</th>
            <th className="p-2 text-start font-semibold">פעולה</th>
            <th className="p-2 text-start font-semibold">חתימה</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-slate-800/60 hover:bg-white/5">
              <td className="p-2 font-mono text-slate-300">{l.timestamp}</td>
              <td className="p-2">
                <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${SEVERITY_STYLE[l.severity]}`}>
                  {l.severity}
                </span>
              </td>
              <td className="p-2 text-slate-300">{l.source}</td>
              <td className="p-2 text-slate-100">{l.action}</td>
              <td className="p-2 font-mono text-[10px] text-slate-500" dir="ltr">
                {l.hash}
              </td>
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
