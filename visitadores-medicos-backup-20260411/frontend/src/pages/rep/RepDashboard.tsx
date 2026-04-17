import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle, XCircle, Users, Clock } from 'lucide-react';
import StatCard from '../../components/StatCard';
import { dashboardApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { RepStats } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function RepDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<RepStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.rep_id) return;
    setLoading(true);
    dashboardApi.getRepStats(user.rep_id)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.rep_id]);

  if (!user?.rep_id) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg font-medium">ID de visitador no configurado</p>
        <p className="text-sm mt-1">Contacta al administrador</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      scheduled: 'badge-scheduled',
      completed: 'badge-completed',
      missed: 'badge-missed',
      cancelled: 'badge-cancelled',
    };
    const labels: Record<string, string> = {
      scheduled: 'Programada',
      completed: 'Completada',
      missed: 'Perdida',
      cancelled: 'Cancelada',
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Mis Médicos"
          value={stats?.doctor_count ?? 0}
          icon={<Users size={24} />}
          color="blue"
        />
        <StatCard
          title="Visitas Hoy"
          value={stats?.visits_today ?? 0}
          icon={<Calendar size={24} />}
          color="purple"
        />
        <StatCard
          title="Esta Semana"
          value={stats?.visits_this_week ?? 0}
          icon={<Clock size={24} />}
          color="orange"
        />
        <StatCard
          title="Completadas (mes)"
          value={stats?.completed_this_month ?? 0}
          icon={<CheckCircle size={24} />}
          color="green"
        />
      </div>

      {/* Missed */}
      {(stats?.missed_this_month ?? 0) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle size={20} className="text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">
            Tienes <span className="font-semibold">{stats?.missed_this_month}</span> visita(s) perdida(s) este mes
          </p>
        </div>
      )}

      {/* Upcoming visits */}
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
                    <p className="text-sm font-medium text-gray-700">
                      {format(new Date(v.scheduled_date), "d MMM", { locale: es })}
                    </p>
                    <p className="text-xs text-gray-400">
                      {format(new Date(v.scheduled_date), "HH:mm")}
                    </p>
                  </div>
                  {statusBadge(v.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
