import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle, XCircle, Users, Clock, TrendingUp, AlertCircle, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import StatCard from '../../components/StatCard';
import { dashboardApi, visitsApi, repsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { RepStats, Visit, RepDetail } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function RepDashboard() {
  const { user } = useAuth();
  const nowDate = new Date();
  const [stats, setStats] = useState<RepStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayVisits, setTodayVisits] = useState<Visit[]>([]);
  const [completing, setCompleting] = useState<number | null>(null);
  const [justCompleted, setJustCompleted] = useState<Set<number>>(new Set());
  const [targetVisits, setTargetVisits] = useState(0);

  // Navegación de meses
  const [viewMonth, setViewMonth] = useState(nowDate.getMonth() + 1);
  const [viewYear, setViewYear] = useState(nowDate.getFullYear());
  const [monthDetail, setMonthDetail] = useState<RepDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const isCurrentMonth = viewMonth === nowDate.getMonth() + 1 && viewYear === nowDate.getFullYear();
  const today = format(nowDate, 'yyyy-MM-dd');

  const loadData = async () => {
    if (!user?.rep_id) return;
    setLoading(true);
    try {
      const [s, tv] = await Promise.all([
        dashboardApi.getRepStats(user.rep_id),
        visitsApi.getAll({ rep_id: user.rep_id, date_from: today, date_to: today }),
      ]);
      setStats(s);
      setTodayVisits(tv);
      repsApi.getTarget(user.rep_id, nowDate.getMonth() + 1, nowDate.getFullYear())
        .then(t => setTargetVisits(t.target_visits ?? 0))
        .catch(() => setTargetVisits(0));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadMonthDetail = async () => {
    if (!user?.rep_id) return;
    setLoadingDetail(true);
    try {
      const d = await dashboardApi.getRepDetail(user.rep_id, viewMonth, viewYear);
      setMonthDetail(d);
    } catch { setMonthDetail(null); }
    finally { setLoadingDetail(false); }
  };

  useEffect(() => { loadData(); }, [user?.rep_id]);
  useEffect(() => { loadMonthDetail(); }, [user?.rep_id, viewMonth, viewYear]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewYear === nowDate.getFullYear() && viewMonth === nowDate.getMonth() + 1) return;
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleComplete = async (visit: Visit) => {
    setCompleting(visit.id);
    try {
      await visitsApi.update(visit.id, { status: 'completed' });
      setJustCompleted(prev => new Set([...prev, visit.id]));
      setTodayVisits(prev => prev.map(v => v.id === visit.id ? { ...v, status: 'completed' } : v));
      if (user?.rep_id) dashboardApi.getRepStats(user.rep_id).then(setStats).catch(() => {});
    } catch (e) { console.error(e); }
    finally { setCompleting(null); }
  };

  if (!user?.rep_id) return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-lg font-medium">ID de visitador no configurado</p>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  const pendingToday = todayVisits.filter(v => v.status === 'scheduled');
  const completedToday = todayVisits.filter(v => v.status === 'completed');

  // Para stats mensuales usar el detalle del mes seleccionado
  const monthCompleted = isCurrentMonth ? (stats?.completed_this_month ?? 0) : (monthDetail?.month.completed ?? 0);
  const monthMissed = isCurrentMonth ? (stats?.missed_this_month ?? 0) : (monthDetail?.month.missed ?? 0);
  const monthTotal = monthCompleted + monthMissed;
  const completionPct = monthTotal > 0 ? Math.round(monthCompleted / monthTotal * 100) : 0;
  const effectiveness = monthDetail?.effectiveness ?? null;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      scheduled: 'badge-scheduled', completed: 'badge-completed',
      missed: 'badge-missed', cancelled: 'badge-cancelled',
    };
    const labels: Record<string, string> = {
      scheduled: 'Programada', completed: 'Completada',
      missed: 'Perdida', cancelled: 'Cancelada',
    };
    return <span className={map[status] || 'badge-scheduled'}>{labels[status] || status}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header con navegación de meses */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(nowDate, "EEEE, d 'de' MMMM", { locale: es })} · {user.name}
          </p>
        </div>
        {/* Selector de mes */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl shadow-sm px-1 py-1">
          <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <span className={`text-sm font-semibold min-w-[140px] text-center px-2 ${isCurrentMonth ? 'text-blue-700' : 'text-gray-700'}`}>
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
            {isCurrentMonth && <span className="ml-1.5 text-xs font-normal text-blue-400">(actual)</span>}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Visitas de hoy — solo mes actual */}
      {isCurrentMonth && todayVisits.length > 0 && (
        <div className={`rounded-xl border p-4 ${pendingToday.length > 0 ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`font-semibold flex items-center gap-2 ${pendingToday.length > 0 ? 'text-blue-800' : 'text-green-800'}`}>
              {pendingToday.length > 0
                ? <><AlertCircle size={16} /> {pendingToday.length} visita{pendingToday.length > 1 ? 's' : ''} pendiente{pendingToday.length > 1 ? 's' : ''} hoy</>
                : <><CheckCircle size={16} /> ¡Todas las visitas de hoy completadas!</>
              }
            </h2>
            <span className="text-xs text-gray-500">{completedToday.length}/{todayVisits.length} completadas</span>
          </div>
          <div className="space-y-2">
            {todayVisits.map(visit => (
              <div key={visit.id} className="bg-white rounded-lg px-4 py-3 flex items-center justify-between shadow-sm">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{(visit as any).doctor_name || 'Doctor'}</p>
                  <p className="text-xs text-gray-400">{format(new Date(visit.scheduled_date), 'HH:mm')}</p>
                  {visit.notes && <p className="text-xs text-gray-500 mt-0.5 italic">📝 {visit.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(justCompleted.has(visit.id) ? 'completed' : visit.status)}
                  {visit.status === 'scheduled' && !justCompleted.has(visit.id) && (
                    <button
                      onClick={() => handleComplete(visit)}
                      disabled={completing === visit.id}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {completing === visit.id ? '...' : '✓ Completar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Mis Médicos" value={stats?.doctor_count ?? 0} icon={<Users size={24} />} color="blue" />
        {isCurrentMonth
          ? <StatCard title="Visitas Hoy" value={todayVisits.length} icon={<Calendar size={24} />} color="purple" />
          : <StatCard title="Visitas del Mes" value={monthDetail?.month.total ?? 0} icon={<Calendar size={24} />} color="purple" />
        }
        <StatCard title={isCurrentMonth ? 'Esta Semana' : 'Completadas'} value={isCurrentMonth ? (stats?.visits_this_week ?? 0) : monthCompleted} icon={<Clock size={24} />} color="orange" />
        <StatCard title="Tasa de Cumplimiento" value={`${completionPct}%`} icon={<CheckCircle size={24} />} color="green" />
      </div>

      {/* Progreso mensual */}
      {(monthTotal > 0 || targetVisits > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" />
              Progreso de {MONTH_NAMES[viewMonth - 1]}
            </h3>
            <span className="text-sm font-bold text-gray-700">
              {isCurrentMonth && targetVisits > 0
                ? `${monthCompleted} / ${targetVisits} visitas`
                : `${completionPct}%`}
            </span>
          </div>
          {isCurrentMonth && targetVisits > 0 ? (
            (() => {
              const pct = Math.min(100, Math.round((monthCompleted / targetVisits) * 100));
              const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-orange-400';
              return (
                <>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{monthCompleted} completadas · {monthMissed} perdidas</span>
                    <span className="font-semibold text-gray-600">{pct}% del objetivo</span>
                  </div>
                </>
              );
            })()
          ) : (
            <>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${completionPct >= 80 ? 'bg-green-500' : completionPct >= 50 ? 'bg-blue-500' : 'bg-orange-400'}`}
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{monthCompleted} completadas</span>
                <span>{monthMissed} perdidas</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Efectividad del mes */}
      {loadingDetail ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
        </div>
      ) : effectiveness && effectiveness.total_assigned > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <Target size={16} className="text-indigo-500" />
            Efectividad — {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {/* Ring principal */}
            {(() => {
              const rate = effectiveness.conversion_rate;
              const color = rate >= 70 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444';
              const r = 30; const circ = 2 * Math.PI * r;
              return (
                <div className="flex flex-col items-center gap-1 col-span-1">
                  <svg width={76} height={76} viewBox="0 0 76 76">
                    <circle cx={38} cy={38} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
                    <circle cx={38} cy={38} r={r} fill="none" stroke={color} strokeWidth={8}
                      strokeDasharray={`${(rate / 100) * circ} ${circ}`}
                      strokeLinecap="round" transform="rotate(-90 38 38)" />
                    <text x={38} y={43} textAnchor="middle" fontSize={14} fontWeight="700" fill={color}>{rate}%</text>
                  </svg>
                  <p className="text-xs text-gray-500 text-center leading-tight">Visitados<br/>prescribiendo</p>
                </div>
              );
            })()}
            {/* Contadores */}
            <div className="col-span-2 grid grid-cols-2 gap-2">
              {[
                { label: 'Médicos asignados', value: effectiveness.total_assigned, color: 'text-gray-700', bg: 'bg-gray-50' },
                { label: 'Visitados', value: effectiveness.doctors_visited, color: 'text-blue-700', bg: 'bg-blue-50' },
                { label: 'Con prescripciones', value: effectiveness.doctors_with_sales, color: 'text-green-700', bg: 'bg-green-50' },
                { label: 'Visitados + prescripción', value: effectiveness.doctors_visited_with_sales, color: 'text-indigo-700', bg: 'bg-indigo-50' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-lg p-2.5 text-center`}>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500 leading-tight mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Tasa de visita */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Cobertura de médicos</span>
                <span className="font-semibold text-gray-700">{effectiveness.visit_rate}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${effectiveness.visit_rate >= 70 ? 'bg-green-500' : effectiveness.visit_rate >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${effectiveness.visit_rate}%` }} />
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Penetración total</span>
                <span className="font-semibold text-gray-700">{effectiveness.penetration_rate}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${effectiveness.penetration_rate >= 70 ? 'bg-green-500' : effectiveness.penetration_rate >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${effectiveness.penetration_rate}%` }} />
              </div>
            </div>
          </div>
          {effectiveness.visit_rate < 50 && isCurrentMonth && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-2">
              ⚠️ Solo has visitado el {effectiveness.visit_rate}% de tus médicos. ¡Intensifica las visitas!
            </p>
          )}
        </div>
      )}

      {/* Alerta visitas perdidas — solo mes actual */}
      {isCurrentMonth && monthMissed > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle size={20} className="text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">
            Tienes <span className="font-semibold">{monthMissed}</span> visita(s) perdida(s) este mes
          </p>
        </div>
      )}

      {/* Próximas visitas — solo mes actual */}
      {isCurrentMonth && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Próximas Visitas esta Semana</h2>
          {(stats?.upcoming_visits ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No hay visitas programadas esta semana</p>
          ) : (
            <div className="space-y-3">
              {stats?.upcoming_visits.map(v => (
                <div key={v.visit_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm">
                      {v.doctor_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{v.doctor_name}</p>
                      <p className="text-xs text-gray-500">{v.doctor_specialty || 'Sin especialidad'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">{format(new Date(v.scheduled_date), "d MMM", { locale: es })}</p>
                      <p className="text-xs text-gray-400">{format(new Date(v.scheduled_date), "HH:mm")}</p>
                    </div>
                    <span className="badge-scheduled">Programada</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visitas del mes histórico */}
      {!isCurrentMonth && monthDetail && monthDetail.month.visits.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Visitas de {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {monthDetail.month.visits.map(v => (
              <div key={v.visit_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-semibold text-sm">
                    {v.doctor_name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{v.doctor_name}</p>
                    <p className="text-xs text-gray-400">{format(new Date(v.scheduled_date), "d MMM", { locale: es })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {v.notes && <span className="text-xs text-gray-400 italic hidden sm:inline">📝 {v.notes.slice(0, 30)}</span>}
                  {statusBadge(v.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
