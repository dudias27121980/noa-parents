import { AlertTriangle, Camera, Car } from 'lucide-react';
import { ModalShell } from './ui';

interface Props {
  onClose: () => void;
}

const HITS = [
  { time: '07:02:14', camera: 'LPR-60-12 צומת הגוש', plate: '12-345-67', vehicle: 'מאזדה 3 לבנה', reason: 'רשימת מעקב' },
  { time: '06:57:40', camera: 'LPR-60-09 כניסה צפונית', plate: '12-345-67', vehicle: 'מאזדה 3 לבנה', reason: 'רשימת מעקב' },
  { time: '06:41:03', camera: 'LPR-35-02 מחסום 300', plate: '89-012-34', vehicle: 'טנדר איסוזו כסוף', reason: 'רכב גנוב' },
];

// The alarm is played by the opener (on click), not on mount: a mount effect fires twice under
// StrictMode and replays whenever the audio toggle changes while the modal is open.
export function LprModal({ onClose }: Props) {
  return (
    <ModalShell title="התראות LPR - זיהוי לוחיות רישוי" icon={<AlertTriangle size={18} />} onClose={onClose} tone="red" wide>
      <div className="flex flex-col gap-2">
        {HITS.map((h, i) => (
          <div
            key={i}
            className={`flex flex-wrap items-center gap-3 rounded border p-3 text-xs ${
              i === 0 ? 'border-red-500/70 bg-red-500/10' : 'border-slate-800 bg-black/20'
            }`}
          >
            <div className="rounded border-2 border-yellow-400 bg-yellow-300 px-2 py-1 font-mono text-sm font-bold text-black" dir="ltr">
              {h.plate}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1 font-semibold text-slate-100">
                <Car size={12} /> {h.vehicle}
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <Camera size={12} /> {h.camera}
              </div>
            </div>
            <span className="rounded bg-red-500/20 px-2 py-0.5 font-bold text-red-200">{h.reason}</span>
            <span className="font-mono text-slate-400">{h.time}</span>
          </div>
        ))}
        <p className="mt-1 text-[11px] text-slate-500">נתוני הדגמה בלבד.</p>
      </div>
    </ModalShell>
  );
}
