import React, { useState, useEffect } from 'react';
import { Plus, Search, Stethoscope, Phone, Mail, MapPin, X, Building2 } from 'lucide-react';
import { doctorsApi, businessLinesApi } from '../../api';
import { useAuth } from '../../context/AuthContext';

export default function RepDoctors() {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [businessLines, setBusinessLines] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', rut: '', medical_center: '', specialty: '', phone: '', email: '',
    address: '', notes: '', business_line_id: '',
  });

  const loadData = async () => {
    if (!user?.rep_id) return;
    try {
      const [docs, bls] = await Promise.all([
        doctorsApi.getAll({ rep_id: user.rep_id }),
        businessLinesApi.getAll(),
      ]);
      setDoctors(docs);
      setBusinessLines(bls);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadData(); }, [user?.rep_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await doctorsApi.create({
        ...form,
        business_line_id: form.business_line_id ? parseInt(form.business_line_id) : undefined,
        rep_id: user?.rep_id,
      });
      setShowForm(false);
      setForm({ name: '', rut: '', medical_center: '', specialty: '', phone: '', email: '', address: '', notes: '', business_line_id: '' });
      loadData();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const filtered = doctors.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.medical_center || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.rut || '').includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Médicos</h1>
          <p className="text-gray-500 text-sm mt-1">{doctors.length} médicos asignados</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo Médico
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, RUT o centro médico..." className="input pl-9 w-full" />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <Stethoscope size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No se encontraron médicos</p>
          </div>
        ) : filtered.map(doc => (
          <div key={doc.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                  {doc.rut && <span className="flex items-center gap-1">RUT: {doc.rut}</span>}
                  {doc.medical_center && <span className="flex items-center gap-1"><Building2 size={14} /> {doc.medical_center}</span>}
                  {doc.specialty && <span className="flex items-center gap-1"><Stethoscope size={14} /> {doc.specialty}</span>}
                  {doc.phone && <span className="flex items-center gap-1"><Phone size={14} /> {doc.phone}</span>}
                  {doc.email && <span className="flex items-center gap-1"><Mail size={14} /> {doc.email}</span>}
                  {doc.address && <span className="flex items-center gap-1"><MapPin size={14} /> {doc.address}</span>}
                </div>
              </div>
              {doc.business_line_name && (
                <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 flex-shrink-0">{doc.business_line_name}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Nuevo Médico</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input w-full" required placeholder="Dr. Juan Pérez" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">RUT</label>
                  <input value={form.rut} onChange={e => setForm({...form, rut: e.target.value})} className="input w-full" placeholder="12345678-9" />
                </div>
                <div>
                  <label className="label">Línea de Negocio</label>
                  <select value={form.business_line_id} onChange={e => setForm({...form, business_line_id: e.target.value})} className="input w-full">
                    <option value="">Seleccionar</option>
                    {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Centro Médico</label>
                <input value={form.medical_center} onChange={e => setForm({...form, medical_center: e.target.value})} className="input w-full" placeholder="Clínica Santa María" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Especialidad</label>
                  <input value={form.specialty} onChange={e => setForm({...form, specialty: e.target.value})} className="input w-full" placeholder="Dermatología" />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input w-full" placeholder="+56 9 1234 5678" />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input w-full" placeholder="doctor@email.com" />
              </div>
              <div>
                <label className="label">Dirección</label>
                <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input w-full" placeholder="Av. Providencia 1234" />
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input w-full" rows={2} placeholder="Observaciones adicionales..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Guardando...' : 'Crear Médico'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
