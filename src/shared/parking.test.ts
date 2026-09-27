import { describe, expect, it } from 'vitest';
import { lotRatio, occupancyLevel, parkingTotals, percent, statusForOccupancy } from './parking';
import { ParkingLot } from '../types/tactical';

const lot = (capacity: number, occupied: number, status: ParkingLot['status'] = 'available'): ParkingLot => ({
  id: 'P', name: 'x', status, capacity, occupied, note: '', updated: '',
});

describe('parking occupancy', () => {
  it('colours: green while under half, yellow from 50%, dark orange from 75%, red from 90%', () => {
    expect([0, 0.49, 0.5, 0.74, 0.75, 0.89, 0.9, 1].map(occupancyLevel)).toEqual([
      'green', 'green', 'yellow', 'yellow', 'orange', 'orange', 'red', 'red',
    ]);
  });

  it('shows the percent rounded down, so the number never claims a colour it has not reached', () => {
    expect(percent(179 / 200)).toBe(89); // 89.5%: still orange
    expect(percent(0.9)).toBe(90);
    expect(percent(7 / 10)).toBe(70);
    expect(lotRatio(lot(0, 0))).toBeNull();
  });

  it('adds up the open lots with a capacity; a closed lot offers no spaces', () => {
    const t = parkingTotals([lot(100, 50), lot(50, 50), lot(40, 10, 'closed'), lot(0, 0)]);
    expect(t).toEqual({ counted: 2, capacity: 150, occupied: 100, free: 50, ratio: 100 / 150 });
    expect(parkingTotals([lot(0, 0)]).ratio).toBeNull();
  });

  it('the numbers set the status; a closed lot stays closed', () => {
    expect(statusForOccupancy(lot(40, 10))).toBe('available');
    expect(statusForOccupancy(lot(40, 20))).toBe('filling');
    expect(statusForOccupancy(lot(40, 40))).toBe('full');
    expect(statusForOccupancy(lot(40, 40, 'closed'))).toBe('closed');
    expect(statusForOccupancy(lot(0, 0, 'full'))).toBe('full');
  });
});
