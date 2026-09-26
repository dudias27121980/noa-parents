// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db';
import { createCore } from './core';

const NOW = new Date('2026-09-26T10:02:00+03:00');
const now = () => NOW;
const dirs: string[] = [];
const tempDb = () => {
  const dir = mkdtempSync(join(tmpdir(), 'tactical-'));
  dirs.push(dir);
  return join(dir, 'test.db');
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const memCore = () => createCore({ db: openDb(':memory:'), now });

describe('core', () => {
  it('seeds the demo data into an empty database', () => {
    const core = memCore();
    const s = core.getState();
    expect(s.milestones).toHaveLength(5);
    expect(s.milestones.filter((m) => m.statusType === 'active')).toHaveLength(1);
    expect(s.mainFrequency).toBe('1480');
  });

  it('keeps everything, and continues numbering, across a server restart', () => {
    const path = tempDb();
    const first = createCore({ db: openDb(path), now });
    const r1 = first.dispatch('עמדה 1', { type: 'incident.add', incident: { title: 'לפני אתחול' } });
    first.dispatch('עמדה 1', { type: 'frequency.set', frequency: '2750' });

    const second = createCore({ db: openDb(path), now });
    const s = second.getState();
    expect(s.incidents.some((i) => i.title === 'לפני אתחול')).toBe(true);
    expect(s.mainFrequency).toBe('2750');
    const r2 = second.dispatch('עמדה 2', { type: 'incident.add', incident: { title: 'אחרי אתחול' } });
    expect(r1.result.ok && r2.result.ok && r1.result.id !== r2.result.id).toBe(true);
    const logIds = second.getState().logs.map((l) => l.id);
    expect(new Set(logIds).size).toBe(logIds.length);
  });

  it('stamps log entries with the station and the server clock', () => {
    const core = memCore();
    const out = core.dispatch('קצין אג"מ', { type: 'shift.set', shift: { commanderName: 'סנ"צ לוי', shiftName: "ג'" } });
    const entry = out.patch!.logs![0];
    expect(entry).toMatchObject({ station: 'קצין אג"מ', date: '2026-09-26', timestamp: '10:02:00' });
  });

  it('rejects invalid input from a station', () => {
    const core = memCore();
    const bad = [
      { type: 'frequency.set', frequency: '123' },
      { type: 'milestone.update', id: 'MS-04', patch: { scheduledDate: '2026-02-30' } },
      { type: 'milestone.update', id: 'MS-04', patch: { title: '   ' } },
      { type: 'incident.update', id: 'INC-7238', patch: { tier: 7 } },
      { type: 'unit.update', id: 'U-02', patch: { personnel: -1 } },
      { type: 'incident.resolve', id: 'INC-0000' },
      { type: 'no.such.action' },
    ];
    bad.forEach((action) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = core.dispatch('עמדה', action as any);
      expect(out.result.ok, JSON.stringify(action)).toBe(false);
      expect(out.patch).toBeUndefined();
    });
  });

  it('applies only the fields that changed (no overwrite of other stations’ edits)', () => {
    const core = memCore();
    core.dispatch('א', { type: 'incident.update', id: 'INC-7238', patch: { title: 'כותרת מא' } });
    core.dispatch('ב', { type: 'incident.update', id: 'INC-7238', patch: { location: 'מיקום מב' } });
    expect(core.getState().incidents.find((i) => i.id === 'INC-7238')).toMatchObject({ title: 'כותרת מא', location: 'מיקום מב' });
  });

  it('rejects a duplicate call sign and carries a rename into incidents', () => {
    const core = memCore();
    expect(core.dispatch('א', { type: 'unit.update', id: 'U-02', patch: { callSign: 'סיור 14' } }).result).toEqual({
      ok: false,
      error: 'אות הקריאה תפוס',
    });
    core.dispatch('א', { type: 'unit.update', id: 'U-02', patch: { callSign: 'סיור 22' } });
    expect(core.getState().incidents.find((i) => i.id === 'INC-7241')!.assignedUnits).toContain('סיור 22');
  });

  it('an agency must keep a frequency or a phone number', () => {
    const core = memCore();
    const out = core.dispatch('א', { type: 'agency.update', id: 'AG-01', patch: { frequency: null } });
    expect(out.result).toEqual({ ok: false, error: 'נדרש תדר או מספר טלפון' });
  });

  it('raises a notice for urgent events only', () => {
    const core = memCore();
    expect(core.dispatch('א', { type: 'incident.add', incident: { title: 'שגרתי', tier: 3 } }).notice).toBeUndefined();
    expect(core.dispatch('א', { type: 'incident.add', incident: { title: 'דחוף', tier: 1 } }).notice).toEqual({
      level: 'critical',
      text: 'אירוע דחוף נפתח: דחוף',
    });
  });

  it('completing the active phase promotes the next one', () => {
    const core = memCore();
    const active = core.getState().milestones.find((m) => m.statusType === 'active')!;
    core.dispatch('א', { type: 'milestone.setStatus', id: active.id, status: 'completed' });
    expect(core.getState().milestones.map((m) => m.statusType)).toEqual(['completed', 'completed', 'completed', 'active', 'next']);
  });

  it('reset brings back the demo data and says who did it', () => {
    const core = memCore();
    core.dispatch('א', { type: 'frequency.set', frequency: '9999' });
    const out = core.dispatch('ב', { type: 'demo.reset' });
    expect(out.reset).toBe(true);
    expect(core.getState().mainFrequency).toBe('1480');
    expect(core.getState().logs[0]).toMatchObject({ station: 'ב', action: 'איפוס כל הנתונים לנתוני ההדגמה' });
  });

  it('telemetry tick moves only units in motion', () => {
    const core = memCore();
    const before = core.getState().units;
    const patch = core.tick(() => 1)!;
    const movedIds = patch.upsert!.units!.map((u) => u.id).sort();
    expect(movedIds).toEqual(before.filter((u) => u.status === 'en-route' || u.type === 'drone').map((u) => u.id).sort());
  });
});
