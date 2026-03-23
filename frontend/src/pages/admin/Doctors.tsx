import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Stethoscope, Search, UserCheck } from 'lucide-react';
import Modal from '../../components/Modal';
import { doctorsApi, repsApi, businessLinesApi } from '../../api';
import type { Doctor, MedicalRep, BusinessLine } from '../../types';
import { format } from 'date-fns';

const emptyDoctor: Partial<Doctor> = {
  name: '', specialty: '', address: '', phone: '', email: '', notes: '',
  prescribes_products: '', visit_frequency: 30, is_active: true
};

export default function Doctors() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [reps, setReps] = useState<MedicalRep[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [form, setForm] = useState<Partial<Doctor>>(emptyDoctor);
  const [assignRepId, setAssignRepId] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ rep_id: '', business_line_id: '', search: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.rep_id) params.rep_id = parseInt(filters.rep_id);
      if (filters.business_line_id) params.business_line_id = parseInt(filters.business_line_id);
      if (filters.search) params.search = filters.search;
      const [d, r, bl] = await Promise.all([
        doctorsApi.getAll(params),
        repsApi.getAll(),
        businessLinesApi.getAll(),
      ]);
      setDoctors(d);
      setReps(r);
      setBusinessLines(bl);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyDoctor);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (doc: Doctor) => {
    setEditing(doc);
    setForm({ ...doc });
    setError('');
    setModalOpen(true);
  };

  const openAssign = (doc: Doctor) => {
    setSelectedDoctor(doc);
    setAssignRepId(doc.rep_id?.toString() || '');
    setAssignModal(true);
  };

  const handleSave = async () => {
    if (!form.name) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await doctorsApi.update(editing.id, form);
      } else {
        await doctorsApi.create(form);
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedDoctor || !assignRepId) return;
    try {
      await doctorsApi.assignRep(selectedDoctor.id, parseInt(assignRepId));
      setAssignModal(false);
      load();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al asignar');
    }
  };

  const handleDelete = async (doc: Doctor) => {
    if (!confirm(`¿Desactivar a ${doc.name}?`)) return;
    try {
      await doctorsApi.delete(doc.id);
      load();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Médicos</h1>
          <p className="text-gray-500 text-sm mt-1">{doctors.length} médicos encontrados</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo Médico
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar médico..."
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <select
            className="input"
            value={filters.rep_id}
            onChange={e => setFilters({ ...filters, rep_id: e.target.value })}
          >
            <option value="">Todos los visitadores</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select
            className="input"
            value={filters.business_line_id}
            onChange={e => setFilters({ ...filters, business_line_id: e.target.value })}
          >
            <option value="">Todas las líneas</option>
            {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Médico</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Especialidad</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Línea</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Visitador</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Frec. (días)</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Última Visita</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Ventas</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {doctors.map(doc => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{doc.name}</div>
                      {doc.phone && <div className="text-xs text-gray-400">{doc.phone}</div>}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{doc.specialty || '—'}</td>
                    <td className="py-3 px-4">
                      {doc.business_line_name ? (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          {doc.business_line_name}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{doc.rep_name || <span className="text-red-400 text-xs">Sin asignar</span>}</td>
                    <td className="py-3 px-4 text-gray-600 text-center">{doc.visit_frequency || 30}</td>
                    <td className="py-3 px-4 text-gray-500">
                      {doc.last_visit_date ? format(new Date(doc.last_visit_date), 'dd/MM/yy') : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {doc.has_sales ? (
                        <span className="badge-completed">Sí</span>
                      ) : (
                        <span className="badge-cancelled">No</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openAssign(doc)} title="Asignar visitador" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                          <UserCheck size={15} />
                        </button>
                        <button onClick={() => openEdit(doc)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => handleDelete(doc)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {doctors.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-gray-400">
                      <Stethoscope size={32} className="mx-auto mb-2 opacity-40" />
                      No se encontraron médicos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Médico' : 'Nuevo Médico'} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nombre completo *</label>
              <input className="input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Dr. Nombre Apellido" />
            </div>
            <div>
              <label className="label">Especialidad</label>
              <input className="input" value={form.specialty || ''} onChange={e => setForm({ ...form, specialty: e.target.value })} placeholder="Dermatología, Oncología..." />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="555-0000" />
            </div>
            <div className="col-span-2">
              <label className="label">Dirección</label>
              <input className="input" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Calle, Colonia, Ciudad" />
            </div>
            <div>
              <label className="label">Correo electrónico</label>
              <input className="input" type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="dr@hospital.com" />
            </div>
            <div>
              <label className="label">Frecuencia de visita (días)</label>
              <input className="input" type="number" value={form.visit_frequency || 30} onChange={e => setForm({ ...form, visit_frequency: parseInt(e.target.value) })} min="1" />
            </div>
            <div>
              <label className="label">Visitador asignado</label>
              <select className="input" value={form.rep_id || ''} onChange={e => setForm({ ...form, rep_id: e.target.value ? parseInt(e.target.value) : undefined })}>
                <option value="">Sin asignar</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Línea de negocio</label>
              <select className="input" value={form.business_line_id || ''} onChange={e => setForm({ ...form, business_line_id: e.target.value ? parseInt(e.target.value) : undefined })}>
                <option value="">Sin línea</option>
                {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Productos que prescribe</label>
              <input className="input" value={form.prescribes_products || ''} onChange={e => setForm({ ...form, prescribes_products: e.target.value })} placeholder="Producto A, Producto B..." />
            </div>
            <div className="col-span-2">
              <label className="label">Notas</label>
              <textarea className="input" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notas adicionales..." />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      {/* Assign rep modal */}
      <Modal isOpen={assignModal} onClose={() => setAssignModal(false)} title="Asignar Visitador" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Asignar visitador a: <span className="font-medium">{selectedDoctor?.name}</span></p>
          <div>
            <label className="label">Seleccionar Visitador</label>
            <select className="input" value={assignRepId} onChange={e => setAssignRepId(e.target.value)}>
              <option value="">Sin asignar</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setAssignModal(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleAssign} className="btn-primary flex-1">Asignar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
