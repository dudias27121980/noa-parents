import { useState } from 'react';
import { Radio, Signal, Users } from 'lucide-react';
import { TacticalUnit, UnitStatus, UnitType } from '../types/tactical';
import { Field, InlineEditor, Panel, StatusDot, fieldClass } from './ui';
import { playClick, playRadioChirp } from '../utils/audio';
import { UNIT_STATUS, UNIT_TYPE_LABEL } from './TacticalMapScreen';

export type UnitPatch = Partial<Pick<TacticalUnit, 'callSign' | 'type' | 'status' | 'commander' | 'personnel' | 'sector'>>;

interface Props {
  units: TacticalUnit[];
  onPingUnit: (callSign: string) => void;
  onUpdateUnit: (id: string, patch: UnitPatch) => void;
  audioEnabled: boolean;
}

export function ForcesScreen({ units, onPingUnit, onUpdateUnit, audioEnabled }: Props) {
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Keep the row being edited visible even if its new status no longer matches the filter
  const visible = units.filter((u) => statusFilter === 'all' || u.status === statusFilter || u.id === editingId);
  const personnel = units.filter((u) => u.status !== 'offline').reduce((sum, u) => sum + u.personnel, 0);

  return (
    <Panel
      title="סד״כ כוחות בגזרה"
      icon={<Users size={16} />}
      actions={
        <span className="text-xs text-slate-400">
          <span className="font-mono text-emerald-300">{personnel}</span> לוחמים בקשר
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
        {(['all', 'deployed', 'en-route', 'standby', 'offline'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded px-2 py-1 font-semibold ${
              statusFilter === s ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s === 'all' ? `הכל (${units.length})` : `${UNIT_STATUS[s].label} (${units.filter((u) => u.status === s).length})`}
          </button>
        ))}
        <span className="ms-2 hidden text-[11px] text-slate-500 sm:inline">לחיצה כפולה על כוח לעריכה</span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {visible.map((u) => {
          const st = UNIT_STATUS[u.status];
          if (editingId === u.id) {
            return (
              <UnitEditor
                key={u.id}
                unit={u}
                takenCallSigns={units.filter((o) => o.id !== u.id).map((o) => o.callSign)}
                onSave={(patch) => {
                  if (audioEnabled) playClick();
                  onUpdateUnit(u.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            );
          }
          return (
            <div
              key={u.id}
              onDoubleClick={() => {
                if (editingId) return; // one editor at a time
                if (audioEnabled) playClick();
                setEditingId(u.id);
              }}
              title="לחיצה כפולה לעריכה"
              className="cursor-default select-none rounded border border-slate-800 bg-black/20 p-3 transition hover:border-cyan-700/70"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusDot color={st.color} pulse={u.status !== 'offline'} />
                  <span className="text-sm font-bold text-slate-100">{u.callSign}</span>
                  <span className="rounded bg-slate-800 px-1.5 text-[10px] text-slate-300">{UNIT_TYPE_LABEL[u.type]}</span>
                </div>
                <span className={`text-[11px] font-semibold ${st.text}`}>{st.label}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-[11px] text-slate-400">
                <span>מפקד: <span className="text-slate-200">{u.commander}</span></span>
                <span>לוחמים: <span className="font-mono text-slate-200">{u.personnel}</span></span>
                <span>גזרה: <span className="text-slate-200">{u.sector}</span></span>
                <span>קשר אחרון: <span className="font-mono text-slate-200">{u.lastContact}</span></span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Signal size={12} className="text-slate-500" />
                <div className="h-1 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className={`h-full ${u.signalStrength > 80 ? 'bg-emerald-400' : u.signalStrength > 40 ? 'bg-amber-400' : 'bg-red-500'}`}
                    style={{ width: `${u.signalStrength}%` }}
                  />
                </div>
                <button
                  onClick={() => {
                    if (audioEnabled) playRadioChirp();
                    onPingUnit(u.callSign);
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 rounded border border-cyan-600/60 px-2 py-1 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/15"
                >
                  <Radio size={12} /> קריאה
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function UnitEditor({
  unit,
  takenCallSigns,
  onSave,
  onCancel,
}: {
  unit: TacticalUnit;
  takenCallSigns: string[];
  onSave: (patch: UnitPatch) => void;
  onCancel: () => void;
}) {
  const [callSign, setCallSign] = useState(unit.callSign);
  const [type, setType] = useState<UnitType>(unit.type);
  const [status, setStatus] = useState<UnitStatus>(unit.status);
  const [commander, setCommander] = useState(unit.commander);
  const [personnel, setPersonnel] = useState(String(unit.personnel));
  const [sector, setSector] = useState(unit.sector);

  const personnelNum = Number(personnel);
  const callSignTaken = takenCallSigns.includes(callSign.trim());
  const errors = {
    callSign: !callSign.trim() || callSignTaken,
    personnel: !Number.isInteger(personnelNum) || personnelNum < 0 || personnelNum > 999,
  };
  const invalid = errors.callSign || errors.personnel;

  return (
    <InlineEditor
      onSubmit={() =>
        onSave({
          callSign: callSign.trim(),
          type,
          status,
          commander: commander.trim(),
          personnel: personnelNum,
          sector: sector.trim(),
        })
      }
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-2"
    >
      <Field label={callSignTaken ? 'אות קריאה * (תפוס)' : 'אות קריאה *'}>
        <input className={fieldClass(errors.callSign)} value={callSign} onChange={(e) => setCallSign(e.target.value)} autoFocus />
      </Field>
      <Field label="סוג">
        <select className={fieldClass()} value={type} onChange={(e) => setType(e.target.value as UnitType)}>
          {(Object.keys(UNIT_TYPE_LABEL) as UnitType[]).map((t) => (
            <option key={t} value={t} className="bg-[#0b1426]">
              {UNIT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="סטטוס">
        <select className={fieldClass()} value={status} onChange={(e) => setStatus(e.target.value as UnitStatus)}>
          {(Object.keys(UNIT_STATUS) as UnitStatus[]).map((st) => (
            <option key={st} value={st} className="bg-[#0b1426]">
              {UNIT_STATUS[st].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="לוחמים *">
        <input
          type="number"
          min={0}
          max={999}
          className={fieldClass(errors.personnel)}
          value={personnel}
          onChange={(e) => setPersonnel(e.target.value)}
          dir="ltr"
        />
      </Field>
      <Field label="מפקד">
        <input className={fieldClass()} value={commander} onChange={(e) => setCommander(e.target.value)} />
      </Field>
      <Field label="גזרה">
        <input className={fieldClass()} value={sector} onChange={(e) => setSector(e.target.value)} />
      </Field>
    </InlineEditor>
  );
}
