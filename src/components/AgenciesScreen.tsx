import { useState } from 'react';
import { Building2, Phone, Radio } from 'lucide-react';
import { Agency, AgencyStatus } from '../types/tactical';
import { Field, InlineEditor, Panel, StatusDot, fieldClass } from './ui';
import { playClick, playRadioChirp } from '../utils/audio';
import { AgencyPatch } from '../shared/protocol';
import { AGENCY_STATUS_LABEL } from '../shared/labels';
import { changedFields } from '../shared/diff';

export type { AgencyPatch };

interface Props {
  agencies: Agency[];
  onUpdateAgency: (id: string, patch: AgencyPatch) => void;
  onContactAgency: (agency: Agency) => void;
  audioEnabled: boolean;
}

export const AGENCY_STATUS: Record<AgencyStatus, { label: string; color: string; text: string }> = {
  connected: { label: AGENCY_STATUS_LABEL.connected, color: 'bg-emerald-400', text: 'text-emerald-300' },
  degraded: { label: AGENCY_STATUS_LABEL.degraded, color: 'bg-amber-400', text: 'text-amber-300' },
  disconnected: { label: AGENCY_STATUS_LABEL.disconnected, color: 'bg-red-500', text: 'text-red-300' },
};

export function AgenciesScreen({ agencies, onUpdateAgency, onContactAgency, audioEnabled }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const connected = agencies.filter((a) => a.status === 'connected').length;

  return (
    <Panel
      title="תיאום גורמי חוץ"
      icon={<Building2 size={16} />}
      actions={
        <span className="text-xs text-slate-400">
          <span className="hidden sm:inline">לחיצה כפולה על גורם לעריכה · </span>
          <span className="font-mono text-emerald-300">{connected}</span>/{agencies.length} מחוברים
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {agencies.map((a) => {
          if (editingId === a.id) {
            return (
              <AgencyEditor
                key={a.id}
                agency={a}
                onSave={(patch) => {
                  if (audioEnabled) playClick();
                  if (Object.keys(patch).length) onUpdateAgency(a.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            );
          }
          const st = AGENCY_STATUS[a.status];
          return (
            <div
              key={a.id}
              onDoubleClick={() => {
                if (editingId) return; // one editor at a time
                if (audioEnabled) playClick();
                setEditingId(a.id);
              }}
              title="לחיצה כפולה לעריכה"
              className="cursor-default select-none rounded border border-slate-800 bg-black/20 p-3 transition hover:border-cyan-700/70"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot color={st.color} pulse={a.status !== 'connected'} />
                  <span className="text-sm font-bold text-slate-100">{a.name}</span>
                </div>
                <span className={`text-[11px] font-semibold ${st.text}`}>{st.label}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{a.role}</div>
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-[11px] text-slate-400">
                <span>קישור: <span className="text-slate-200">{a.liaison || '—'}</span></span>
                <span>
                  {a.frequency ? (
                    <>
                      תדר: <span className="font-mono tracking-wider text-slate-200">{a.frequency}</span>
                    </>
                  ) : (
                    <>
                      טלפון:{' '}
                      <span className="font-mono text-slate-200" dir="ltr">
                        {a.phone || '—'}
                      </span>
                    </>
                  )}
                </span>
                <span className="col-span-2">סנכרון אחרון: <span className="font-mono text-slate-200">{a.lastSync}</span></span>
              </div>
              <button
                onClick={() => {
                  if (audioEnabled) playRadioChirp();
                  onContactAgency(a);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                disabled={a.status === 'disconnected'}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-cyan-700/60 py-1 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {a.frequency ? <Radio size={12} /> : <Phone size={12} />} יצירת קשר
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

type ContactMethod = 'radio' | 'phone';

function AgencyEditor({
  agency,
  onSave,
  onCancel,
}: {
  agency: Agency;
  /** Only the fields changed since the editor opened */
  onSave: (patch: AgencyPatch) => void;
  onCancel: () => void;
}) {
  // Snapshot at open: another station may change the agency meanwhile, and only our own edits are sent
  const [base] = useState(agency);
  const [name, setName] = useState(agency.name);
  const [role, setRole] = useState(agency.role);
  const [liaison, setLiaison] = useState(agency.liaison);
  const [status, setStatus] = useState<AgencyStatus>(agency.status);
  const [method, setMethod] = useState<ContactMethod>(agency.frequency ? 'radio' : 'phone');
  const [frequency, setFrequency] = useState(agency.frequency ?? '');
  const [phone, setPhone] = useState(agency.phone ?? '');

  const errors = {
    name: !name.trim(),
    frequency: method === 'radio' && !/^\d{4}$/.test(frequency),
    // digits with optional dashes/spaces/leading *, e.g. 02-6250000, *6000, 106
    phone: method === 'phone' && !/^\*?\d[\d\s-]{1,14}$/.test(phone.trim()),
  };
  const invalid = errors.name || errors.frequency || errors.phone;

  return (
    <InlineEditor
      onSubmit={() =>
        onSave(
          changedFields(base, {
            name: name.trim(),
            role: role.trim(),
            liaison: liaison.trim(),
            status,
            // Only the chosen contact method is kept, so the card never shows a stale one
            frequency: method === 'radio' ? frequency : null,
            phone: method === 'phone' ? phone.trim() : null,
          })
        )
      }
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-2"
    >
      <Field label="שם *">
        <input className={fieldClass(errors.name)} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="סטטוס">
        <select className={fieldClass()} value={status} onChange={(e) => setStatus(e.target.value as AgencyStatus)}>
          {(Object.keys(AGENCY_STATUS) as AgencyStatus[]).map((st) => (
            <option key={st} value={st} className="bg-[#0b1426]">
              {AGENCY_STATUS[st].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="תפקיד">
        <input className={fieldClass()} value={role} onChange={(e) => setRole(e.target.value)} />
      </Field>
      <Field label="איש קישור">
        <input className={fieldClass()} value={liaison} onChange={(e) => setLiaison(e.target.value)} />
      </Field>
      <Field label="אמצעי קשר">
        <select className={fieldClass()} value={method} onChange={(e) => setMethod(e.target.value as ContactMethod)}>
          <option value="radio" className="bg-[#0b1426]">קשר - תדר</option>
          <option value="phone" className="bg-[#0b1426]">טלפון</option>
        </select>
      </Field>
      {method === 'radio' ? (
        <Field label="תדר (4 ספרות) *">
          <input
            className={`${fieldClass(errors.frequency)} font-mono tracking-[0.3em]`}
            inputMode="numeric"
            maxLength={4}
            placeholder="____"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value.replace(/\D/g, '').slice(0, 4))}
            dir="ltr"
          />
        </Field>
      ) : (
        <Field label="מספר טלפון *">
          <input
            className={`${fieldClass(errors.phone)} font-mono`}
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
          />
        </Field>
      )}
    </InlineEditor>
  );
}
