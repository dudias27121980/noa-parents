import { useState } from 'react';
import { ShieldAlert, Zap } from 'lucide-react';
import { ModalShell } from './ui';
import { SIM_SCENARIOS } from '../data/tacticalData';
import { playClick, playEmergencyAlarm } from '../utils/audio';

interface Props {
  onClose: () => void;
  onTriggerScenario: (name: string, description: string) => void;
  audioEnabled: boolean;
}

export function SimModal({ onClose, onTriggerScenario, audioEnabled }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const scenario = SIM_SCENARIOS.find((s) => s.id === selected);

  return (
    <ModalShell title="הפעלת תרגיל קיצון" icon={<ShieldAlert size={18} />} onClose={onClose} tone="amber">
      <p className="mb-3 text-xs text-slate-400">
        הפעלת תרגיל תעלה את רמת הכוננות לפע״מ, תפתח אירוע דרג 1 ותשדר הודעה לכלל הכוחות.
      </p>
      <div className="flex flex-col gap-2">
        {SIM_SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              if (audioEnabled) playClick();
              setSelected(s.id);
            }}
            className={`rounded border p-3 text-start transition ${
              selected === s.id ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-black/20 hover:border-slate-600'
            }`}
          >
            <div className="text-sm font-bold text-slate-100">{s.name}</div>
            <div className="mt-0.5 text-xs text-slate-400">{s.description}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
          ביטול
        </button>
        <button
          disabled={!scenario}
          onClick={() => {
            if (!scenario) return;
            if (audioEnabled) playEmergencyAlarm();
            onTriggerScenario(scenario.name, scenario.description);
            onClose();
          }}
          className="flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Zap size={14} /> הפעל תרגיל
        </button>
      </div>
    </ModalShell>
  );
}
