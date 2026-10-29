import { describe, expect, it } from 'vitest';
import { radarLayout } from './radar';
import { TacticalUnit } from '../types/tactical';

const unit = (id: string, x: number, y: number, type: TacticalUnit['type'] = 'patrol', status: TacticalUnit['status'] = 'deployed'): TacticalUnit => ({
  id, callSign: id, type, status, commander: '', personnel: 1, sector: '', x, y, lastContact: '', signalStrength: 100,
});

describe('radar layout', () => {
  it('centres on the HQ and zooms so every nearby force fits inside the circle', () => {
    const r = radarLayout([unit('hq', 50, 50, 'command'), unit('a', 60, 50), unit('b', 50, 40)]);
    expect(r.hq?.id).toBe('hq');
    expect(r.blips.map((b) => b.unit.id)).toEqual(['a', 'b']);
    expect(r.blips.every((b) => !b.outOfRange)).toBe(true);
    // The farthest force sits at the margin, not on the rim
    const far = Math.max(...r.blips.map((b) => Math.hypot(b.left - 50, b.top - 50)));
    expect(far).toBeCloseTo(50 / 1.15, 5);
  });

  it('never zooms out past where the map fills the circle: forces beyond the range sit on the rim, in their direction', () => {
    const r = radarLayout([unit('hq', 50, 50, 'command'), unit('far-east', 99, 50), unit('near', 55, 50)]);
    // The image still covers the whole circle
    expect(r.image.left).toBeLessThanOrEqual(0);
    expect(r.image.top).toBeLessThanOrEqual(0);
    expect(r.image.left + r.image.width).toBeGreaterThanOrEqual(100);
    expect(r.image.top + r.image.height).toBeGreaterThanOrEqual(100);
    const east = r.blips.find((b) => b.unit.id === 'far-east')!;
    expect(east.outOfRange).toBe(true);
    expect(east.left).toBeCloseTo(50 + 50 * 0.9, 5);
    expect(east.top).toBeCloseTo(50, 5);
    expect(r.blips.find((b) => b.unit.id === 'near')!.outOfRange).toBe(false);
  });

  it('the map image under the dots is placed so the HQ is in the middle and directions are kept', () => {
    const r = radarLayout([unit('hq', 40, 60, 'command'), unit('east', 52, 60)]);
    // The HQ's point on the image lands on the centre of the radar
    expect(r.image.left + 0.4 * r.image.width).toBeCloseTo(50, 5);
    expect(r.image.top + 0.6 * r.image.height).toBeCloseTo(50, 5);
    // A force further along the map lands at the same place on the image
    const east = r.blips[0];
    expect(east.outOfRange).toBe(false);
    expect(r.image.left + 0.52 * r.image.width).toBeCloseTo(east.left, 5);
    expect(east.top).toBeCloseTo(50, 5);
  });

  it('without an HQ on the air it centres on the map; a lone force does not zoom in absurdly', () => {
    const r = radarLayout([unit('hq', 40, 60, 'command', 'offline'), unit('a', 51, 50)]);
    expect(r.hq).toBeNull();
    expect(r.blips).toHaveLength(2);
    expect(r.blips[1].left).toBeLessThan(55);
  });
});
