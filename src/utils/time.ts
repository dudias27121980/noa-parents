const pad = (n: number) => String(n).padStart(2, '0');

/** HH:MM:SS for a wall-clock Date */
export const clockTime = (d: Date = new Date()) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** HH:MM:SS for a duration in seconds */
export const formatDuration = (totalSeconds: number) => {
  const s = Math.max(0, totalSeconds);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** Short pseudo hash for the black-box audit trail (display only, not cryptographic). */
export const shortHash = () => {
  const part = () => Math.random().toString(16).substring(2, 6).padEnd(4, '0');
  return `${part()}...${part()}`;
};
