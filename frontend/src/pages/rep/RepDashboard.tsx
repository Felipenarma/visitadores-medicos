import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle, XCircle, Users, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import StatCard from '../../components/StatCard';
import { dashboardApi, visitsApi, repsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { RepStats, Visit } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function RepDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<RepStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayVisits, setTodayVisits] = useState<Visit[]>([]);
  const [completing, setCompleting] = useState<number | null>(null);
  const [justCompleted, setJustCompleted] = useState<Set<number>>(new Set());
  const [targetVisits, setTargetVisits] = useState(0);

  const today = format(new Date(), 'yyyy-MM-dd');
  const nowDate = new Date();

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
      // Cargar objetivo sin bloquear si el endpoint no está disponible aún
      repsApi.getTarget(user.rep_id, nowDate.getMonth() + 1, nowDate.getFullYear())
        .then(target => setTargetVisits(target.target_visits ?? 0))
        .catch(() => setTargetVisits(0));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [user?.rep_id]);

  const handleComplete = async (visit: Visit) => {
    setCompleting(visit.id);
    try {
      await visitsApi.update(visit.id, { status: 'completed' });
      setJustCompleted(prev => new Set([...prev, visit.id]));
      setTodayVisits(prev => prev.map(v => v.id === visit.id ? { ...v, status: 'completed' } : v));
      // Refresh stats
      if (user?.rep_id) {
        dashboardApi.getRepStats(user.rep_id).then(setStats).catch(() => {});
      }
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
  const monthTotal = (stats?.completed_this_month ?? 0) + (stats?.missed_this_month ?? 0);
  const completionPct = monthTotal > 0 ? Math.round((stats?.completed_this_month ?? 0) / monthTotal * 100) : 0;

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })} · Bienvenido, {user.name}
        </p>
      </div>

      {/* Resumen del día */}
      {todayVisits.length > 0 && (
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Mis Médicos" value={stats?.doctor_count ?? 0} icon={<Users size={24} />} color="blue" />
        <StatCard title="Visitas Hoy" value={todayVisits.length} icon={<Calendar size={24} />} color="purple" />
        <StatCard title="Esta Semana" value={stats?.visits_this_week ?? 0} icon={<Clock size={24} />} color="orange" />
        <StatCard title="Completadas (mes)" value={stats?.completed_this_month ?? 0} icon={<CheckCircle size={24} />} color="green" />
      </div>

      {/* Progreso mensual */}
      {(monthTotal > 0 || targetVisits > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" /> Progreso del Mes
            </h3>
            <span className="text-sm font-bold text-gray-700">
              {targetVisits > 0
                ? `${stats?.completed_this_month ?? 0} / ${targetVisits} visitas`
                : `${completionPct}%`}
            </span>
          </div>
          {targetVisits > 0 ? (
            <>
              {/* Barra de meta */}
              {(() => {
                const completed = stats?.completed_this_month ?? 0;
                const pct = Math.min(100, Math.round((completed / targetVisits) * 100));
                const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-orange-400';
                return (
                  <>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>{completed} completadas · {stats?.missed_this_month ?? 0} perdidas</span>
                      <span className="font-semibold text-gray-600">{pct}% del objetivo</span>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${completionPct >= 80 ? 'bg-green-500' : completionPct >= 50 ? 'bg-blue-500' : 'bg-orange-400'}`}
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{stats?.completed_this_month ?? 0} completadas</span>
                <span>{stats?.missed_this_month ?? 0} perdidas</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Alerta visitas perdidas */}
      {(stats?.missed_this_month ?? 0) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle size={20} className="text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">
            Tienes <span className="font-semibold">{stats?.missed_this_month}</span> visita(s) perdida(s) este mes
          </p>
        </div>
      )}

      {/* Próximas visitas */}
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
    </div>
  );
}
