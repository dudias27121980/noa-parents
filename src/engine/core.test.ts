import { describe, expect, it } from 'vitest';
import { openBrowserDb } from './browserDb';
import { createCore } from './core';
import { clockTime } from '../utils/time';
import { memoryStorage } from '../test/memoryStorage';
import { DEFAULT_HQ_NAME, PREVIOUS_DEFAULT_HQ_NAME } from '../data/tacticalData';

const NOW = new Date('2026-09-26T10:02:00+03:00');
const now = () => NOW;
/** Storage that outlives a core: open it again to simulate closing and reopening the file */
const tempDb = () => memoryStorage();
const openDb = (storage: Storage | ':memory:') => openBrowserDb(storage === ':memory:' ? memoryStorage() : storage);

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

  it('tasks: add, tick off, rename and delete — each logged', () => {
    const core = memCore();
    const add = core.dispatch('א', { type: 'task.add', milestoneId: 'MS-04', text: 'בדיקת קשר' });
    const taskId = add.result.ok ? add.result.id! : '';
    expect(taskId).toMatch(/^MS-04-T\d+$/);
    core.dispatch('א', { type: 'task.update', milestoneId: 'MS-04', taskId, patch: { done: true } });
    core.dispatch('א', { type: 'task.update', milestoneId: 'MS-04', taskId, patch: { text: 'בדיקת קשר מול יס"מ' } });
    const ms = () => core.getState().milestones.find((m) => m.id === 'MS-04')!;
    expect(ms().tasks.find((t) => t.id === taskId)).toMatchObject({ text: 'בדיקת קשר מול יס"מ', done: true });
    expect(core.getState().logs.slice(0, 3).map((l) => l.action)).toEqual([
      'עריכת משימה ב-H+45: בדיקת קשר מול יס"מ',
      'H+45: "בדיקת קשר" בוצעה',
      'משימה נוספה ל-H+45 "החלפת כוחות וריענון": בדיקת קשר',
    ]);
    core.dispatch('א', { type: 'task.delete', milestoneId: 'MS-04', taskId });
    expect(ms().tasks.some((t) => t.id === taskId)).toBe(false);
    expect(core.dispatch('א', { type: 'task.add', milestoneId: 'MS-04', text: '  ' }).result.ok).toBe(false);
  });

  it('forces: add, move on the map (not logged), delete; ids are never reused', () => {
    const core = memCore();
    const fields = { callSign: 'סיור 50', type: 'patrol' as const, status: 'standby' as const, commander: 'x', personnel: 3, sector: 'y' };
    expect(core.dispatch('א', { type: 'unit.add', fields: { ...fields, callSign: 'סיור 14' } }).result).toEqual({ ok: false, error: 'אות הקריאה תפוס' });
    const first = core.dispatch('א', { type: 'unit.add', fields });
    const id = first.result.ok ? first.result.id! : '';

    const logsBefore = core.getState().logs.length;
    const moved = core.dispatch('א', { type: 'unit.update', id, patch: { x: 12.34, y: 80 } });
    expect(moved.patch?.logs).toBeUndefined();
    expect(core.getState().logs).toHaveLength(logsBefore);
    expect(core.getState().units.find((u) => u.id === id)).toMatchObject({ x: 12.3, y: 80 });
    expect(core.dispatch('א', { type: 'unit.update', id, patch: { x: 140 } }).result.ok).toBe(false);

    core.dispatch('א', { type: 'unit.delete', id });
    expect(core.getState().units.some((u) => u.id === id)).toBe(false);
    const again = core.dispatch('א', { type: 'unit.add', fields });
    expect(again.result.ok && again.result.id).not.toBe(id);
  });

  it('agencies: add needs a frequency or phone; delete', () => {
    const core = memCore();
    const base = { name: 'משטרת התנועה', role: 'תנועה', liaison: 'קצין', status: 'connected' as const };
    expect(core.dispatch('א', { type: 'agency.add', fields: { ...base, frequency: null, phone: null } }).result.ok).toBe(false);
    const r = core.dispatch('א', { type: 'agency.add', fields: { ...base, frequency: '2233', phone: null } });
    const id = r.result.ok ? r.result.id! : '';
    expect(core.getState().agencies.find((a) => a.id === id)).toMatchObject({ name: 'משטרת התנועה', frequency: '2233' });
    core.dispatch('א', { type: 'agency.delete', id });
    expect(core.getState().agencies.some((a) => a.id === id)).toBe(false);
  });

  it('parking: the seven lots are there; full or closed alerts the other stations; numbers are checked', () => {
    const core = memCore();
    expect(core.getState().parkingLots.map((p) => p.name)).toEqual([
      'יתק"א עליון',
      'יתק"א תחתון',
      'מנחת',
      'מאוחדת',
      'אלייקים',
      'חשוף עליון',
      'עיריה',
    ]);
    expect(core.getState().parkingLots.every((p) => p.status === 'available')).toBe(true);

    const full = core.dispatch('א', { type: 'parking.update', id: 'P-3', patch: { status: 'full', note: 'שמור למסוקים' } });
    expect(full.notice).toEqual({ level: 'info', text: 'חניון מנחת מלא: שמור למסוקים' });
    expect(full.patch!.logs![0]).toMatchObject({ severity: 'WARNING', action: 'מנחת: פנוי ← מלא (שמור למסוקים)', station: 'א' });
    expect(core.getState().parkingLots.find((p) => p.id === 'P-3')!.updated).toBe(clockTime(NOW));
    // Back to available: logged, no alert
    expect(core.dispatch('א', { type: 'parking.update', id: 'P-3', patch: { status: 'available' } }).notice).toBeUndefined();

    // Capacity and occupancy
    expect(core.dispatch('א', { type: 'parking.update', id: 'P-4', patch: { capacity: 40, occupied: 12 } }).result.ok).toBe(true);
    const over = core.dispatch('א', { type: 'parking.update', id: 'P-4', patch: { occupied: 41 } });
    expect(over.result).toEqual({ ok: false, error: 'תפוסה (41) גדולה מהקיבולת (40)' });
    expect(core.getState().parkingLots.find((p) => p.id === 'P-4')!.occupied).toBe(12);
    expect(core.dispatch('א', { type: 'parking.update', id: 'P-4', patch: { capacity: -1 } }).result.ok).toBe(false);
    expect(core.dispatch('א', { type: 'parking.update', id: 'P-4', patch: { status: 'half' as never } }).result.ok).toBe(false);

    // The numbers set the status: 30 of 40 is "filling", 40 of 40 is "full" (and alerts); an explicit close wins
    const filling = core.dispatch('א', { type: 'parking.update', id: 'P-4', patch: { occupied: 30 } });
    expect(core.getState().parkingLots.find((p) => p.id === 'P-4')!.status).toBe('filling');
    expect(filling.patch!.logs![0].action).toBe('מאוחדת: פנוי ← מתמלא - 30/40 (75%)');
    const occ = core.dispatch('א', { type: 'parking.update', id: 'P-4', patch: { occupied: 31 } });
    expect(occ.patch!.logs![0].action).toBe('תפוסת מאוחדת - 31/40 (77%)');
    expect(occ.notice).toBeUndefined();
    const full40 = core.dispatch('א', { type: 'parking.update', id: 'P-4', patch: { occupied: 40 } });
    expect(core.getState().parkingLots.find((p) => p.id === 'P-4')!.status).toBe('full');
    expect(full40.notice).toEqual({ level: 'info', text: 'חניון מאוחדת מלא' });
    core.dispatch('א', { type: 'parking.update', id: 'P-4', patch: { status: 'closed', occupied: 5 } });
    expect(core.getState().parkingLots.find((p) => p.id === 'P-4')!.status).toBe('closed');

    // Add, unique names, delete
    const base = { status: 'available' as const, capacity: 0, occupied: 0, note: '' };
    expect(core.dispatch('א', { type: 'parking.add', fields: { ...base, name: 'מנחת' } }).result).toEqual({ ok: false, error: 'חניון בשם הזה כבר קיים' });
    const added = core.dispatch('א', { type: 'parking.add', fields: { ...base, name: 'חניון מערבי', capacity: 100, occupied: 60 } });
    const id = added.result.ok ? added.result.id! : '';
    expect(id).toBe('P-8');
    expect(core.getState().parkingLots.find((p) => p.id === id)).toMatchObject({ status: 'filling', capacity: 100, occupied: 60 });
    expect(added.patch!.logs![0].action).toBe('חניון נוסף: חניון מערבי - 60/100 (60%)');
    expect(core.dispatch('א', { type: 'parking.add', fields: { ...base, name: 'עמוס', capacity: 10, occupied: 11 } }).result.ok).toBe(false);
    core.dispatch('א', { type: 'parking.delete', id });
    expect(core.getState().parkingLots.some((p) => p.id === id)).toBe(false);
  });

  it('routes: unique names; closing a route alerts the other stations', () => {
    const core = memCore();
    expect(core.dispatch('א', { type: 'route.add', fields: { name: 'ציר 60', status: 'open', note: '' } }).result.ok).toBe(false);
    const out = core.dispatch('א', { type: 'route.update', id: 'R-60', patch: { status: 'closed', note: 'חפץ חשוד' } });
    expect(out.notice).toEqual({ level: 'info', text: 'ציר 60 נסגר: חפץ חשוד' });
    expect(out.patch!.logs![0].action).toBe('ציר 60: פתוח ← סגור (חפץ חשוד)');
  });

  it('drill scenarios and the HQ name are editable', () => {
    const core = memCore();
    const r = core.dispatch('א', { type: 'scenario.add', fields: { name: 'שריפה במחסן', description: '' } });
    const id = r.result.ok ? r.result.id! : '';
    core.dispatch('א', { type: 'scenario.update', id, patch: { description: 'פינוי ובידוד' } });
    expect(core.getState().scenarios.find((sc) => sc.id === id)).toMatchObject({ name: 'שריפה במחסן', description: 'פינוי ובידוד' });
    core.dispatch('א', { type: 'scenario.delete', id });
    expect(core.getState().scenarios.some((sc) => sc.id === id)).toBe(false);

    core.dispatch('א', { type: 'hqName.set', name: 'חפ"ק מרחב בנימין' });
    expect(core.getState().hqName).toBe('חפ"ק מרחב בנימין');
    expect(core.dispatch('א', { type: 'hqName.set', name: ' ' }).result.ok).toBe(false);
  });

  it('schema 4: an untouched old HQ name becomes the new title; a name the HQ chose is kept', () => {
    for (const [stored, expected] of [
      [PREVIOUS_DEFAULT_HQ_NAME, DEFAULT_HQ_NAME],
      ['חפ"ק מרחב בנימין', 'חפ"ק מרחב בנימין'],
    ]) {
      const storage = tempDb();
      const v3 = openDb(storage);
      createCore({ db: v3, now });
      v3.setSingleton('hqName', stored);
      v3.setSingleton('schemaVersion', 3);
      expect(createCore({ db: openDb(storage), now }).getState().hqName).toBe(expected);
    }
  });

  it('upgrades a database from the previous version without losing what was entered', () => {
    const path = tempDb();
    // Build a version-1 database: tasks as plain strings, none of the new collections, no HQ name
    const v1 = openDb(path);
    createCore({ db: v1, now });
    const oldMilestones = createCore({ db: openDb(':memory:'), now })
      .getState()
      .milestones.map((m) => ({ ...m, title: m.id === 'MS-04' ? 'נערך לפני השדרוג' : m.title, tasks: m.tasks.map((t) => t.text) }));
    v1.replaceCollection('milestones', oldMilestones as never);
    (['parkingLots', 'routes', 'scenarios'] as const).forEach((c) => v1.replaceCollection(c, []));
    // A retired collection (the LPR alerts of schema 2) left in the file must not break loading
    v1.upsert('lprHits' as never, [{ id: 'LPR-1', plate: '12-345-67' } as { id: string }]);
    v1.setSingleton('hqName', '');
    v1.setSingleton('schemaVersion', 1);
    v1.close();

    const upgraded = createCore({ db: openDb(path), now }).getState();
    const ms04 = upgraded.milestones.find((m) => m.id === 'MS-04')!;
    expect(ms04.title).toBe('נערך לפני השדרוג');
    expect(ms04.tasks[0]).toEqual({ id: 'MS-04-T1', text: 'תיאום זמני החלפה', done: false });
    expect(upgraded.milestones.find((m) => m.id === 'MS-01')!.tasks.every((t) => t.done)).toBe(true);
    expect(upgraded.parkingLots.map((p) => p.name)).toContain('מנחת');
    expect('lprHits' in upgraded).toBe(false);
    expect(upgraded.routes.length).toBeGreaterThan(0);
    expect(upgraded.hqName).toBe(DEFAULT_HQ_NAME);

    // And it stays upgraded: a second start does not re-seed collections the stations emptied
    const again = openDb(path);
    again.replaceCollection('parkingLots', []);
    again.close();
    expect(createCore({ db: openDb(path), now }).getState().parkingLots).toEqual([]);
  });
});
