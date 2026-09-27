import { useState } from 'react';
import { ShieldAlert, Zap } from 'lucide-react';
import { SimScenario } from '../types/tactical';
import { ScenarioFields, ScenarioPatch } from '../shared/protocol';
import { changedFields } from '../shared/diff';
import { AddTile, DeleteButton, Field, InlineEditor, ModalShell, fieldClass } from './ui';
import { playClick, playEmergencyAlarm } from '../utils/audio';

interface Props {
  scenarios: SimScenario[];
  onClose: () => void;
  onTriggerScenario: (name: string, description: string) => void;
  onAddScenario: (fields: ScenarioFields) => void;
  onUpdateScenario: (id: string, patch: ScenarioPatch) => void;
  onDeleteScenario: (id: string) => void;
  audioEnabled: boolean;
}

const EMPTY: SimScenario = { id: 'draft', name: '', description: '' };

export function SimModal({
  scenarios,
  onClose,
  onTriggerScenario,
  onAddScenario,
  onUpdateScenario,
  onDeleteScenario,
  audioEnabled,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const busy = editingId !== null || adding;
  const scenario = scenarios.find((s) => s.id === selected);

  return (
    <ModalShell title="הפעלת תרגיל קיצון" icon={<ShieldAlert size={18} />} onClose={onClose} tone="amber">
      <p className="mb-3 text-xs text-slate-400">
        הפעלת תרגיל תעלה את רמת הכוננות לפע״מ, תפתח אירוע דרג 1 ותקפיץ התראה. לחיצה כפולה על תרחיש לעריכה.
      </p>
      <div className="flex flex-col gap-2">
        {scenarios.map((s) =>
          editingId === s.id ? (
            <ScenarioEditor
              key={s.id}
              scenario={s}
              onSave={(fields, base) => {
                const patch = changedFields(base, fields);
                if (Object.keys(patch).length) onUpdateScenario(s.id, patch);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              onDelete={() => {
                onDeleteScenario(s.id);
                if (selected === s.id) setSelected(null);
                setEditingId(null);
              }}
            />
          ) : (
            <button
              key={s.id}
              onClick={() => {
                if (audioEnabled) playClick();
                setSelected(s.id);
              }}
              onDoubleClick={() => !busy && setEditingId(s.id)}
              title="לחיצה כפולה לעריכה"
              className={`rounded border p-3 text-start transition ${
                selected === s.id ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-black/20 hover:border-slate-600'
              }`}
            >
              <div className="text-sm font-bold text-slate-100">{s.name}</div>
              {s.description && <div className="mt-0.5 text-xs text-slate-400">{s.description}</div>}
            </button>
          )
        )}
        {adding ? (
          <ScenarioEditor
            scenario={EMPTY}
            isNew
            onSave={(fields) => {
              onAddScenario(fields);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <AddTile label="הוספת תרחיש" disabled={busy} onClick={() => setAdding(true)} />
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
          ביטול
        </button>
        <button
          disabled={!scenario || busy}
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

function ScenarioEditor({
  scenario,
  isNew = false,
  onSave,
  onCancel,
  onDelete,
}: {
  scenario: SimScenario;
  isNew?: boolean;
  onSave: (fields: ScenarioFields, base: SimScenario) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [base] = useState(scenario);
  const [name, setName] = useState(scenario.name);
  const [description, setDescription] = useState(scenario.description);
  const invalid = !name.trim();

  return (
    <InlineEditor
      onSubmit={() => onSave({ name: name.trim(), description: description.trim() }, base)}
      onCancel={onCancel}
      invalid={invalid}
      className="grid-cols-1"
      extraActions={onDelete && !isNew ? <DeleteButton onConfirm={onDelete} question="למחוק את התרחיש?" /> : undefined}
    >
      <Field label="שם תרחיש *">
        <input className={fieldClass(invalid)} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} />
      </Field>
      <Field label="תיאור">
        <textarea className={fieldClass()} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
      </Field>
    </InlineEditor>
  );
}
