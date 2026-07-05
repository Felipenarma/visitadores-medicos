import React, { useEffect, useState } from 'react';
import { Activity, Search, Wifi, Clock, LogIn, ChevronDown, ChevronUp } from 'lucide-react';
import { doctorsApi, repsApi, businessLinesApi, sessionsApi } from '../../api';
import type { Doctor, MedicalRep, BusinessLine } from '../../types';
import { format } from 'date-fns';

type SessionRepSummary = {
  rep_id: number;
  rep_name: string;
  sessions: number;
  total_minutes: number;
  avg_sessions_per_day: number;
  avg_duration_minutes: number;
  last_seen: string | null;
};

type SessionDayDetail = {
  count: number;
  duration_minutes: number;
  sessions: { id: number; login_at: string; logout_at: string | null; duration_minutes: number }[];
};

export default function Tracking() {
  const [activeTab, setActiveTab] = useState<'medicos' | 'conexiones'>('medicos');

  // ── Médicos tab ──
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [reps, setReps] = useState<MedicalRep[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ rep_id: '', business_line_id: '', has_sales: '', search: '' });

  // ── Conexiones tab ──
  const [sessionDays, setSessionDays] = useState(7);
  const [sessionSummary, setSessionSummary] = useState<SessionRepSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [expandedRep, setExpandedRep] = useState<number | null>(null);
  const [repDetail, setRepDetail] = useState<{ rep_id: number; by_day: Record<string, SessionDayDetail> } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.rep_id) params.rep_id = parseInt(filters.rep_id);
      if (filters.business_line_id) params.business_line_id = parseInt(filters.business_line_id);
      if (filters.has_sales === 'true') params.has_sales = true;
      if (filters.has_sales === 'false') params.has_sales = false;
      if (filters.search) params.search = filters.search;
      const [d, r, bl] = await Promise.all([
        doctorsApi.getAll(params),
        repsApi.getAll(),
        businessLinesApi.getAll(),
      ]);
      setDoctors(d);
      setReps(r);
      setBusinessLines(bl);
    } finally { setLoading(false); }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await sessionsApi.getSummary(sessionDays);
      setSessionSummary(data.reps || []);
    } catch { setSessionSummary([]); }
    finally { setLoadingSessions(false); }
  };

  const loadRepDetail = async (rep_id: number) => {
    if (expandedRep === rep_id) { setExpandedRep(null); return; }
    setExpandedRep(rep_id);
    setLoadingDetail(true);
    try {
      const data = await sessionsApi.getRepStats(rep_id, sessionDays);
      setRepDetail({ rep_id, by_day: data.by_day || {} });
    } catch { setRepDetail(null); }
    finally { setLoadingDetail(false); }
  };

  useEffect(() => { load(); }, [filters]);
  useEffect(() => { if (activeTab === 'conexiones') loadSessions(); }, [activeTab, sessionDays]);

  const getRowClass = (doc: Doctor) => {
    if (doc.has_sales && (doc.visits_count ?? 0) > 0) return 'bg-green-50/40';
    if (!doc.has_sales && (doc.visits_count ?? 0) > 3) return 'bg-orange-50/40';
    return '';
  };

  const fmtMins = (m: number) => {
    if (m < 60) return `${m}min`;
    return `${Math.floor(m / 60)}h ${m % 60}min`;
  };

  const lastSeenLabel = (iso: string | null) => {
    if (!iso) return 'Nunca';
    const d = new Date(iso);
    const diffH = Math.floor((Date.now() - d.getTime()) / 3600000);
    if (diffH < 1) return 'Hace menos de 1h';
    if (diffH < 24) return `Hace ${diffH}h`;
    return format(d, 'dd/MM HH:mm');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel de Seguimiento</h1>
        <p className="text-gray-500 text-sm mt-1">Monitoreo de médicos, visitas y conexiones de los visitadores</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('medicos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'medicos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Activity size={15} /> Médicos
        </button>
        <button
          onClick={() => setActiveTab('conexiones')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'conexiones' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Wifi size={15} /> Conexiones
        </button>
      </div>

      {/* ── TAB MÉDICOS ── */}
      {activeTab === 'medicos' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card text-center">
              <p className="text-2xl font-bold text-gray-900">{doctors.length}</p>
              <p className="text-xs text-gray-500">Médicos totales</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-green-600">{doctors.filter(d => d.has_sales).length}</p>
              <p className="text-xs text-gray-500">Con ventas</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-blue-600">{doctors.filter(d => (d.visits_count ?? 0) > 0).length}</p>
              <p className="text-xs text-gray-500">Con visitas</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-orange-500">{doctors.filter(d => !d.rep_id).length}</p>
              <p className="text-xs text-gray-500">Sin visitador</p>
            </div>
          </div>

          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-9" placeholder="Buscar médico..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
              </div>
              <select className="input" value={filters.rep_id} onChange={e => setFilters({ ...filters, rep_id: e.target.value })}>
                <option value="">Todos los visitadores</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className="input" value={filters.business_line_id} onChange={e => setFilters({ ...filters, business_line_id: e.target.value })}>
                <option value="">Todas las líneas</option>
                {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
              </select>
              <select className="input" value={filters.has_sales} onChange={e => setFilters({ ...filters, has_sales: e.target.value })}>
                <option value="">Con y sin ventas</option>
                <option value="true">Solo con ventas</option>
                <option value="false">Solo sin ventas</option>
              </select>
            </div>
            <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
                <span>Médico convirtiendo (visitas + ventas)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-100 border border-orange-200"></div>
                <span>Visitado +3 veces pero sin ventas</span>
              </div>
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
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Última Visita</th>
                      <th className="text-center py-3 px-4 text-gray-500 font-medium">Visitas</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium">Prescribe</th>
                      <th className="text-center py-3 px-4 text-gray-500 font-medium">Ventas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {doctors.map(doc => (
                      <tr key={doc.id} className={`hover:bg-gray-50 ${getRowClass(doc)}`}>
                        <td className="py-3 px-4 font-medium text-gray-900">{doc.name}</td>
                        <td className="py-3 px-4 text-gray-500">{doc.specialty || '—'}</td>
                        <td className="py-3 px-4">
                          {doc.business_line_name ? <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded font-medium">{doc.business_line_name}</span> : '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-600">{doc.rep_name || <span className="text-orange-400 text-xs">Sin asignar</span>}</td>
                        <td className="py-3 px-4 text-gray-500 text-xs">
                          {doc.last_visit_date ? format(new Date(doc.last_visit_date), 'dd/MM/yyyy') : '—'}
                        </td>
                        <td className="py-3 px-4 text-center"><span className="font-semibold text-gray-900">{doc.visits_count ?? 0}</span></td>
                        <td className="py-3 px-4 text-gray-500 text-xs max-w-xs truncate">{doc.prescribes_products || '—'}</td>
                        <td className="py-3 px-4 text-center">
                          {doc.has_sales ? <span className="badge-completed">Sí</span> : <span className="badge-cancelled">No</span>}
                        </td>
                      </tr>
                    ))}
                    {doctors.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-gray-400">
                          <Activity size={32} className="mx-auto mb-2 opacity-40" />
                          No se encontraron médicos con los filtros actuales
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

      {/* ── TAB CONEXIONES ── */}
      {activeTab === 'conexiones' && (
        <div className="space-y-4">
          {/* Selector de período */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Período:</span>
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setSessionDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sessionDays === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {d} días
              </button>
            ))}
          </div>

          {loadingSessions ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : sessionSummary.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              <Wifi size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin datos de conexión aún</p>
              <p className="text-sm mt-1">Los visitadores deben iniciar sesión para que aparezca el registro</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessionSummary.map(rep => (
                <div key={rep.rep_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Fila resumen */}
                  <button
                    onClick={() => loadRepDetail(rep.rep_id)}
                    className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-bold text-sm">{rep.rep_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{rep.rep_name}</p>
                      <p className="text-xs text-gray-400">Último acceso: {lastSeenLabel(rep.last_seen)}</p>
                    </div>
                    <div className="flex items-center gap-6 flex-shrink-0">
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-blue-600 font-bold text-lg">
                          <LogIn size={16} />
                          {rep.sessions}
                        </div>
                        <p className="text-xs text-gray-400">sesiones</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-700 font-bold text-lg">{rep.avg_sessions_per_day}</p>
                        <p className="text-xs text-gray-400">por día</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-green-600 font-bold text-lg">
                          <Clock size={16} />
                          {fmtMins(rep.avg_duration_minutes)}
                        </div>
                        <p className="text-xs text-gray-400">duración media</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-700 font-bold text-lg">{fmtMins(rep.total_minutes)}</p>
                        <p className="text-xs text-gray-400">tiempo total</p>
                      </div>
                      {expandedRep === rep.rep_id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </button>

                  {/* Detalle por día */}
                  {expandedRep === rep.rep_id && (
                    <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                      {loadingDetail && !repDetail ? (
                        <div className="flex justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                        </div>
                      ) : repDetail?.rep_id === rep.rep_id && Object.keys(repDetail.by_day).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(repDetail.by_day).map(([day, data]) => (
                            <div key={day} className="flex items-start gap-4">
                              <div className="w-24 text-xs font-medium text-gray-500 pt-0.5">
                                {format(new Date(day + 'T12:00:00'), 'EEE dd/MM').replace(/^\w/, c => c.toUpperCase())}
                              </div>
                              <div className="flex-1 space-y-1">
                                {data.sessions.map(s => (
                                  <div key={s.id} className="flex items-center gap-3 text-xs">
                                    <span className="text-gray-600">{format(new Date(s.login_at), 'HH:mm')}</span>
                                    <span className="text-gray-300">→</span>
                                    <span className="text-gray-600">{s.logout_at ? format(new Date(s.logout_at), 'HH:mm') : 'activo'}</span>
                                    <span className="text-blue-500 font-medium">{fmtMins(s.duration_minutes)}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="text-right text-xs">
                                <p className="font-semibold text-gray-700">{data.count} sesión{data.count > 1 ? 'es' : ''}</p>
                                <p className="text-gray-400">{fmtMins(data.duration_minutes)} total</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-2">Sin detalle disponible</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
