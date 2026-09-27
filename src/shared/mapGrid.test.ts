import { describe, expect, it } from 'vitest';
import { gridRef } from './mapGrid';

describe('map grid', () => {
  it('letters columns from the right and numbers rows from the top', () => {
    expect(gridRef({ x: 99, y: 1 })).toBe('א-1');
    expect(gridRef({ x: 1, y: 99 })).toBe('י-6');
    expect(gridRef({ x: 36, y: 70 })).toBe('ז-5');
    // Edges stay inside the grid
    expect(gridRef({ x: 100, y: 100 })).toBe('א-6');
    expect(gridRef({ x: 0, y: 0 })).toBe('י-1');
  });
});
