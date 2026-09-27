import { MapPoint, TacticalUnit } from '../types/tactical';

/** The tactical map image's proportions: positions are percent of its width and height */
export const MAP_ASPECT = { w: 16, h: 9 };
/** Never zoom in closer than this (map units, where the map is 16 × 9) */
const MIN_RANGE = 1.5;
/** Room around the farthest force, so no dot sits on the rim */
const MARGIN = 1.15;
/** Where a force beyond the range is drawn: on the rim, in its direction (percent of the radius) */
export const RIM = 0.9;

/**
 * The radar as a round window on the tactical map: centred on the HQ (the first command force
 * that is on the air, else the centre of the map), zoomed so every force fits. Everything is in
 * percent of the radar's size, so the dots and the map image under them always agree.
 */
export function radarLayout(units: TacticalUnit[]) {
  const toMap = (p: MapPoint) => ({ x: (p.x / 100) * MAP_ASPECT.w, y: (p.y / 100) * MAP_ASPECT.h });
  const hqUnit = units.find((u) => u.type === 'command' && u.status !== 'offline') ?? null;
  const center = toMap(hqUnit ?? { x: 50, y: 50 });
  const needed = Math.max(MIN_RANGE, ...units.map((u) => Math.hypot(toMap(u).x - center.x, toMap(u).y - center.y) * MARGIN));
  // Beyond this the map image no longer fills the circle (it would show dark bands)
  const fillsCircle = Math.min(center.x, MAP_ASPECT.w - center.x, center.y, MAP_ASPECT.h - center.y);
  const range = Math.min(needed, Math.max(fillsCircle, MIN_RANGE));
  const toRadar = (p: MapPoint) => {
    const m = toMap(p);
    const dx = m.x - center.x;
    const dy = m.y - center.y;
    const d = Math.hypot(dx, dy);
    // Out of range: on the rim, in its direction
    const k = d / range > RIM ? (RIM * range) / d : 1;
    return { left: 50 + ((dx * k) / (2 * range)) * 100, top: 50 + ((dy * k) / (2 * range)) * 100, outOfRange: k < 1 };
  };
  // The map image, sized and shifted so the HQ sits in the middle
  const imgW = (MAP_ASPECT.w / (2 * range)) * 100;
  const imgH = (MAP_ASPECT.h / (2 * range)) * 100;
  return {
    hq: hqUnit,
    image: { width: imgW, height: imgH, left: 50 - (center.x / MAP_ASPECT.w) * imgW, top: 50 - (center.y / MAP_ASPECT.h) * imgH },
    blips: units.filter((u) => u !== hqUnit).map((u) => ({ unit: u, ...toRadar(u) })),
  };
}
