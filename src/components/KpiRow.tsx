import { Building2, Bus, Route, SquareParking, Users, UsersRound } from 'lucide-react';
import { KpiAction, KpiCard, KpiTone } from '../types/tactical';

interface Props {
  kpis: KpiCard[];
  onOpenParking: () => void;
  onOpenForces: () => void;
  onOpenRoutes: () => void;
  onOpenAgencies: () => void;
  onOpenWorship: () => void;
  onOpenBuses: () => void;
}

const TONE: Record<KpiTone, { ring: string; text: string; bar: string }> = {
  critical: { ring: 'border-red-500/60 hover:border-red-400', text: 'text-red-300', bar: 'bg-red-500' },
  high: { ring: 'border-orange-600/70 hover:border-orange-500', text: 'text-orange-400', bar: 'bg-orange-600' },
  warning: { ring: 'border-amber-400/50 hover:border-amber-300', text: 'text-amber-300', bar: 'bg-amber-400' },
  caution: { ring: 'border-yellow-400/60 hover:border-yellow-300', text: 'text-yellow-300', bar: 'bg-yellow-400' },
  nominal: { ring: 'border-emerald-500/40 hover:border-emerald-400', text: 'text-emerald-300', bar: 'bg-emerald-500' },
  info: { ring: 'border-cyan-500/40 hover:border-cyan-400', text: 'text-cyan-300', bar: 'bg-cyan-400' },
};

const ICON: Record<KpiAction, typeof Users> = {
  parking: SquareParking,
  forces: Users,
  routes: Route,
  agencies: Building2,
  worship: UsersRound,
  buses: Bus,
};

export function KpiRow({ kpis, onOpenParking, onOpenForces, onOpenRoutes, onOpenAgencies, onOpenWorship, onOpenBuses }: Props) {
  const handlers: Record<KpiAction, () => void> = {
    parking: onOpenParking,
    forces: onOpenForces,
    routes: onOpenRoutes,
    agencies: onOpenAgencies,
    worship: onOpenWorship,
    buses: onOpenBuses,
  };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      {kpis.map((k) => {
        const tone = TONE[k.tone];
        const Icon = ICON[k.action];
        return (
          <button
            key={k.id}
            onClick={handlers[k.action]}
            className={`group relative overflow-hidden rounded-md border bg-[#0b1426] p-3 text-start transition ${tone.ring}`}
          >
            <span className={`absolute inset-y-0 start-0 w-1 ${tone.bar}`} />
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-slate-400">{k.label}</span>
              <Icon size={16} className={`${tone.text} ${k.tone === 'critical' ? 'animate-pulse' : ''}`} />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={`font-mono text-2xl font-bold ${tone.text}`} dir="ltr">
                {k.value}
              </span>
              {k.unit && <span className="text-xs text-slate-400">{k.unit}</span>}
              {k.side && (
                <span className="ms-auto flex flex-col items-end border-s border-slate-700 ps-2 leading-tight" data-testid={`${k.id}-side`}>
                  <span className="text-[10px] text-slate-400">{k.side.label}</span>
                  <span className="font-mono text-lg font-bold text-slate-100" dir="ltr">
                    {k.side.value}
                  </span>
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-[11px] text-slate-300">{k.subLabel}</div>
            <div className="text-[10px] text-slate-500">{k.trend}</div>
          </button>
        );
      })}
    </div>
  );
}
