import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Briefcase } from 'lucide-react';
import Modal from '../../components/Modal';
import { businessLinesApi } from '../../api';
import type { BusinessLine } from '../../types';

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];

const empty: Partial<BusinessLine> = { name: '', description: '', color: '#3B82F6' };

export default function BusinessLines() {
  const [lines, setLines] = useState<BusinessLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessLine | null>(null);
  const [form, setForm] = useState<Partial<BusinessLine>>(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setLines(await businessLinesApi.getAll()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (line: BusinessLine) => {
    setEditing(line);
    setForm({ ...line });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await businessLinesApi.update(editing.id, form);
      } else {
        await businessLinesApi.create(form);
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (line: BusinessLine) => {
    if (!confirm(`¿Eliminar la línea "${line.name}"?`)) return;
    try {
      await businessLinesApi.delete(line.id);
      load();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Líneas de Negocio</h1>
          <p className="text-gray-500 text-sm mt-1">{lines.length} líneas configuradas</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva Línea
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lines.map(line => (
            <div key={line.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${line.color}20` }}
                  >
                    <Briefcase size={20} style={{ color: line.color }} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{line.name}</p>
                    <div
                      className="w-16 h-1.5 rounded-full mt-1"
                      style={{ backgroundColor: line.color }}
                    />
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(line)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(line)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {line.description && (
                <p className="text-sm text-gray-500 mb-3">{line.description}</p>
              )}

              <div className="flex items-center justify-between text-sm pt-3 border-t border-gray-100">
                <span className="text-gray-500">{line.doctor_count ?? 0} médicos</span>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: line.color }} />
                  <span className="text-gray-400 text-xs font-mono">{line.color}</span>
                </div>
              </div>
            </div>
          ))}

          {lines.length === 0 && (
            <div className="col-span-3 text-center py-12 text-gray-400">
              <Briefcase size={40} className="mx-auto mb-3 opacity-50" />
              <p>No hay líneas de negocio</p>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Línea' : 'Nueva Línea de Negocio'}>
        <div className="space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre de la línea" />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={2} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción opcional..." />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color || '#3B82F6'}
                onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-10 h-10 rounded-lg cursor-pointer border border-gray-300"
              />
              <div className="flex flex-wrap gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
