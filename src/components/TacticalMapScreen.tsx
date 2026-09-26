import { useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { TacticalUnit, UnitStatus } from '../types/tactical';
import { Panel } from './ui';
import { UNIT_STATUS_LABEL, UNIT_TYPE_LABEL } from '../shared/labels';
import { playRadioChirp } from '../utils/audio';

interface Props {
  units: TacticalUnit[];
  onSelectUnit: (u: TacticalUnit) => void;
  audioEnabled: boolean;
}

export { UNIT_TYPE_LABEL };

export const UNIT_STATUS: Record<UnitStatus, { label: string; color: string; text: string }> = {
  deployed: { label: UNIT_STATUS_LABEL.deployed, color: 'bg-emerald-400', text: 'text-emerald-300' },
  'en-route': { label: UNIT_STATUS_LABEL['en-route'], color: 'bg-amber-400', text: 'text-amber-300' },
  standby: { label: UNIT_STATUS_LABEL.standby, color: 'bg-cyan-400', text: 'text-cyan-300' },
  offline: { label: UNIT_STATUS_LABEL.offline, color: 'bg-red-500', text: 'text-red-300' },
};

// Schematic road overlay (percent coordinates on a 100x100 viewBox)
const ROUTES = [
  { id: '60', label: 'ציר 60', d: 'M50 0 L48 30 L50 50 L40 75 L36 100' },
  { id: '35', label: 'ציר 35', d: 'M0 62 L25 55 L50 50 L80 42 L100 38' },
];

export function TacticalMapScreen({ units, onSelectUnit, audioEnabled }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = units.find((u) => u.id === selectedId) ?? null;

  return (
    <Panel title="מפה טקטית - מרחב יהודה" icon={<MapIcon size={16} />}>
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="tactical-grid relative aspect-[4/3] w-full overflow-hidden rounded border border-cyan-900/60 bg-[#06101f] xl:flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {ROUTES.map((r) => (
              <path
                key={r.id}
                d={r.d}
                fill="none"
                stroke={r.id === '35' ? 'rgba(251,191,36,0.55)' : 'rgba(148,163,184,0.45)'}
                strokeWidth={1.2}
                strokeDasharray={r.id === '35' ? '2 1.5' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <span className="absolute start-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-300">
            ציר 60 · ציר 35 (חסום חלקית)
          </span>

          {units.map((u) => {
            const st = UNIT_STATUS[u.status];
            const isSel = u.id === selectedId;
            return (
              <button
                key={u.id}
                onClick={() => {
                  if (audioEnabled) playRadioChirp();
                  setSelectedId(u.id);
                  onSelectUnit(u);
                }}
                className="group absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-1000"
                style={{ left: `${u.x}%`, top: `${u.y}%` }}
                aria-label={u.callSign}
              >
                <span
                  className={`block h-3.5 w-3.5 rounded-full border-2 border-black/60 ${st.color} ${
                    isSel ? 'ring-4 ring-cyan-300/50' : ''
                  } ${u.status === 'offline' ? '' : 'animate-pulse'}`}
                />
                <span className="absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1 text-[10px] font-semibold text-slate-100">
                  {u.callSign}
                </span>
              </button>
            );
          })}
        </div>

        <div className="w-full shrink-0 xl:w-64">
          {selected ? (
            <div className="rounded border border-cyan-800/60 bg-black/30 p-3 text-xs">
              <div className="mb-2 text-sm font-bold text-cyan-200">{selected.callSign}</div>
              <dl className="grid grid-cols-2 gap-y-1.5">
                <dt className="text-slate-400">סוג</dt>
                <dd>{UNIT_TYPE_LABEL[selected.type]}</dd>
                <dt className="text-slate-400">סטטוס</dt>
                <dd className={UNIT_STATUS[selected.status].text}>{UNIT_STATUS[selected.status].label}</dd>
                <dt className="text-slate-400">מפקד</dt>
                <dd>{selected.commander}</dd>
                <dt className="text-slate-400">גזרה</dt>
                <dd>{selected.sector}</dd>
                <dt className="text-slate-400">קשר אחרון</dt>
                <dd className="font-mono">{selected.lastContact}</dd>
              </dl>
            </div>
          ) : (
            <div className="rounded border border-dashed border-slate-700 p-3 text-xs text-slate-400">
              לחץ על כוח במפה לפרטים ולקריאה ישירה בקשר.
            </div>
          )}
          <ul className="mt-3 flex flex-col gap-1.5 text-[11px]">
            {Object.entries(UNIT_STATUS).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2 text-slate-300">
                <span className={`h-2.5 w-2.5 rounded-full ${v.color}`} />
                {v.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
