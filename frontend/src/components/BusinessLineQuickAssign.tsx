import { useState } from 'react';
import { doctorsApi } from '../api';
import type { BusinessLine, Doctor } from '../types';

/** Selector para asignar la línea de negocio a un médico sin línea, directo desde la lista. */
export default function BusinessLineQuickAssign({ doctor, businessLines, onSaved, size = 'sm' }: {
  doctor: { id: number };
  businessLines: BusinessLine[];
  onSaved: (updated: Doctor) => void;
  size?: 'sm' | 'xs';
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const assign = async (value: string) => {
    if (!value) return;
    setSaving(true); setError(false);
    try {
      const updated = await doctorsApi.update(doctor.id, { business_line_id: parseInt(value) });
      onSaved(updated);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <select
        value=""
        disabled={saving}
        onChange={e => assign(e.target.value)}
        className={`border rounded-lg bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60 cursor-pointer ${
          size === 'xs' ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
        }`}
        title="Asignar línea de negocio"
      >
        <option value="">{saving ? 'Guardando…' : '+ Asignar línea'}</option>
        {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
      </select>
      {error && <span className="text-[11px] text-red-500">Error</span>}
    </span>
  );
}
