import { Milestone, MilestoneStatus } from '../types/tactical';
import { hhmm, parseHHMM, todayAt } from './time';

export const STATUS_BADGE: Record<MilestoneStatus, string> = {
  completed: 'הושלם בהצלחה',
  active: 'פעיל כעת',
  next: 'הבא בתור',
  scheduled: 'מתוכנן',
};

/** Start/end of a milestone as real Dates, on today's browser clock */
export const milestoneWindow = (m: Milestone, now: Date) => {
  const start = todayAt(m.scheduledTime, now);
  const end = new Date(start.getTime() + m.durationMin * 60_000);
  return { start, end };
};

export const endTime = (m: Milestone, now: Date) => hhmm(milestoneWindow(m, now).end);

/** 0-100, derived from the clock: completed = 100, active = elapsed share of its window, others = 0 */
export const milestoneProgress = (m: Milestone, now: Date) => {
  if (m.statusType === 'completed') return 100;
  if (m.statusType !== 'active') return 0;
  const { start, end } = milestoneWindow(m, now);
  const span = end.getTime() - start.getTime();
  if (span <= 0) return 100;
  return Math.round(Math.min(100, Math.max(0, ((now.getTime() - start.getTime()) / span) * 100)));
};

/** Seconds until the active phase ends and until the next phase starts (negative = overdue) */
export const phaseCountdowns = (milestones: Milestone[], now: Date) => {
  const active = milestones.find((m) => m.statusType === 'active');
  const next = milestones.find((m) => m.statusType === 'next');
  const secs = (d: Date) => Math.floor((d.getTime() - now.getTime()) / 1000);
  return {
    activeRemainingSec: active ? secs(milestoneWindow(active, now).end) : null,
    nextCountdownSec: next ? secs(milestoneWindow(next, now).start) : null,
  };
};

const byTime = (a: Milestone, b: Milestone) =>
  (parseHHMM(a.scheduledTime) ?? 0) - (parseHHMM(b.scheduledTime) ?? 0);

/**
 * Keeps the schedule consistent after any change: rows sorted by start time, exactly one
 * 'active' (the running one, or the first open row), the following open row 'next', the rest
 * 'scheduled'. Completed rows stay completed.
 */
export const normalizeMilestones = (list: Milestone[]): Milestone[] => {
  const sorted = [...list].sort(byTime);
  const open = sorted.filter((m) => m.statusType !== 'completed');
  const active = open.find((m) => m.statusType === 'active') ?? open[0];
  const upcoming = open.find((m) => m !== active);
  return sorted.map((m) => {
    const statusType: MilestoneStatus =
      m.statusType === 'completed' ? 'completed' : m === active ? 'active' : m === upcoming ? 'next' : 'scheduled';
    return { ...m, statusType, statusBadge: STATUS_BADGE[statusType] };
  });
};
