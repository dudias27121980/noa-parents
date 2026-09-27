import { describe, expect, it } from 'vitest';
import { busTotals, worshipSummary } from './buses';
import { BusTrip, WorshipReport } from '../types/tactical';

const bus = (route: BusTrip['route'], status: BusTrip['status'], passengers: number): BusTrip => ({
  id: `B-${Math.random()}`, number: '1', route, status, passengers, departure: '', note: '',
});
const report = (time: string, count: number, date = '2026-10-01'): WorshipReport => ({ id: time, date, time, count, note: '' });

describe('bus totals', () => {
  it('counts buses that departed out of all, and passengers per line and overall', () => {
    const t = busTotals([bus('jlm-ka', 'arrived', 50), bus('jlm-ka', 'waiting', 0), bus('ka-jlm', 'en-route', 30), bus('shuttle', 'en-route', 12)]);
    expect(t).toMatchObject({ buses: 4, departed: 3, enRoute: 2, passengers: 92 });
    expect(t.perRoute['jlm-ka']).toEqual({ buses: 2, departed: 1, enRoute: 0, passengers: 50 });
    expect(t.perRoute.shuttle.passengers).toBe(12);
  });
});

describe('worshipper summary', () => {
  it('latest by date and time (not by entry order), the change from the one before, and the peak', () => {
    const s = worshipSummary([report('10:00', 5000), report('09:00', 3000), report('11:00', 4500), report('23:00', 100, '2026-09-30')]);
    expect(s.latest?.time).toBe('11:00');
    expect(s.change).toBe(-500);
    expect(s.peak?.count).toBe(5000);
    expect(s.total).toBe(5000 + 3000 + 4500 + 100);
    expect(worshipSummary([])).toEqual({ latest: null, change: null, peak: null, count: 0, total: 0 });
  });
});
