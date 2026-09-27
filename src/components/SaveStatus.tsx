import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, ChevronDown, HardDrive, HardDriveDownload } from 'lucide-react';
import { AutoSaver, sameData } from '../engine/autoSave';
import { OfflineDump } from '../engine/browserDb';
import { clockTime } from '../utils/time';

/**
 * The automatic file save, always visible in the top bar: green when the last change is in the
 * file, amber when nothing is being saved to a file (or the browser needs a click to continue),
 * red when a save failed. The menu chooses, changes or stops the file.
 */
export function SaveStatus({
  saver,
  current,
  restore,
  confirm = (text) => window.confirm(text),
  notify = (text) => window.alert(text),
}: {
  saver: AutoSaver;
  current: () => OfflineDump;
  restore: (d: OfflineDump) => void;
  confirm?: (text: string) => boolean;
  notify?: (text: string) => void;
}) {
  const state = useSyncExternalStore(saver.subscribe, saver.getState);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const continueFromExisting = async () => {
    setOpen(false);
    const r = await saver.openExistingFile();
    if (!r) return;
    if (r.error) return notify(r.error);
    if (r.dump && !sameData(r.dump, current())) {
      const when = new Date(r.dump.savedAt).toLocaleString('he-IL');
      if (confirm(`לטעון את הנתונים מקובץ השמירה (נשמר ${when})?\nהנתונים שפתוחים כרגע יוחלפו, והשמירה תמשיך לאותו קובץ.`)) restore(r.dump);
      else await saver.stop();
      return;
    }
    await saver.writeNow();
  };

  const chip = 'flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-bold whitespace-nowrap';
  let button;
  switch (state.kind) {
    case 'unsupported':
      return (
        <span className={`${chip} border-slate-700 text-slate-400`} title="שמירה אוטומטית לקובץ עובדת ב-Chrome וב-Edge. כאן: לגבות בכפתור ההורדה.">
          <HardDrive size={13} /> שמירה לקובץ: Chrome / Edge בלבד
        </span>
      );
    case 'needs-permission':
      return (
        <button
          type="button"
          onClick={() => void saver.grant()}
          className={`${chip} animate-pulse border-amber-400 bg-amber-400/15 text-amber-200`}
          title={`הדפדפן מבקש אישור להמשיך לשמור ל-${state.fileName}`}
        >
          <HardDrive size={13} /> לחץ להמשך שמירה לקובץ
        </button>
      );
    case 'off':
      button = (
        <>
          <HardDriveDownload size={13} /> שמירה לקובץ כבויה
        </>
      );
      break;
    case 'saved':
      button = (
        <>
          <HardDrive size={13} /> נשמר{state.at ? ` ${clockTime(state.at).slice(0, 5)}` : ''}
        </>
      );
      break;
    case 'error':
      button = (
        <>
          <AlertTriangle size={13} /> השמירה לקובץ נכשלה
        </>
      );
      break;
  }
  const tone =
    state.kind === 'saved'
      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
      : state.kind === 'error'
        ? 'animate-pulse border-red-500 bg-red-500/20 text-red-100'
        : 'animate-pulse border-amber-400 bg-amber-400/15 text-amber-200';
  const item = 'block w-full rounded px-2 py-1.5 text-start hover:bg-white/10';

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${chip} ${tone}`}
        title={state.kind === 'saved' ? `כל שינוי נשמר אוטומטית ל-${state.fileName}` : 'שמירה אוטומטית של כל השינויים לקובץ במחשב'}
      >
        {button}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-40 mt-1 w-64 rounded border border-slate-700 bg-[#0b1426] p-1 text-xs text-slate-200 shadow-2xl">
          {state.kind === 'saved' && (
            <p className="px-2 py-1 text-[11px] text-slate-400">
              שומר אוטומטית ל-<span className="font-mono text-slate-200">{state.fileName}</span>
            </p>
          )}
          {state.kind === 'error' && <p className="px-2 py-1 text-[11px] text-red-300">{state.message}</p>}
          {state.kind !== 'off' && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                void saver.writeNow();
              }}
            >
              שמירה עכשיו
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              void saver.chooseNewFile();
            }}
          >
            {state.kind === 'off' ? 'בחירת קובץ שמירה חדש…' : 'החלפה לקובץ שמירה חדש…'}
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => void continueFromExisting()}>
            המשך מקובץ שמירה קיים…
          </button>
          {state.kind !== 'off' && (
            <button
              role="menuitem"
              type="button"
              className={`${item} text-slate-400`}
              onClick={() => {
                setOpen(false);
                void saver.stop();
              }}
            >
              הפסקת השמירה לקובץ
            </button>
          )}
          {state.kind === 'off' && (
            <p className="px-2 pb-1 pt-2 text-[11px] leading-snug text-slate-400">
              בלי קובץ שמירה, הנתונים נמצאים רק בדפדפן: ניקוי היסטוריית הגלישה מוחק אותם.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
