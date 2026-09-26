import { FileLock2 } from 'lucide-react';
import { BlackBoxEntry } from '../types/tactical';
import { ModalShell } from './ui';
import { LogTable } from './IncidentsScreen';

interface Props {
  logs: BlackBoxEntry[];
  onClose: () => void;
}

export function BlackBoxModal({ logs, onClose }: Props) {
  return (
    <ModalShell title="קופסה שחורה - יומן פעולות חתום" icon={<FileLock2 size={18} />} onClose={onClose} wide>
      <p className="mb-3 text-[11px] text-slate-500">
        {logs.length} רשומות · כל פעולה ברשת נרשמת עם חותמת זמן וחתימה.
      </p>
      <LogTable logs={logs} />
    </ModalShell>
  );
}
