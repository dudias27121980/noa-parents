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

/** Local calendar date as "YYYY-MM-DD" (what <input type="date"> uses) */
export const isoDate = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isIsoDate = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
};

/** "YYYY-MM-DD" -> "DD.MM.YY" (Israeli order) */
export const formatDate = (value: string) => {
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}.${m}.${y.slice(2)}` : value;
};

/** Date at "YYYY-MM-DD" + "HH:MM" on the browser's local clock */
export const dateTimeAt = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const mins = parseHHMM(time) ?? 0;
  return new Date(y, (m || 1) - 1, d || 1, Math.floor(mins / 60), mins % 60, 0, 0);
};
