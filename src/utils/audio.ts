/**
 * Tiny WebAudio synth for UI feedback. No audio assets required.
 * All functions are no-ops when WebAudio is unavailable.
 */
let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

const tone = (
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.08
) => {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t0 = ac.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
};

/** Short UI click */
export const playClick = () => tone(1400, 0, 0.04, 'square', 0.03);

/** Radio squelch chirp — used for transmissions and unit pings */
export const playRadioChirp = () => {
  tone(1800, 0, 0.06, 'square', 0.04);
  tone(1200, 0.07, 0.08, 'square', 0.04);
};

/** Two-tone emergency alarm (~1.2s) */
export const playEmergencyAlarm = () => {
  for (let i = 0; i < 4; i++) {
    tone(880, i * 0.3, 0.14, 'sawtooth', 0.06);
    tone(660, i * 0.3 + 0.15, 0.14, 'sawtooth', 0.06);
  }
};

/** Ascending chime for completed tasks */
export const playCompleteChime = () => {
  tone(660, 0, 0.18, 'sine', 0.07);
  tone(880, 0.12, 0.18, 'sine', 0.07);
  tone(1320, 0.24, 0.3, 'sine', 0.07);
};
