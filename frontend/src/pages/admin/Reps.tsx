import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Users, MapPin } from 'lucide-react';
import Modal from '../../components/Modal';
import { repsApi } from '../../api';
import type { MedicalRep } from '../../types';

const emptyRep: Partial<MedicalRep> = {
  name: '', email: '', phone: '', territory: '', zone: '', is_active: true
};

export default function Reps() {
  const [reps, setReps] = useState<MedicalRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MedicalRep | null>(null);
  const [form, setForm] = useState<Partial<MedicalRep>>(emptyRep);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setReps(await repsApi.getAll());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyRep);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (rep: MedicalRep) => {
    setEditing(rep);
    setForm({ ...rep });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) {
      setError('Nombre y correo son requeridos');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await repsApi.update(editing.id, form);
      } else {
        await repsApi.create(form);
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rep: MedicalRep) => {
    const doctorCount = rep.doctor_count ?? 0;
    const msg = doctorCount > 0
      ? `¿Eliminar a ${rep.name}?\n\nEsto desasignará ${doctorCount} médico(s) y eliminará todas sus visitas programadas. Esta acción no se puede deshacer.`
      : `¿Eliminar a ${rep.name}? Esta acción no se puede deshacer.`;
    if (!confirm(msg)) return;
    try {
      const res = await repsApi.delete(rep.id);
      alert(res.message || 'Visitador eliminado');
      load();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visitadores Médicos</h1>
          <p className="text-gray-500 text-sm mt-1">{reps.length} visitadores registrados</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo Visitador
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reps.map(rep => (
            <div key={rep.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">
                      {rep.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{rep.name}</p>
                    <p className="text-xs text-gray-500">{rep.email}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(rep)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(rep)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {rep.phone && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <span>📞</span> {rep.phone}
                  </div>
                )}
                {(rep.territory || rep.zone) && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <MapPin size={14} />
                    {[rep.territory, rep.zone].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-500">
                  <Users size={14} />
                  <span>{rep.doctor_count ?? 0} médicos asignados</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${rep.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {rep.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          ))}

          {reps.length === 0 && (
            <div className="col-span-3 text-center py-12 text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-50" />
              <p>No hay visitadores registrados</p>
              <p className="text-sm">Crea el primero con el botón "Nuevo Visitador"</p>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Visitador' : 'Nuevo Visitador'}>
        <div className="space-y-4">
          <div>
            <label className="label">Nombre completo *</label>
            <input className="input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre del visitador" />
          </div>
          <div>
            <label className="label">Correo electrónico *</label>
            <input className="input" type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="correo@empresa.com" />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="555-0000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Territorio</label>
              <input className="input" value={form.territory || ''} onChange={e => setForm({ ...form, territory: e.target.value })} placeholder="Norte, Sur..." />
            </div>
            <div>
              <label className="label">Zona</label>
              <input className="input" value={form.zone || ''} onChange={e => setForm({ ...form, zone: e.target.value })} placeholder="CDMX, GDL..." />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={form.is_active ?? true} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
            <label htmlFor="is_active" className="text-sm text-gray-700">Activo</label>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
