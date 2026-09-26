import { describe, expect, it } from 'vitest';
import { Milestone, MilestoneStatus } from '../types/tactical';
import { milestoneProgress, normalizeMilestones, phaseCountdowns, windowLabel } from './schedule';
import { dateTimeAt } from './time';

const ms = (id: string, time: string, statusType: MilestoneStatus, extra: Partial<Milestone> = {}): Milestone => ({
  id,
  code: id,
  title: id,
  scheduledDate: '2026-09-26',
  scheduledTime: time,
  durationMin: 30,
  owner: '',
  description: '',
  statusType,
  statusBadge: '',
  tasks: [],
  ...extra,
});

const statuses = (list: Milestone[]) => list.map((m) => `${m.id}:${m.statusType}`);

describe('normalizeMilestones', () => {
  it('keeps exactly one active and one next, the rest scheduled', () => {
    const out = normalizeMilestones([
      ms('a', '08:00', 'completed'),
      ms('b', '09:00', 'scheduled'),
      ms('c', '10:00', 'scheduled'),
      ms('d', '11:00', 'scheduled'),
    ]);
    expect(statuses(out)).toEqual(['a:completed', 'b:active', 'c:next', 'd:scheduled']);
    expect(out[1].statusBadge).toBe('פעיל כעת');
  });

  it('completing the active phase promotes the next one', () => {
    const before = normalizeMilestones([ms('a', '08:00', 'active'), ms('b', '09:00', 'next'), ms('c', '10:00', 'scheduled')]);
    const after = normalizeMilestones(before.map((m) => (m.id === 'a' ? { ...m, statusType: 'completed' } : m)));
    expect(statuses(after)).toEqual(['a:completed', 'b:active', 'c:next']);
  });

  it('never leaves two active phases', () => {
    const out = normalizeMilestones([ms('a', '08:00', 'active'), ms('b', '09:00', 'active')]);
    expect(out.filter((m) => m.statusType === 'active')).toHaveLength(1);
  });

  it('sorts by date and then time, so a row on the next day comes last', () => {
    const out = normalizeMilestones([
      ms('tomorrow-early', '01:00', 'scheduled', { scheduledDate: '2026-09-27' }),
      ms('today-late', '23:00', 'scheduled'),
    ]);
    expect(out.map((m) => m.id)).toEqual(['today-late', 'tomorrow-early']);
  });

  it('keeps an explicitly running phase even if an earlier row is still open', () => {
    const out = normalizeMilestones([ms('a', '08:00', 'scheduled'), ms('b', '09:00', 'active')]);
    expect(statuses(out)).toEqual(['a:next', 'b:active']);
  });
});

describe('clock-derived values', () => {
  const now = dateTimeAt('2026-09-26', '09:15');

  it('progress follows the clock for the active phase only', () => {
    expect(milestoneProgress(ms('a', '09:00', 'active'), now)).toBe(50);
    expect(milestoneProgress(ms('a', '09:00', 'completed'), now)).toBe(100);
    expect(milestoneProgress(ms('a', '09:00', 'next'), now)).toBe(0);
    expect(milestoneProgress(ms('a', '07:00', 'active'), now)).toBe(100); // overdue caps at 100
  });

  it('counts down to active end and next start, negative when overdue', () => {
    const list = [ms('a', '09:00', 'active'), ms('b', '10:00', 'next')];
    expect(phaseCountdowns(list, now)).toEqual({ activeRemainingSec: 15 * 60, nextCountdownSec: 45 * 60 });

    const late = [ms('a', '08:00', 'active')];
    expect(phaseCountdowns(late, now)).toEqual({ activeRemainingSec: -45 * 60, nextCountdownSec: null });
  });

  it('shows the end date only when a row crosses midnight', () => {
    expect(windowLabel(ms('a', '09:00', 'active'))).toBe('26.09.26 · 09:00–09:30');
    expect(windowLabel(ms('a', '23:40', 'active', { durationMin: 40 }))).toBe('26.09.26 · 23:40–00:20 (27.09.26)');
  });
});
