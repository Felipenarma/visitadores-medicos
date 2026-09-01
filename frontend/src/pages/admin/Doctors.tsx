import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Edit2, Trash2, Stethoscope, Search, UserCheck, BarChart2, UserPlus, ChevronLeft, ChevronRight, GitMerge, AlertTriangle, Download, TrendingUp, X, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Modal from '../../components/Modal';
import { doctorsApi, repsApi, businessLinesApi, dashboardApi, visitsApi } from '../../api';
import type { Doctor, MedicalRep, BusinessLine, Visit } from '../../types';
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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [filters, setFilters] = useState({
    rep_id: '', business_line_id: '', search: searchParams.get('search') || '',
    has_sales: '', sales_month: '', sales_year: '',
  });
  const [exporting, setExporting] = useState(false);

  // Historial ventas state
  const [historialDoctor, setHistorialDoctor] = useState<Doctor | null>(null);
  const [historialData, setHistorialData] = useState<any[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // Historial visitas state
  const [visitHistorialDoctor, setVisitHistorialDoctor] = useState<Doctor | null>(null);
  const [visitHistorialData, setVisitHistorialData] = useState<Visit[]>([]);
  const [loadingVisitHistorial, setLoadingVisitHistorial] = useState(false);

  const openVisitHistorial = async (doc: Doctor) => {
    if (!doc.id) return;
    setVisitHistorialDoctor(doc);
    setLoadingVisitHistorial(true);
    try {
      const data = await visitsApi.getAll({ doctor_id: doc.id });
      setVisitHistorialData(data.sort((a: Visit, b: Visit) =>
        new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
      ));
    } catch (e) { console.error(e); }
    finally { setLoadingVisitHistorial(false); }
  };

  const openHistorial = async (doc: Doctor) => {
    if (!doc.id) return;
    setHistorialDoctor(doc);
    setLoadingHistorial(true);
    try {
      const data = await dashboardApi.getDoctorSalesHistory(doc.id, 6);
      setHistorialData(data);
    } catch (e) { console.error(e); }
    finally { setLoadingHistorial(false); }
  };

  // Merge modal state
  const [mergeSource, setMergeSource]   = useState<Doctor | null>(null);
  const [mergeSearch, setMergeSearch]   = useState('');
  const [mergeTarget, setMergeTarget]   = useState<Doctor | null>(null);
  const [mergeResults, setMergeResults] = useState<Doctor[]>([]);
  const [merging, setMerging]           = useState(false);
  const [mergeError, setMergeError]     = useState('');
  const mergeSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (filters.rep_id && filters.rep_id !== 'none') params.rep_id = parseInt(filters.rep_id);
      if (filters.business_line_id) params.business_line_id = parseInt(filters.business_line_id);
      if (filters.search) params.search = filters.search;
      if (filters.sales_month) params.sales_month = parseInt(filters.sales_month);
      if (filters.sales_year) params.sales_year = parseInt(filters.sales_year);
      const [d, r, bl] = await Promise.all([
        doctorsApi.getAll(params),
        repsApi.getAll(),
        businessLinesApi.getAll(),
      ]);
      // Filtros cliente
      let filtered = filters.rep_id === 'none' ? d.filter((doc: Doctor) => !doc.rep_id) : d;
      if (filters.has_sales === 'true') filtered = filtered.filter((doc: Doctor) => doc.has_sales);
      if (filters.has_sales === 'false') filtered = filtered.filter((doc: Doctor) => !doc.has_sales);
      setDoctors(filtered);
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

  // Si viene con ?search= desde el buscador global, limpiar el param de la URL
  useEffect(() => {
    const q = searchParams.get('search');
    if (q) setSearchParams({}, { replace: true });
  }, []);

  useEffect(() => { load(); }, [filters]);
  useEffect(() => { if (activeTab === 'analitica') loadSalesData(); }, [salesMonth, salesYear, activeTab]);

  const prevMonthLabel = () => MONTH_NAMES[salesMonth === 1 ? 11 : salesMonth - 2];
  const _now = new Date();
  const _dcm = _now.getMonth() + 1;
  const _dcy = _now.getFullYear();
  const isSalesCurrentMonth = salesYear > _dcy || (salesYear === _dcy && salesMonth >= _dcm);
  useEffect(() => {
    if (salesYear > _dcy || (salesYear === _dcy && salesMonth > _dcm)) {
      setSalesMonth(_dcm); setSalesYear(_dcy);
    }
  }, []);
  const prevSalesMonth = () => { if (salesMonth === 1) { setSalesMonth(12); setSalesYear(y => y - 1); } else setSalesMonth(m => m - 1); };
  const nextSalesMonth = () => { if (isSalesCurrentMonth) return; if (salesMonth === 12) { setSalesMonth(1); setSalesYear(y => y + 1); } else setSalesMonth(m => m + 1); };

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

  const openMerge = (doc: Doctor) => {
    setMergeSource(doc);
    setMergeTarget(null);
    setMergeSearch('');
    setMergeResults([]);
    setMergeError('');
  };

  const handleMergeSearch = (q: string) => {
    setMergeSearch(q);
    setMergeTarget(null);
    if (mergeSearchRef.current) clearTimeout(mergeSearchRef.current);
    if (q.trim().length < 2) { setMergeResults([]); return; }
    mergeSearchRef.current = setTimeout(async () => {
      const results = await doctorsApi.getAll({ search: q, is_active: true });
      setMergeResults(results.filter(d => d.id !== mergeSource?.id));
    }, 300);
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTarget) return;
    setMerging(true);
    setMergeError('');
    try {
      await doctorsApi.mergeInto(mergeSource.id, mergeTarget.id);
      setMergeSource(null);
      load();
    } catch (e: any) {
      setMergeError(e.response?.data?.detail || 'Error al fusionar');
    } finally {
      setMerging(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: any = { is_active: true };
      if (filters.rep_id && filters.rep_id !== 'none') params.rep_id = parseInt(filters.rep_id);
      if (filters.business_line_id) params.business_line_id = parseInt(filters.business_line_id);
      if (filters.search) params.search = filters.search;
      if (filters.has_sales !== '') params.has_sales = filters.has_sales === 'true';
      const blob = await doctorsApi.exportExcel(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `medicos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error al exportar. Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Médicos</h1>
          <p className="text-gray-500 text-sm mt-1">{doctors.length} médicos encontrados</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={16} />
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nuevo Médico
          </button>
        </div>
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
                <input className="input pl-9" placeholder="Buscar por nombre o RUT..." value={filters.search}
                  onChange={e => setFilters({ ...filters, search: e.target.value })} />
              </div>
              <select className="input" value={filters.rep_id} onChange={e => setFilters({ ...filters, rep_id: e.target.value })}>
                <option value="">Todos los visitadores</option>
                <option value="none">⚠️ Sin visitador asignado</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className="input" value={filters.business_line_id} onChange={e => setFilters({ ...filters, business_line_id: e.target.value })}>
                <option value="">Todas las líneas</option>
                {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
              {/* Filtro con/sin venta */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Ventas:</span>
                {(['', 'true', 'false'] as const).map(val => (
                  <button
                    key={val}
                    onClick={() => setFilters(f => ({ ...f, has_sales: val }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                      filters.has_sales === val
                        ? val === 'true'
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : val === 'false'
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-gray-700 text-white border-gray-700'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {val === '' ? 'Todos' : val === 'true' ? 'Con venta' : 'Sin venta'}
                  </button>
                ))}
              </div>

              {/* Separador */}
              <div className="h-4 w-px bg-gray-200" />

              {/* Filtro período */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Período:</span>
                <select
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={filters.sales_month}
                  onChange={e => setFilters(f => ({ ...f, sales_month: e.target.value }))}
                >
                  <option value="">Todos los meses</option>
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={filters.sales_year}
                  onChange={e => setFilters(f => ({ ...f, sales_year: e.target.value }))}
                >
                  <option value="">Año</option>
                  {[2023, 2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                {(filters.sales_month || filters.sales_year) && (
                  <button
                    onClick={() => setFilters(f => ({ ...f, sales_month: '', sales_year: '' }))}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Mini dashboard — solo cuando hay filtro activo */}
          {!loading && (filters.rep_id || filters.business_line_id || filters.search) && doctors.length > 0 && (() => {
            const withSales    = doctors.filter(d => d.has_sales).length;
            const withoutSales = doctors.filter(d => !d.has_sales).length;
            const withoutRep   = doctors.filter(d => !d.rep_id).length;
            const pctSales     = Math.round((withSales / doctors.length) * 100);

            // Especialidades más frecuentes
            const specMap: Record<string, number> = {};
            doctors.forEach(d => { if (d.specialty) specMap[d.specialty] = (specMap[d.specialty] || 0) + 1; });
            const topSpecs = Object.entries(specMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total médicos</p>
                  <p className="text-3xl font-bold mt-1" style={{ color: '#0F1E2D' }}>{doctors.length}</p>
                  {topSpecs.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{topSpecs.map(([s]) => s).join(' · ')}</p>
                  )}
                </div>

                {/* Con ventas */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Con ventas</p>
                  <p className="text-3xl font-bold mt-1 text-emerald-600">{withSales}</p>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctSales}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pctSales}% del filtro</p>
                </div>

                {/* Sin ventas */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Sin ventas</p>
                  <p className="text-3xl font-bold mt-1 text-amber-500">{withoutSales}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {withoutSales > 0 ? `${Math.round((withoutSales / doctors.length) * 100)}% sin prescripción` : 'Todos prescriben'}
                  </p>
                </div>

                {/* Sin visitador */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Sin visitador</p>
                  <p className={`text-3xl font-bold mt-1 ${withoutRep > 0 ? 'text-red-500' : 'text-gray-400'}`}>{withoutRep}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {withoutRep > 0 ? `${withoutRep} sin asignar` : 'Todos asignados ✓'}
                  </p>
                </div>
              </div>
            );
          })()}

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
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Teléfono</th>
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
                      <tr
                        key={doc.id}
                        onClick={() => openEdit(doc)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors group"
                        title="Clic para editar"
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900 group-hover:text-blue-700 flex items-center gap-1.5">
                            {doc.name}
                            <Edit2 size={12} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-xs">{doc.rut || '—'}</td>
                        <td className="py-3 px-4 text-gray-600 text-xs">{doc.phone || '—'}</td>
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
                        <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openHistorial(doc)} title="Ver historial de ventas" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <TrendingUp size={15} />
                            </button>
                            <button onClick={() => openVisitHistorial(doc)} title="Ver historial de visitas" className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                              <Calendar size={15} />
                            </button>
                            <button onClick={() => openAssign(doc)} title="Asignar visitador" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                              <UserCheck size={15} />
                            </button>
                            <button onClick={() => openMerge(doc)} title="Fusionar con otro médico" className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                              <GitMerge size={15} />
                            </button>
                            <button onClick={() => handleDelete(doc)} title="Eliminar" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
            <button
              onClick={nextSalesMonth}
              disabled={isSalesCurrentMonth}
              className={`p-1.5 rounded-lg transition-colors ${isSalesCurrentMonth ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'}`}
            >
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
                        {prevMonthLabel()} {salesMonth === 1 ? salesYear - 1 : salesYear}
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
                            (name === 'mes_actual' || name === 'units_current') ? `${MONTH_NAMES[salesMonth - 1]} ${salesYear}` : `${prevMonthLabel()} ${salesMonth === 1 ? salesYear - 1 : salesYear}`
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

      {/* ── Merge Modal ── */}
      {mergeSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            {/* Header */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <GitMerge size={18} className="text-purple-600" />
                <h2 className="text-lg font-bold text-gray-900">Fusionar médico</h2>
              </div>
              <p className="text-sm text-gray-500">El médico origen se desactivará y todas sus ventas y visitas pasarán al destino.</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Origen */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Origen (se eliminará)</p>
                <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-red-600 font-bold text-sm">{mergeSource.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{mergeSource.name}</p>
                    <p className="text-xs text-gray-400">{mergeSource.rut || 'Sin RUT'}</p>
                  </div>
                </div>
              </div>

              {/* Destino */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Destino (se conservará)</p>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    placeholder="Buscar médico destino..."
                    value={mergeSearch}
                    onChange={e => handleMergeSearch(e.target.value)}
                    autoFocus
                  />
                </div>

                {/* Resultados búsqueda */}
                {mergeResults.length > 0 && !mergeTarget && (
                  <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-sm">
                    {mergeResults.map(doc => (
                      <button
                        key={doc.id}
                        onClick={() => { setMergeTarget(doc); setMergeResults([]); setMergeSearch(doc.name); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-purple-50 text-left transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="w-7 h-7 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-600 font-semibold text-xs">{doc.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                          <p className="text-xs text-gray-400">{doc.rut || 'Sin RUT'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Destino seleccionado */}
                {mergeTarget && (
                  <div className="flex items-center gap-3 p-3 mt-1 bg-purple-50 border border-purple-200 rounded-xl">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-purple-600 font-bold text-sm">{mergeTarget.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 text-sm">{mergeTarget.name}</p>
                      <p className="text-xs text-gray-400">{mergeTarget.rut || 'Sin RUT'}</p>
                    </div>
                    <button onClick={() => { setMergeTarget(null); setMergeSearch(''); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                  </div>
                )}
              </div>

              {/* Warning */}
              {mergeTarget && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                  <span>Todas las ventas y visitas de <strong>{mergeSource.name}</strong> pasarán a <strong>{mergeTarget.name}</strong>. Esta acción no se puede deshacer.</span>
                </div>
              )}

              {mergeError && <p className="text-sm text-red-500">{mergeError}</p>}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setMergeSource(null)} disabled={merging} className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={handleMerge}
                disabled={!mergeTarget || merging}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
              >
                <GitMerge size={15} />
                {merging ? 'Fusionando...' : 'Fusionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historial de ventas modal */}
      {historialDoctor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-500" />
                Historial — {historialDoctor.name}
              </h2>
              <button onClick={() => setHistorialDoctor(null)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              {loadingHistorial ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : historialData.length === 0 ? (
                <p className="text-gray-400 text-center py-10">Sin prescripciones registradas</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={historialData}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <Tooltip formatter={(v: any) => [v, 'Recetas']} />
                    <Bar dataKey="units" fill="#4BA5C3" radius={[4, 4, 0, 0]} name="Recetas" />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="text-xs text-gray-400 text-center mt-2">Últimos 6 meses de prescripciones</p>
            </div>
          </div>
        </div>
      )}

      {/* Historial de visitas modal */}
      {visitHistorialDoctor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar size={18} className="text-purple-500" />
                Visitas — {visitHistorialDoctor.name}
              </h2>
              <button onClick={() => setVisitHistorialDoctor(null)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {loadingVisitHistorial ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                </div>
              ) : visitHistorialData.length === 0 ? (
                <p className="text-gray-400 text-center py-10">Sin visitas registradas</p>
              ) : (
                <div className="space-y-2">
                  {visitHistorialData.map(v => {
                    const statusColors: Record<string, string> = {
                      completed: 'bg-green-100 text-green-700',
                      missed: 'bg-red-100 text-red-700',
                      scheduled: 'bg-blue-100 text-blue-600',
                      cancelled: 'bg-gray-100 text-gray-500',
                    };
                    const statusLabels: Record<string, string> = {
                      completed: 'Completada', missed: 'Perdida',
                      scheduled: 'Programada', cancelled: 'Cancelada',
                    };
                    return (
                      <div key={v.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="text-right min-w-[80px]">
                          <p className="text-sm font-medium text-gray-700">
                            {new Date(v.scheduled_date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(v.scheduled_date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[v.status] || statusColors.scheduled}`}>
                              {statusLabels[v.status] || v.status}
                            </span>
                            {v.rep_name && <span className="text-xs text-gray-500">{v.rep_name}</span>}
                          </div>
                          {v.notes && <p className="text-xs text-gray-500 mt-1 italic">📝 {v.notes}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!loadingVisitHistorial && visitHistorialData.length > 0 && (
                <p className="text-xs text-gray-400 text-center mt-3">
                  {visitHistorialData.length} visita(s) en total ·
                  {' '}{visitHistorialData.filter(v => v.status === 'completed').length} completadas ·
                  {' '}{visitHistorialData.filter(v => v.status === 'missed').length} perdidas
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
