import { ReactNode, useEffect, useState } from 'react';
import { Activity, Radio, Satellite, Wifi } from 'lucide-react';
import { playClick, playRadioChirp } from '../utils/audio';

interface Props {
  audioEnabled: boolean;
  onSimulateTransmission: () => void;
  /** 4-digit frequency of the main command net */
  mainFrequency: string;
  onFrequencyChange: (frequency: string) => void;
}

const BARS = 24;

export function HudCenter({ audioEnabled, onSimulateTransmission, mainFrequency, onFrequencyChange }: Props) {
  // Fake live spectrum of the main radio net
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(20));
  useEffect(() => {
    const t = setInterval(() => {
      setLevels((prev) => prev.map(() => 10 + Math.random() * 90));
    }, 350);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="grid grid-cols-1 gap-3 rounded-md border border-cyan-900/60 bg-gradient-to-l from-[#0b1426] via-[#0d1a33] to-[#0b1426] p-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <HudStat icon={<Satellite size={14} />} label="GPS" value="12 לוויינים" ok />
        <HudStat icon={<Wifi size={14} />} label="רשת מוצפנת" value="SECURE-V4" ok />
        <HudStat icon={<Activity size={14} />} label="השהיית נתונים" value="120ms" ok />
      </div>

      <div className="flex h-10 items-end justify-center gap-[3px]" aria-hidden>
        {levels.map((h, i) => (
          <span
            key={i}
            className="w-1.5 rounded-sm bg-cyan-400/70 transition-[height] duration-300"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div className="flex items-center justify-start gap-3 md:justify-end">
        <FrequencyField
          value={mainFrequency}
          onChange={(f) => {
            if (audioEnabled) playClick();
            onFrequencyChange(f);
          }}
        />
        <button
          data-edit-control
          onClick={() => {
            if (audioEnabled) playRadioChirp();
            onSimulateTransmission();
          }}
          className="flex items-center gap-2 rounded border border-cyan-500/60 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20"
        >
          <Radio size={14} />
          שידור לכלל הכוחות
        </button>
      </div>
    </section>
  );
}

function HudStat({ icon, label, value, ok }: { icon: ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{icon}</span>
      <span className="text-slate-400">{label}:</span>
      <span className="font-semibold text-slate-200">{value}</span>
    </div>
  );
}

/** "רשת ראשית: תדר 1480" — double-click to edit; exactly 4 digits, Enter saves, Esc cancels */
function FrequencyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const valid = /^\d{4}$/.test(draft);

  const open = () => {
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    if (!valid) return;
    onChange(draft);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400">
      רשת ראשית: תדר
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
          className="flex items-center gap-1"
        >
          <input
            autoFocus
            inputMode="numeric"
            maxLength={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            onBlur={() => setEditing(false)}
            placeholder="____"
            aria-label="תדר (4 ספרות)"
            className={`w-16 rounded border bg-black/40 px-1.5 py-0.5 text-center font-mono text-sm tracking-[0.3em] text-cyan-200 outline-none ${
              valid ? 'border-cyan-500' : 'border-red-500'
            }`}
            dir="ltr"
          />
          <button
            type="submit"
            disabled={!valid}
            // mousedown fires before the input's blur closes the editor
            onMouseDown={(e) => e.preventDefault()}
            className="rounded bg-cyan-600 px-1.5 py-0.5 text-[11px] font-bold text-white disabled:opacity-40"
          >
            ✓
          </button>
        </form>
      ) : (
        <span
          onDoubleClick={open}
          title="לחיצה כפולה לשינוי תדר"
          className="cursor-default select-none rounded border border-transparent px-1 font-mono text-sm tracking-widest text-cyan-300 hover:border-cyan-800"
          dir="ltr"
        >
          {value}
        </span>
      )}
    </div>
  );
}
