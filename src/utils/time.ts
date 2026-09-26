const pad = (n: number) => String(n).padStart(2, '0');

/** HH:MM:SS for a wall-clock Date */
export const clockTime = (d: Date = new Date()) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** HH:MM for a wall-clock Date */
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** HH:MM:SS for a duration in seconds (absolute value; callers show the sign) */
export const formatDuration = (totalSeconds: number) => {
  const s = Math.abs(Math.trunc(totalSeconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** "HH:MM" -> minutes since midnight, or null when malformed */
export const parseHHMM = (value: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

/** Today's Date at "HH:MM" on the browser's local clock */
export const todayAt = (value: string, now: Date = new Date()) => {
  const d = new Date(now);
  const mins = parseHHMM(value) ?? 0;
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
};
