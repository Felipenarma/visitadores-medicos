import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Stethoscope, Search, UserCheck, BarChart2, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import Modal from '../../components/Modal';
import { doctorsApi, repsApi, businessLinesApi, dashboardApi } from '../../api';
import type { Doctor, MedicalRep, BusinessLine } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type SalesByDoctorItem = {
  doctor_name: string; rut: string; rep_name: string;
  units_current: number; units_prev: number;
  amount_current: number; amount_prev: number;
};

type NewDoctorItem = {
  rut_doctor: string; doctor_name: string; specialty: string | null;
  primera_venta: string | null; rep_name: string | null;
  productos: string[]; total_amount: number;
};

const emptyDoctor: Partial<Doctor> = {
  name: '', rut: '', medical_center: '', specialty: '', city: '', commune: '', address: '', phone: '', email: '', notes: '',
  prescribes_products: '', visit_frequency: 30, is_active: true
};

export default function Doctors() {
  const [activeTab, setActiveTab] = useState<'lista' | 'analitica'>('lista');

  // Lista state
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

  // Analítica state
  const [salesMonth, setSalesMonth] = useState(new Date().getMonth() + 1);
  const [salesYear, setSalesYear] = useState(new Date().getFullYear());
  const [salesByDoctor, setSalesByDoctor] = useState<SalesByDoctorItem[]>([]);
  const [newDoctors, setNewDoctors] = useState<NewDoctorItem[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { is_active: true };
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

  const loadSalesData = async () => {
    setLoadingSales(true);
    try {
      const [sd, nd] = await Promise.all([
        dashboardApi.getSalesByDoctor(salesMonth, salesYear),
        dashboardApi.getNewDoctors(salesMonth, salesYear),
      ]);
      setSalesByDoctor(sd);
      setNewDoctors(nd);
    } catch (e) { console.error(e); }
    finally { setLoadingSales(false); }
  };

  useEffect(() => { load(); }, [filters]);
  useEffect(() => { if (activeTab === 'analitica') loadSalesData(); }, [salesMonth, salesYear, activeTab]);

  const prevMonthLabel = () => MONTH_NAMES[salesMonth === 1 ? 11 : salesMonth - 2];
  const prevSalesMonth = () => { if (salesMonth === 1) { setSalesMonth(12); setSalesYear(y => y - 1); } else setSalesMonth(m => m - 1); };
  const nextSalesMonth = () => { if (salesMonth === 12) { setSalesMonth(1); setSalesYear(y => y + 1); } else setSalesMonth(m => m + 1); };

  const openCreate = () => { setEditing(null); setForm(emptyDoctor); setError(''); setModalOpen(true); };
  const openEdit = (doc: Doctor) => { setEditing(doc); setForm({ ...doc }); setError(''); setModalOpen(true); };
  const openAssign = (doc: Doctor) => { setSelectedDoctor(doc); setAssignRepId(doc.rep_id?.toString() || ''); setAssignModal(true); };

  const handleSave = async () => {
    if (!form.name) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try {
      if (editing) { await doctorsApi.update(editing.id, form); } else { await doctorsApi.create(form); }
      setModalOpen(false); load();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const handleAssign = async () => {
    if (!selectedDoctor || !assignRepId) return;
    try { await doctorsApi.assignRep(selectedDoctor.id, parseInt(assignRepId)); setAssignModal(false); load(); }
    catch (e: any) { alert(e.response?.data?.detail || 'Error al asignar'); }
  };

  const handleDelete = async (doc: Doctor) => {
    if (!confirm(`¿Eliminar a ${doc.name}? Quedará desactivado y no aparecerá en la lista.`)) return;
    try { await doctorsApi.delete(doc.id); load(); }
    catch (e: any) { alert(e.response?.data?.detail || 'Error al eliminar'); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Médicos</h1>
          <p className="text-gray-500 text-sm mt-1">{doctors.length} médicos encontrados</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo Médico
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('lista')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'lista' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Stethoscope size={15} /> Lista
        </button>
        <button
          onClick={() => setActiveTab('analitica')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'analitica' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart2 size={15} /> Analítica de Ventas
        </button>
      </div>

      {/* ── TAB LISTA ── */}
      {activeTab === 'lista' && (
        <>
          {/* Filters */}
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-9" placeholder="Buscar médico..." value={filters.search}
                  onChange={e => setFilters({ ...filters, search: e.target.value })} />
              </div>
              <select className="input" value={filters.rep_id} onChange={e => setFilters({ ...filters, rep_id: e.target.value })}>
                <option value="">Todos los visitadores</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className="input" value={filters.business_line_id} onChange={e => setFilters({ ...filters, business_line_id: e.target.value })}>
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
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">RUT</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Centro Médico</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Ciudad</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Comuna</th>
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
                        <td className="py-3 px-4 text-gray-500 text-xs">{doc.rut || '—'}</td>
                        <td className="py-3 px-4 text-gray-600 text-xs">{doc.medical_center || '—'}</td>
                        <td className="py-3 px-4 text-gray-600 text-xs">{doc.city || '—'}</td>
                        <td className="py-3 px-4 text-gray-600 text-xs">{doc.commune || '—'}</td>
                        <td className="py-3 px-4 text-gray-600">{doc.specialty || '—'}</td>
                        <td className="py-3 px-4">
                          {doc.business_line_name ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">{doc.business_line_name}</span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-600">{doc.rep_name || <span className="text-red-400 text-xs">Sin asignar</span>}</td>
                        <td className="py-3 px-4 text-gray-600 text-center">{doc.visit_frequency || 30}</td>
                        <td className="py-3 px-4 text-gray-500">
                          {doc.last_visit_date ? format(new Date(doc.last_visit_date), 'dd/MM/yy') : '—'}
                        </td>
                        <td className="py-3 px-4">
                          {doc.has_sales ? <span className="badge-completed">Sí</span> : <span className="badge-cancelled">No</span>}
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
        </>
      )}

      {/* ── TAB ANALÍTICA ── */}
      {activeTab === 'analitica' && (
        <div className="space-y-6">
          {/* Month selector */}
          <div className="flex items-center gap-2">
            <button onClick={prevSalesMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[130px] text-center">
              {MONTH_NAMES[salesMonth - 1]} {salesYear}
            </span>
            <button onClick={nextSalesMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>

          {loadingSales ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Gráfico ventas por doctor */}
              <div className="card">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Unidades por Médico</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Top 20 · comparativo {MONTH_NAMES[salesMonth - 1]} vs {prevMonthLabel()}</p>
                </div>

                {salesByDoctor.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                    No hay datos de ventas para este período
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-6 mb-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
                        {MONTH_NAMES[salesMonth - 1]} {salesYear}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm bg-gray-300" />
                        {prevMonthLabel()}
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={Math.max(320, salesByDoctor.length * 38)}>
                      <BarChart
                        data={salesByDoctor}
                        layout="vertical"
                        margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                        barCategoryGap="25%"
                        barGap={3}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} tickLine={false} axisLine={false} />
                        <YAxis
                          type="category" dataKey="doctor_name" width={160}
                          tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                          tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 21) + '…' : v}
                        />
                        <Tooltip
                          cursor={{ fill: '#f8fafc' }}
                          formatter={(value: number, name: string) => [
                            `${value} unidades`,
                            name === 'units_current' ? `${MONTH_NAMES[salesMonth - 1]} ${salesYear}` : prevMonthLabel()
                          ]}
                          labelFormatter={(label: string) => <span className="font-semibold">{label}</span>}
                        />
                        <Bar dataKey="units_prev" name="mes_anterior" fill="#d1d5db" radius={[0, 4, 4, 0]} maxBarSize={14} />
                        <Bar dataKey="units_current" name="mes_actual" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )}
              </div>

              {/* Nuevos prescriptores */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <UserPlus size={18} className="text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Nuevos Prescriptores</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Médicos que prescriben a Narma por primera vez en {MONTH_NAMES[salesMonth - 1]} {salesYear}
                      </p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-emerald-600">{newDoctors.length}</span>
                </div>

                {newDoctors.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">No hay nuevos prescriptores en este período</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-2 px-3 text-gray-500 font-medium">Médico</th>
                          <th className="text-left py-2 px-3 text-gray-500 font-medium">Especialidad</th>
                          <th className="text-left py-2 px-3 text-gray-500 font-medium">Visitador</th>
                          <th className="text-left py-2 px-3 text-gray-500 font-medium">Primera venta</th>
                          <th className="text-left py-2 px-3 text-gray-500 font-medium">Productos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {newDoctors.map((d, i) => (
                          <tr key={d.rut_doctor || i} className="hover:bg-gray-50 transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <span className="text-emerald-700 font-semibold text-xs">{d.doctor_name.charAt(0)}</span>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">{d.doctor_name}</p>
                                  {d.rut_doctor && <p className="text-xs text-gray-400">{d.rut_doctor}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-gray-500">{d.specialty || '—'}</td>
                            <td className="py-2.5 px-3">
                              {d.rep_name ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{d.rep_name}</span>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="py-2.5 px-3 text-gray-500 text-xs">
                              {d.primera_venta ? format(new Date(d.primera_venta), "d MMM yyyy", { locale: es }) : '—'}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-wrap gap-1">
                                {d.productos.slice(0, 3).map((p, pi) => (
                                  <span key={pi} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p}</span>
                                ))}
                                {d.productos.length > 3 && <span className="text-xs text-gray-400">+{d.productos.length - 3}</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
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
              <label className="label">RUT</label>
              <input className="input" value={form.rut || ''} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="12.345.678-9" />
            </div>
            <div>
              <label className="label">Centro Médico</label>
              <input className="input" value={form.medical_center || ''} onChange={e => setForm({ ...form, medical_center: e.target.value })} placeholder="Clínica, Hospital..." />
            </div>
            <div>
              <label className="label">Especialidad</label>
              <input className="input" value={form.specialty || ''} onChange={e => setForm({ ...form, specialty: e.target.value })} placeholder="Dermatología, Oncología..." />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="555-0000" />
            </div>
            <div>
              <label className="label">Ciudad</label>
              <input className="input" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Santiago, Viña del Mar..." />
            </div>
            <div>
              <label className="label">Comuna</label>
              <input className="input" value={form.commune || ''} onChange={e => setForm({ ...form, commune: e.target.value })} placeholder="Providencia, Las Condes..." />
            </div>
            <div className="col-span-2">
              <label className="label">Dirección</label>
              <input className="input" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Calle, número..." />
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
