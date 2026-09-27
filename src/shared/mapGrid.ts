import { MapPoint } from '../types/tactical';

/**
 * The tactical map's reference grid: columns lettered from the right (Hebrew reading order),
 * rows numbered from the top. "ג-4" is the third column from the right, fourth row down.
 */
export const GRID_COLS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י'] as const;
export const GRID_ROWS = 6;

const clampIndex = (i: number, n: number) => Math.min(n - 1, Math.max(0, i));

export function gridRef({ x, y }: MapPoint): string {
  const col = clampIndex(Math.floor(((100 - x) / 100) * GRID_COLS.length), GRID_COLS.length);
  const row = clampIndex(Math.floor((y / 100) * GRID_ROWS), GRID_ROWS);
  return `${GRID_COLS[col]}-${row + 1}`;
}
