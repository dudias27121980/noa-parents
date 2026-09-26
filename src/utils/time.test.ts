import { describe, expect, it } from 'vitest';
import { dateTimeAt, formatDate, formatDuration, hhmm, isIsoDate, isoDate, parseHHMM } from './time';

describe('parseHHMM', () => {
  it('parses valid times to minutes since midnight', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('7:05')).toBe(425);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('rejects malformed or out-of-range values', () => {
    for (const bad of ['', '24:00', '12:60', '12', 'ab:cd', '12:5']) expect(parseHHMM(bad)).toBeNull();
  });
});

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isIsoDate('2026-09-26')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26.09.2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('formats in Israeli day.month.year order', () => {
    expect(formatDate('2026-09-26')).toBe('26.09.26');
  });

  it('round-trips local date and time', () => {
    const d = dateTimeAt('2026-09-26', '23:40');
    expect(isoDate(d)).toBe('2026-09-26');
    expect(hhmm(d)).toBe('23:40');
  });
});

describe('formatDuration', () => {
  it('formats seconds as HH:MM:SS and drops the sign (callers show it)', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(3723)).toBe('01:02:03');
    expect(formatDuration(-65)).toBe('00:01:05');
  });
});
