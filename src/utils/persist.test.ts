import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { arrayOf, clearStored, loadStored, nextIdNumber, oneOf, usePersistentState, withDefault } from './persist';

type Row = { id: string; n: number };
const isRows = arrayOf<Row>({ id: 'string', n: 'number' });
const put = (key: string, value: unknown) => localStorage.setItem(`tactical-ops:${key}`, JSON.stringify(value));

describe('loadStored', () => {
  it('returns saved data in the current envelope', () => {
    put('screen', { v: 1, data: [{ id: 'a', n: 1 }] });
    expect(loadStored('screen', isRows)).toEqual([{ id: 'a', n: 1 }]);
  });

  it('ignores missing, corrupt, wrong-version and wrong-shape data', () => {
    expect(loadStored('screen', isRows)).toBeUndefined();
    localStorage.setItem('tactical-ops:screen', '{broken');
    expect(loadStored('screen', isRows)).toBeUndefined();
    put('screen', { v: 99, data: [{ id: 'a', n: 1 }] });
    expect(loadStored('screen', isRows)).toBeUndefined();
    put('screen', { v: 1, data: [{ id: 'a', n: 'x' }] });
    expect(loadStored('screen', isRows)).toBeUndefined();
  });

  it('migrates older saves before validating them', () => {
    const isDated = arrayOf<{ id: string; date: string }>({ id: 'string', date: 'string' });
    put('audio', { v: 1, data: [{ id: 'L1' }, { id: 'L2', date: '2026-01-01' }] });
    expect(loadStored('audio', isDated)).toBeUndefined();
    expect(loadStored('audio', isDated, withDefault('date', () => '2026-09-26'))).toEqual([
      { id: 'L1', date: '2026-09-26' },
      { id: 'L2', date: '2026-01-01' },
    ]);
  });
});

describe('validators and ids', () => {
  it('arrayOf checks listed fields including arrays', () => {
    const isX = arrayOf<{ tags: string[] }>({ tags: 'array' });
    expect(isX([{ tags: [] }])).toBe(true);
    expect(isX([{ tags: 'a' }])).toBe(false);
    expect(isX({})).toBe(false);
  });

  it('oneOf accepts only listed values', () => {
    const isColor = oneOf(['red', 'blue'] as const);
    expect(isColor('red')).toBe(true);
    expect(isColor('green')).toBe(false);
    expect(isColor(1)).toBe(false);
  });

  it('nextIdNumber continues after the highest saved id', () => {
    expect(nextIdNumber(['INC-7241', 'INC-7300'], 7300)).toBe(7301);
    expect(nextIdNumber(['INC-7241'], 7300)).toBe(7300);
    expect(nextIdNumber([], 100)).toBe(100);
    expect(nextIdNumber(['MS-01', 'weird'], 1)).toBe(2);
  });
});

describe('usePersistentState', () => {
  it('starts from the initial value, saves changes, and restores them on the next mount', () => {
    const first = renderHook(() => usePersistentState('screen', () => [] as Row[], isRows));
    expect(first.result.current[0]).toEqual([]);
    act(() => first.result.current[1]([{ id: 'a', n: 2 }]));
    first.unmount();

    const second = renderHook(() => usePersistentState('screen', () => [] as Row[], isRows));
    expect(second.result.current[0]).toEqual([{ id: 'a', n: 2 }]);
  });

  it('reports a failed save but keeps working in memory', () => {
    const onError = vi.fn();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = renderHook(() => usePersistentState('screen', () => [] as Row[], isRows, onError));
    act(() => result.current[1]([{ id: 'b', n: 1 }]));
    expect(onError).toHaveBeenCalled();
    expect(result.current[0]).toEqual([{ id: 'b', n: 1 }]);
  });

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => usePersistentState('screen', () => [] as Row[], isRows));
    act(() => {
      put('screen', { v: 1, data: [{ id: 'other-tab', n: 1 }] });
      window.dispatchEvent(new StorageEvent('storage', { key: 'tactical-ops:screen', storageArea: localStorage }));
    });
    expect(result.current[0]).toEqual([{ id: 'other-tab', n: 1 }]);
  });

  it('falls back to the initial value when another tab clears storage', () => {
    put('screen', { v: 1, data: [{ id: 'saved', n: 1 }] });
    const { result } = renderHook(() => usePersistentState('screen', () => [] as Row[], isRows));
    expect(result.current[0]).toHaveLength(1);
    act(() => {
      clearStored();
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    });
    expect(result.current[0]).toEqual([]);
  });
});
