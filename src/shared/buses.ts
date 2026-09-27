import { BusRoute, BusTrip, WorshipReport } from '../types/tactical';

export const BUS_ROUTES: BusRoute[] = ['jlm-ka', 'ka-jlm', 'shuttle'];

/** Buses and passengers per line, and overall. "Departed" = on the way or arrived */
export function busTotals(buses: BusTrip[]) {
  const perRoute = Object.fromEntries(
    BUS_ROUTES.map((r) => {
      const list = buses.filter((b) => b.route === r);
      return [
        r,
        {
          buses: list.length,
          departed: list.filter((b) => b.status !== 'waiting').length,
          enRoute: list.filter((b) => b.status === 'en-route').length,
          passengers: list.reduce((s, b) => s + b.passengers, 0),
        },
      ];
    })
  ) as Record<BusRoute, { buses: number; departed: number; enRoute: number; passengers: number }>;
  const all = Object.values(perRoute);
  return {
    perRoute,
    buses: buses.length,
    departed: all.reduce((s, r) => s + r.departed, 0),
    enRoute: all.reduce((s, r) => s + r.enRoute, 0),
    passengers: all.reduce((s, r) => s + r.passengers, 0),
  };
}

/** Oldest first (by date, then time) */
export const byReportTime = (a: WorshipReport, b: WorshipReport) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);

/** Latest report, the change from the one before, and the peak */
export function worshipSummary(reports: WorshipReport[]) {
  const sorted = [...reports].sort(byReportTime);
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.at(-2) ?? null;
  const peak = sorted.reduce<WorshipReport | null>((p, r) => (!p || r.count > p.count ? r : p), null);
  return { latest, change: latest && previous ? latest.count - previous.count : null, peak, count: sorted.length };
}

export const fmt = (v: number) => v.toLocaleString('he-IL');
