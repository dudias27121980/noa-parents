import { ReactNode, useEffect, useState } from 'react';
import { Activity, Radio, Satellite, Wifi } from 'lucide-react';
import { playRadioChirp } from '../utils/audio';

interface Props {
  audioEnabled: boolean;
  onSimulateTransmission: () => void;
}

const BARS = 24;

export function HudCenter({ audioEnabled, onSimulateTransmission }: Props) {
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
        <div className="text-xs text-slate-400">
          רשת ראשית <span className="font-mono text-cyan-300">148.950MHz</span>
        </div>
        <button
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
