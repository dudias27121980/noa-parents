import { ChangeEvent, useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { OfflineDump, isDump } from './browserDb';

const button = 'rounded border border-slate-700 p-1.5 text-slate-300 hover:bg-white/5';

// Latin letters: Chrome drops a Hebrew download name and saves the file as "download"
export const backupFileName = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `hq-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
};

/**
 * Export everything to a file, or restore from one. In the offline file the data lives only in this
 * browser, so this is the way to back it up or move it to another computer.
 */
export function BackupButtons({
  dump,
  restore,
  confirm = (text) => window.confirm(text),
  notify = (text) => window.alert(text),
}: {
  dump: () => OfflineDump;
  restore: (d: OfflineDump) => void;
  confirm?: (text: string) => boolean;
  notify?: (text: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump(), null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    // Chrome ignores the file name of a detached link opened from a file:// page
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      parsed = null;
    }
    if (!isDump(parsed)) {
      notify('הקובץ אינו גיבוי של לוח השליטה');
      return;
    }
    if (!confirm(`לשחזר את הגיבוי מ-${new Date(parsed.savedAt).toLocaleString('he-IL')}?\nכל הנתונים הנוכחיים יוחלפו.`)) return;
    restore(parsed);
  };

  return (
    <>
      <button onClick={exportBackup} className={button} aria-label="ייצוא גיבוי" title="ייצוא גיבוי לקובץ">
        <Download size={16} />
      </button>
      <button onClick={() => input.current?.click()} className={button} aria-label="שחזור מגיבוי" title="שחזור מגיבוי">
        <Upload size={16} />
      </button>
      <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={importBackup} data-testid="backup-file" />
    </>
  );
}
