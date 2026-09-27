import { ParkingLot, ParkingStatus } from '../types/tactical';

/** Occupancy colours: green while empty, yellow from 50%, dark orange from 75%, red (with an alarm) from 90% */
export type OccupancyLevel = 'green' | 'yellow' | 'orange' | 'red';

export const occupancyLevel = (ratio: number): OccupancyLevel =>
  ratio >= 0.9 ? 'red' : ratio >= 0.75 ? 'orange' : ratio >= 0.5 ? 'yellow' : 'green';

/** Whole percent, rounded down: 89.6% shows as 89%, so the number never claims a colour it has not reached */
export const percent = (ratio: number) => Math.floor(ratio * 100 + 1e-9);

/** A lot's occupancy; null when no capacity was entered */
export const lotRatio = (lot: Pick<ParkingLot, 'capacity' | 'occupied'>): number | null =>
  lot.capacity > 0 ? lot.occupied / lot.capacity : null;

/** All lots together: open lots with a capacity (a closed lot offers no spaces) */
export function parkingTotals(lots: ParkingLot[]) {
  const counted = lots.filter((l) => l.status !== 'closed' && l.capacity > 0);
  const capacity = counted.reduce((s, l) => s + l.capacity, 0);
  const occupied = counted.reduce((s, l) => s + l.occupied, 0);
  return { counted: counted.length, capacity, occupied, free: capacity - occupied, ratio: capacity > 0 ? occupied / capacity : null };
}

/** The status that follows from the numbers (a closed lot stays closed) */
export const statusForOccupancy = (lot: Pick<ParkingLot, 'capacity' | 'occupied' | 'status'>): ParkingStatus => {
  if (lot.status === 'closed' || lot.capacity <= 0) return lot.status;
  const r = lot.occupied / lot.capacity;
  return r >= 1 ? 'full' : r >= 0.5 ? 'filling' : 'available';
};

export const LEVEL_STYLE: Record<OccupancyLevel, { bar: string; text: string; card: string }> = {
  green: { bar: 'bg-emerald-500', text: 'text-emerald-300', card: 'border-emerald-500/50 bg-emerald-500/5' },
  yellow: { bar: 'bg-yellow-400', text: 'text-yellow-300', card: 'border-yellow-400/60 bg-yellow-400/10' },
  orange: { bar: 'bg-orange-600', text: 'text-orange-400', card: 'border-orange-600/70 bg-orange-600/15' },
  red: { bar: 'bg-red-500', text: 'text-red-300', card: 'border-red-500/80 bg-red-500/15' },
};
