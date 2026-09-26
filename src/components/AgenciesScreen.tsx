import { Building2, Phone } from 'lucide-react';
import { Agency, AgencyStatus } from '../types/tactical';
import { Panel, StatusDot } from './ui';
import { playRadioChirp } from '../utils/audio';

interface Props {
  agencies: Agency[];
  audioEnabled: boolean;
}

const STATUS: Record<AgencyStatus, { label: string; color: string; text: string }> = {
  connected: { label: 'מחובר', color: 'bg-emerald-400', text: 'text-emerald-300' },
  degraded: { label: 'תקשורת לקויה', color: 'bg-amber-400', text: 'text-amber-300' },
  disconnected: { label: 'מנותק', color: 'bg-red-500', text: 'text-red-300' },
};

export function AgenciesScreen({ agencies, audioEnabled }: Props) {
  const connected = agencies.filter((a) => a.status === 'connected').length;

  return (
    <Panel
      title="תיאום גורמי חוץ"
      icon={<Building2 size={16} />}
      actions={
        <span className="text-xs text-slate-400">
          <span className="font-mono text-emerald-300">{connected}</span>/{agencies.length} מחוברים
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {agencies.map((a) => {
          const st = STATUS[a.status];
          return (
            <div key={a.id} className="rounded border border-slate-800 bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot color={st.color} pulse={a.status !== 'connected'} />
                  <span className="text-sm font-bold text-slate-100">{a.name}</span>
                </div>
                <span className={`text-[11px] font-semibold ${st.text}`}>{st.label}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{a.role}</div>
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-[11px] text-slate-400">
                <span>קישור: <span className="text-slate-200">{a.liaison}</span></span>
                <span>
                  {a.frequency ? (
                    <>
                      תדר: <span className="font-mono tracking-wider text-slate-200">{a.frequency}</span>
                    </>
                  ) : (
                    <span className="text-slate-200">{a.phone}</span>
                  )}
                </span>
                <span className="col-span-2">סנכרון אחרון: <span className="font-mono text-slate-200">{a.lastSync}</span></span>
              </div>
              <button
                onClick={() => audioEnabled && playRadioChirp()}
                disabled={a.status === 'disconnected'}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-cyan-700/60 py-1 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Phone size={12} /> יצירת קשר
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
