import React, { useState, useEffect } from 'react';
import { Plus, Search, Stethoscope, Phone, Mail, MapPin, X, Building2, CheckCircle, Calendar, Edit2, BarChart2, ChevronLeft, ChevronRight, Award } from 'lucide-react';
import { doctorsApi, businessLinesApi, visitsApi, dashboardApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function RepDoctors() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'lista' | 'analitica'>('lista');
  const [doctors, setDoctors] = useState<any[]>([]);
  const [businessLines, setBusinessLines] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterBL, setFilterBL] = useState('');
  const [filterSales, setFilterSales] = useState<'all' | 'con' | 'sin'>('all');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  // Analítica state
  const now = new Date();
  const [rankMonth, setRankMonth] = useState(now.getMonth() + 1);
  const [rankYear, setRankYear] = useState(now.getFullYear());
  const [ranking, setRanking] = useState<any[]>([]);
  const [loadingRank, setLoadingRank] = useState(false);
  const isCurrentMonth = rankMonth === now.getMonth() + 1 && rankYear === now.getFullYear();

  const prevMonth = () => { if (rankMonth === 1) { setRankMonth(12); setRankYear(y => y - 1); } else setRankMonth(m => m - 1); };
  const nextMonth = () => { if (isCurrentMonth) return; if (rankMonth === 12) { setRankMonth(1); setRankYear(y => y + 1); } else setRankMonth(m => m + 1); };
  const [form, setForm] = useState({
    name: '', rut: '', medical_center: '', specialty: '', city: '', commune: '', phone: '', email: '',
    address: '', notes: '', business_line_id: '', visit_date: format(new Date(), 'yyyy-MM-dd'),
  });
  const [visitDoctor, setVisitDoctor] = useState<any>(null);
  const [visitDate, setVisitDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [visitNotes, setVisitNotes] = useState('');
  const [savingVisit, setSavingVisit] = useState(false);
  const [visitSuccess, setVisitSuccess] = useState<number | null>(null);

  // Edit state
  const [editDoctor, setEditDoctor] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const loadData = async () => {
    if (!user?.rep_id) return;
    setLoadingDoctors(true);
    try {
      const [docs, bls] = await Promise.all([
        doctorsApi.getAll({ rep_id: user.rep_id, is_active: true }),
        businessLinesApi.getAll(),
      ]);
      setDoctors(docs);
      setBusinessLines(bls);
    } catch (e) { console.error(e); }
    finally { setLoadingDoctors(false); }
  };

  const loadRanking = async () => {
    if (!user?.rep_id) return;
    setLoadingRank(true);
    try {
      const data = await dashboardApi.getDoctorRanking(rankMonth, rankYear, user.rep_id);
      // Filtro cliente: solo médicos asignados a este rep (por si el backend no filtra)
      const myDoctorIds = new Set(doctors.map((d: any) => d.id));
      const myRuts = new Set(doctors.map((d: any) => d.rut).filter(Boolean));
      const filtered = data.filter((item: any) =>
        (item.doctor_id && myDoctorIds.has(item.doctor_id)) ||
        (item.rut_doctor && myRuts.has(item.rut_doctor))
      );
      setRanking(filtered.length > 0 ? filtered : data.filter((item: any) => item.rep_id === user.rep_id));
    } catch (e) { console.error(e); }
    finally { setLoadingRank(false); }
  };

  useEffect(() => { loadData(); }, [user?.rep_id]);
  useEffect(() => { if (activeTab === 'analitica') loadRanking(); }, [rankMonth, rankYear, activeTab, user?.rep_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { visit_date, ...doctorData } = form;
      const newDoctor = await doctorsApi.create({
        ...doctorData,
        business_line_id: doctorData.business_line_id ? parseInt(doctorData.business_line_id) : undefined,
        rep_id: user?.rep_id,
      });
      // Create completed visit if date provided
      if (visit_date && user?.rep_id) {
        await visitsApi.create({
          doctor_id: newDoctor.id,
          rep_id: user.rep_id,
          scheduled_date: `${visit_date}T${format(new Date(), 'HH:mm')}:00`,
          status: 'completed',
          notes: 'Visita registrada al crear médico',
        });
      }
      setShowForm(false);
      setForm({ name: '', rut: '', medical_center: '', specialty: '', city: '', commune: '', phone: '', email: '', address: '', notes: '', business_line_id: '', visit_date: format(new Date(), 'yyyy-MM-dd') });
      loadData();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleRegisterVisit = async () => {
    if (!visitDoctor || !user?.rep_id) return;
    setSavingVisit(true);
    try {
      await visitsApi.create({
        doctor_id: visitDoctor.id,
        rep_id: user.rep_id,
        scheduled_date: `${visitDate}T${format(new Date(), 'HH:mm')}:00`,
        status: 'completed',
        notes: visitNotes || `Visita registrada manualmente`,
      });
      setVisitDoctor(null);
      setVisitNotes('');
      setVisitSuccess(visitDoctor.id);
      setTimeout(() => setVisitSuccess(null), 3000);
    } catch (e) { console.error(e); }
    finally { setSavingVisit(false); }
  };

  const openEdit = (doc: any) => {
    setEditDoctor(doc);
    setEditForm({
      name: doc.name || '',
      rut: doc.rut || '',
      medical_center: doc.medical_center || '',
      specialty: doc.specialty || '',
      city: doc.city || '',
      commune: doc.commune || '',
      phone: doc.phone || '',
      email: doc.email || '',
      address: doc.address || '',
      notes: doc.notes || '',
      business_line_id: doc.business_line_id ? String(doc.business_line_id) : '',
    });
    setEditError('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoctor) return;
    if (!editForm.name.trim()) { setEditError('El nombre es requerido'); return; }
    setSavingEdit(true);
    setEditError('');
    try {
      await doctorsApi.update(editDoctor.id, {
        ...editForm,
        business_line_id: editForm.business_line_id ? parseInt(editForm.business_line_id) : undefined,
      });
      setEditDoctor(null);
      loadData();
    } catch {
      setEditError('Error al guardar. Intenta nuevamente.');
    } finally {
      setSavingEdit(false);
    }
  };

  const totalDoctors = doctors.length;
  const withSales = doctors.filter(d => d.has_sales).length;
  const withoutSales = totalDoctors - withSales;
  const pct = totalDoctors > 0 ? Math.round((withSales / totalDoctors) * 100) : 0;
  const RADIUS = 42;
  const CIRC = 2 * Math.PI * RADIUS;
  const dash = (pct / 100) * CIRC;

  const filtered = doctors
    .filter(d =>
      (!search || d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.medical_center || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.rut || '').includes(search)) &&
      (!filterBL || String(d.business_line_id) === filterBL) &&
      (filterSales === 'all' || (filterSales === 'con' ? d.has_sales : !d.has_sales))
    )
    .sort((a, b) => {
      // Vencidas primero, luego por días sin visita descendente
      const freq = (d: any) => d.visit_frequency || 30;
      const days = (d: any) => d.last_visit_date
        ? Math.floor((Date.now() - new Date(d.last_visit_date).getTime()) / 86400000)
        : 9999;
      const overdue = (d: any) => days(d) > freq(d);
      if (overdue(a) && !overdue(b)) return -1;
      if (!overdue(a) && overdue(b)) return 1;
      return days(b) - days(a);
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Médicos</h1>
          <p className="text-gray-500 text-sm mt-1">{doctors.length} médicos asignados</p>
        </div>
        {activeTab === 'lista' && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nuevo Médico
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
        <button
          onClick={() => setActiveTab('lista')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'lista' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Stethoscope size={15} /> Mis Médicos
        </button>
        <button
          onClick={() => setActiveTab('analitica')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'analitica' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <BarChart2 size={15} /> Analítica
        </button>
      </div>

      {/* ── TAB ANALÍTICA ── */}
      {activeTab === 'analitica' && (
        <div className="space-y-4">
          {/* Navegación mes */}
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[140px] text-center">
              {MONTH_NAMES[rankMonth - 1]} {rankYear}
            </span>
            <button onClick={nextMonth} disabled={isCurrentMonth}
              className={`p-1.5 rounded-lg border border-gray-200 ${isCurrentMonth ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
              <ChevronRight size={18} />
            </button>
          </div>

          {loadingRank ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : ranking.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              <Award size={40} className="mx-auto mb-3 opacity-30" />
              <p>Sin prescripciones registradas en {MONTH_NAMES[rankMonth - 1]} {rankYear}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#0F1E2D' }}>
                      <th className="text-left px-4 py-3 text-white font-semibold w-12">#</th>
                      <th className="text-left px-4 py-3 text-white font-semibold">Médico</th>
                      <th className="text-left px-4 py-3 text-white font-semibold hidden md:table-cell">Especialidad</th>
                      <th className="text-left px-4 py-3 text-white font-semibold hidden sm:table-cell">Categorías</th>
                      <th className="text-center px-4 py-3 text-white font-semibold">Recetas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((item: any, idx: number) => (
                      <tr key={item.doctor_id ?? item.doctor_name} className={`border-t border-gray-100 hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-4 py-3 font-bold text-gray-500">
                          {idx === 0 ? <span className="text-lg">🥇</span> : idx === 1 ? <span className="text-lg">🥈</span> : idx === 2 ? <span className="text-lg">🥉</span> : <span>{idx + 1}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{item.doctor_name}</p>
                          {item.rut_doctor && <p className="text-xs text-gray-400">{item.rut_doctor}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                          {item.specialty || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(item.categorias || []).map((cat: string) => (
                              <span key={cat} className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">{cat}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-bold" style={{ color: '#0F1E2D' }}>{item.units}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB LISTA ── */}
      {activeTab === 'lista' && <>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, RUT o centro médico..." className="input pl-9 w-full" />
      </div>

      {/* Gráfico de efectividad */}
      {!loadingDoctors && totalDoctors > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-6">
          {/* Donut */}
          <div className="relative flex-shrink-0">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#F3F4F6" strokeWidth="12" />
              <circle
                cx="50" cy="50" r={RADIUS} fill="none"
                stroke={pct >= 60 ? '#10B981' : pct >= 30 ? '#F59E0B' : '#EF4444'}
                strokeWidth="12"
                strokeDasharray={`${dash} ${CIRC}`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-gray-900">{pct}%</span>
            </div>
          </div>
          {/* Stats */}
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-700 mb-2">Efectividad de cartera</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                  Con prescripción
                </span>
                <span className="font-semibold text-gray-900">{withSales}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />
                  Sin prescripción
                </span>
                <span className="font-semibold text-gray-900">{withoutSales}</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-1.5 mt-1.5">
                <span className="text-gray-500">Total médicos</span>
                <span className="font-semibold text-gray-900">{totalDoctors}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterBL}
          onChange={e => setFilterBL(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las líneas</option>
          {businessLines.map(bl => (
            <option key={bl.id} value={String(bl.id)}>{bl.name}</option>
          ))}
        </select>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['all', 'con', 'sin'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setFilterSales(opt)}
              className={`px-3 py-1.5 font-medium transition-colors ${filterSales === opt ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {opt === 'all' ? 'Todas' : opt === 'con' ? 'Con venta' : 'Sin venta'}
            </button>
          ))}
        </div>
        {(filterBL || filterSales !== 'all') && (
          <button
            onClick={() => { setFilterBL(''); setFilterSales('all'); }}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2"
          >
            <X size={14} /> Limpiar
          </button>
        )}
        <span className="text-sm text-gray-400 self-center ml-auto">{filtered.length} médico{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loadingDoctors ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          <p className="text-gray-400 text-sm">Cargando médicos...</p>
        </div>
      ) : null}

      <div className="space-y-3" style={{ display: loadingDoctors ? 'none' : undefined }}>
        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <Stethoscope size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No se encontraron médicos</p>
          </div>
        ) : filtered.map(doc => (
          <div key={doc.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 transition-colors">
            {/* Visit frequency indicator */}
            {(() => {
              const freq = doc.visit_frequency || 30;
              const lastVisit = doc.last_visit_date ? new Date(doc.last_visit_date) : null;
              const daysSince = lastVisit ? Math.floor((Date.now() - lastVisit.getTime()) / 86400000) : null;
              const overdue = daysSince !== null && daysSince > freq;
              const dueSoon = daysSince !== null && daysSince > freq * 0.8 && !overdue;
              return (
                <div className={`flex items-center justify-between mb-3 pb-3 border-b ${overdue ? 'border-red-100' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                      overdue ? 'bg-red-50 text-red-600' :
                      dueSoon ? 'bg-amber-50 text-amber-600' :
                      'bg-green-50 text-green-600'
                    }`}>
                      <Calendar size={12} />
                      {daysSince === null ? 'Sin visitas' :
                       overdue ? `Vencida hace ${daysSince - freq}d` :
                       dueSoon ? `Visitar pronto (${freq - daysSince}d)` :
                       `Al día`}
                    </div>
                    {lastVisit && (
                      <span className="text-xs text-gray-400">
                        Última: {lastVisit.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <CheckCircle size={12} className="text-blue-400" />
                    <span className="font-semibold text-blue-600">{doc.visits_count ?? 0}</span>
                    <span>visitas</span>
                  </div>
                </div>
              );
            })()}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                  {doc.rut && <span className="flex items-center gap-1">RUT: {doc.rut}</span>}
                  {doc.medical_center && <span className="flex items-center gap-1"><Building2 size={14} /> {doc.medical_center}</span>}
                  {doc.specialty && <span className="flex items-center gap-1"><Stethoscope size={14} /> {doc.specialty}</span>}
                  {doc.phone && <span className="flex items-center gap-1"><Phone size={14} /> {doc.phone}</span>}
                  {doc.email && <span className="flex items-center gap-1"><Mail size={14} /> {doc.email}</span>}
                  {(doc.city || doc.commune) && <span className="flex items-center gap-1"><MapPin size={14} /> {[doc.city, doc.commune].filter(Boolean).join(', ')}</span>}
                  {doc.address && <span className="flex items-center gap-1">{doc.address}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <div className="flex flex-wrap gap-1 justify-end">
                  {doc.business_line_name && (
                    <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">{doc.business_line_name}</span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${doc.has_sales ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {doc.has_sales ? '✓ Con venta' : 'Sin venta'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(doc)}
                    className="text-xs px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1 font-medium"
                  >
                    <Edit2 size={13} /> Editar
                  </button>
                  {visitSuccess === doc.id ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle size={14} /> Registrada
                    </span>
                  ) : (
                    <button
                      onClick={() => { setVisitDoctor(doc); setVisitDate(format(new Date(), 'yyyy-MM-dd')); setVisitNotes(''); }}
                      className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center gap-1 font-medium"
                    >
                      <CheckCircle size={14} /> Registrar Visita
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Visit Modal */}
      {visitDoctor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Registrar Visita</h2>
              <button onClick={() => setVisitDoctor(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="font-medium text-blue-900">{visitDoctor.name}</p>
                <p className="text-xs text-blue-600">{[visitDoctor.specialty, visitDoctor.medical_center].filter(Boolean).join(' · ') || 'Sin detalles'}</p>
              </div>
              <div>
                <label className="label">Fecha de la visita</label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={e => setVisitDate(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <textarea
                  value={visitNotes}
                  onChange={e => setVisitNotes(e.target.value)}
                  className="input w-full"
                  rows={2}
                  placeholder="Resultado de la visita, observaciones..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setVisitDoctor(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleRegisterVisit} disabled={savingVisit} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {savingVisit ? 'Guardando...' : <><CheckCircle size={16} /> Completada</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editDoctor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Editar Médico</h2>
              <button onClick={() => setEditDoctor(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="input w-full" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">RUT</label>
                  <input value={editForm.rut} onChange={e => setEditForm({...editForm, rut: e.target.value})} className="input w-full" placeholder="12345678-9" />
                </div>
                <div>
                  <label className="label">Línea de Negocio</label>
                  <select value={editForm.business_line_id} onChange={e => setEditForm({...editForm, business_line_id: e.target.value})} className="input w-full">
                    <option value="">Seleccionar</option>
                    {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Centro Médico</label>
                <input value={editForm.medical_center} onChange={e => setEditForm({...editForm, medical_center: e.target.value})} className="input w-full" placeholder="Clínica Santa María" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Especialidad</label>
                  <input value={editForm.specialty} onChange={e => setEditForm({...editForm, specialty: e.target.value})} className="input w-full" placeholder="Dermatología" />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="input w-full" placeholder="+56 9 1234 5678" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Ciudad</label>
                  <input value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} className="input w-full" />
                </div>
                <div>
                  <label className="label">Comuna</label>
                  <input value={editForm.commune} onChange={e => setEditForm({...editForm, commune: e.target.value})} className="input w-full" />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className="input w-full" placeholder="doctor@email.com" />
              </div>
              <div>
                <label className="label">Dirección</label>
                <input value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} className="input w-full" />
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="input w-full" rows={2} placeholder="Observaciones..." />
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditDoctor(null)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={savingEdit} className="btn-primary flex-1">{savingEdit ? 'Guardando...' : 'Guardar cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  <label className="label">Ciudad</label>
                  <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="input w-full" placeholder="Santiago, Viña del Mar..." />
                </div>
                <div>
                  <label className="label">Comuna</label>
                  <input value={form.commune} onChange={e => setForm({...form, commune: e.target.value})} className="input w-full" placeholder="Providencia, Las Condes..." />
                </div>
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

              {/* Visit date */}
              <div className="border-t border-gray-200 pt-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={18} className="text-green-600" />
                  <span className="font-medium text-gray-900 text-sm">Registrar visita completada</span>
                </div>
                <div>
                  <label className="label">Fecha de la visita</label>
                  <input
                    type="date"
                    value={form.visit_date}
                    onChange={e => setForm({...form, visit_date: e.target.value})}
                    className="input w-full"
                  />
                  <p className="text-xs text-gray-400 mt-1">Se registrará como visita completada en esta fecha</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Guardando...' : 'Crear Médico'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
