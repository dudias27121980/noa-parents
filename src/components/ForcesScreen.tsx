import { useState } from 'react';
import { Radio, Signal, Users } from 'lucide-react';
import { TacticalUnit, UnitStatus } from '../types/tactical';
import { Panel, StatusDot } from './ui';
import { playRadioChirp } from '../utils/audio';
import { UNIT_STATUS, UNIT_TYPE_LABEL } from './TacticalMapScreen';

interface Props {
  units: TacticalUnit[];
  onPingUnit: (callSign: string) => void;
  audioEnabled: boolean;
}

export function ForcesScreen({ units, onPingUnit, audioEnabled }: Props) {
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>('all');
  const visible = units.filter((u) => statusFilter === 'all' || u.status === statusFilter);
  const personnel = units.filter((u) => u.status !== 'offline').reduce((sum, u) => sum + u.personnel, 0);

  return (
    <Panel
      title="סד״כ כוחות בגזרה"
      icon={<Users size={16} />}
      actions={
        <span className="text-xs text-slate-400">
          <span className="font-mono text-emerald-300">{personnel}</span> לוחמים בקשר
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        {(['all', 'deployed', 'en-route', 'standby', 'offline'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded px-2 py-1 font-semibold ${
              statusFilter === s ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s === 'all' ? `הכל (${units.length})` : `${UNIT_STATUS[s].label} (${units.filter((u) => u.status === s).length})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {visible.map((u) => {
          const st = UNIT_STATUS[u.status];
          return (
            <div key={u.id} className="rounded border border-slate-800 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusDot color={st.color} pulse={u.status !== 'offline'} />
                  <span className="text-sm font-bold text-slate-100">{u.callSign}</span>
                  <span className="rounded bg-slate-800 px-1.5 text-[10px] text-slate-300">{UNIT_TYPE_LABEL[u.type]}</span>
                </div>
                <span className={`text-[11px] font-semibold ${st.text}`}>{st.label}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-[11px] text-slate-400">
                <span>מפקד: <span className="text-slate-200">{u.commander}</span></span>
                <span>לוחמים: <span className="font-mono text-slate-200">{u.personnel}</span></span>
                <span>גזרה: <span className="text-slate-200">{u.sector}</span></span>
                <span>קשר אחרון: <span className="font-mono text-slate-200">{u.lastContact}</span></span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Signal size={12} className="text-slate-500" />
                <div className="h-1 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className={`h-full ${u.signalStrength > 80 ? 'bg-emerald-400' : u.signalStrength > 40 ? 'bg-amber-400' : 'bg-red-500'}`}
                    style={{ width: `${u.signalStrength}%` }}
                  />
                </div>
                <button
                  onClick={() => {
                    if (audioEnabled) playRadioChirp();
                    onPingUnit(u.callSign);
                  }}
                  className="flex items-center gap-1 rounded border border-cyan-600/60 px-2 py-1 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/15"
                >
                  <Radio size={12} /> קריאה
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
