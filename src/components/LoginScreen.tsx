import { FormEvent, useState } from 'react';
import { KeyRound, Shield } from 'lucide-react';
import { Session, lastStationName, login } from '../sync/session';
import { fieldClass } from './ui';

export function LoginScreen({ onLogin, message }: { onLogin: (s: Session) => void; message?: string | null }) {
  const [station, setStation] = useState(lastStationName);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [display, setDisplay] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!station.trim() || !code || busy) return;
    setBusy(true);
    setError(null);
    const res = await login(station.trim(), code, display);
    setBusy(false);
    if (res.ok) onLogin(res.session);
    else {
      setError(res.error);
      setCode('');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070d19] p-4 font-['Assistant',sans-serif] text-[#dae2fd]">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-md border border-cyan-900/60 bg-[#0b1426] p-6 shadow-2xl"
        aria-label="כניסת עמדה"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded border border-cyan-500/50 bg-cyan-500/10 p-2 text-cyan-300">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-100">חפ"ק מרחב יהודה</h1>
            <p className="text-xs text-slate-400">כניסת עמדה לתמונה המבצעית המשותפת</p>
          </div>
        </div>

        {message && <p className="mb-3 rounded border border-amber-400/50 bg-amber-400/10 p-2 text-xs text-amber-200">{message}</p>}

        <label className="mb-3 flex flex-col gap-1 text-xs text-slate-400">
          שם עמדה
          <input
            className={fieldClass()}
            value={station}
            onChange={(e) => setStation(e.target.value)}
            placeholder='לדוגמה: עמדה 1, קצין אג"מ'
            maxLength={30}
            autoFocus={!station}
            required
          />
        </label>
        <label className="mb-4 flex flex-col gap-1 text-xs text-slate-400">
          קוד גישה
          <input
            type="password"
            className={fieldClass(!!error)}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus={!!station}
            autoComplete="current-password"
            required
          />
        </label>

        <label className="mb-4 flex cursor-pointer items-start gap-2 rounded border border-slate-800 bg-black/20 p-2 text-xs text-slate-300">
          <input type="checkbox" className="mt-0.5 accent-cyan-500" checked={display} onChange={(e) => setDisplay(e.target.checked)} />
          <span>
            <span className="font-bold">עמדת תצוגה (מסך קיר)</span>
            <span className="block text-slate-500">קריאה בלבד, ונשארת מחוברת 30 יום בלי להתחבר מחדש</span>
          </span>
        </label>

        {error && (
          <p role="alert" className="mb-3 text-xs font-semibold text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !station.trim() || !code}
          className="flex w-full items-center justify-center gap-2 rounded bg-cyan-600 py-2 text-sm font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <KeyRound size={16} /> {busy ? 'מתחבר…' : 'כניסה'}
        </button>
      </form>
    </div>
  );
}
