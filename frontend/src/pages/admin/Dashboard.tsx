import React, { useEffect, useState } from 'react';
import { Users, Stethoscope, Calendar, TrendingUp, CheckCircle, XCircle, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import StatCard from '../../components/StatCard';
import { dashboardApi, seedApi } from '../../api';
import type { DashboardStats, TodayVisit } from '../../types';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayVisits, setTodayVisits] = useState<TodayVisit[]>([]);
  const [visitsByRep, setVisitsByRep] = useState<{ rep_name: string; visits: number }[]>([]);
  const [salesByLine, setSalesByLine] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [trackingDate, setTrackingDate] = useState(new Date());
  const [dailyTracking, setDailyTracking] = useState<{
    date: string;
    reps: { rep_id: number; rep_name: string; total: number; completed: number; pending: number; missed: number; completion_rate: number }[];
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, t, vr, sl] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getTodayVisits(),
        dashboardApi.getVisitsByRep(),
        dashboardApi.getSalesByBusinessLine(),
      ]);
      setStats(s);
      setTodayVisits(t);
      setVisitsByRep(vr);
      setSalesByLine(sl);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTracking = async (date: Date) => {
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dt = await dashboardApi.getDailyTracking(dateStr);
      setDailyTracking(dt);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadTracking(trackingDate); }, [trackingDate]);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMsg('');
    try {
      const res = await seedApi.seed();
      setSeedMsg(`Datos creados: ${res.reps_created} visitadores, ${res.doctors_created} médicos, ${res.visits_created} visitas`);
      load();
    } catch (e: any) {
      setSeedMsg('Error al crear datos de muestra');
    } finally {
      setSeeding(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          {seeding ? 'Cargando...' : 'Generar datos de muestra'}
        </button>
      </div>

      {seedMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
          {seedMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Médicos"
          value={stats?.total_doctors ?? 0}
          icon={<Stethoscope size={24} />}
          color="blue"
        />
        <StatCard
          title="Visitadores Activos"
          value={stats?.active_reps ?? 0}
          icon={<Users size={24} />}
          color="green"
        />
        <StatCard
          title="Visitas Hoy"
          value={stats?.visits_today ?? 0}
          icon={<Calendar size={24} />}
          color="purple"
        />
        <StatCard
          title="Visitas esta Semana"
          value={stats?.visits_this_week ?? 0}
          icon={<TrendingUp size={24} />}
          color="orange"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Visitas"
          value={stats?.total_visits ?? 0}
          icon={<Calendar size={24} />}
          color="blue"
        />
        <StatCard
          title="Visitas Completadas"
          value={stats?.completed_visits ?? 0}
          icon={<CheckCircle size={24} />}
          color="green"
        />
        <StatCard
          title="Visitas Perdidas"
          value={stats?.missed_visits ?? 0}
          icon={<XCircle size={24} />}
          color="red"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visits by rep */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Visitas por Visitador (este mes)</h2>
          {visitsByRep.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={visitsByRep}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="rep_name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="visits" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Visitas" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-400 text-sm">
              No hay datos de visitas
            </div>
          )}
        </div>

        {/* Sales by business line */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Ventas por Línea de Negocio</h2>
          {salesByLine.filter(s => s.value > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={salesByLine.filter(s => s.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {salesByLine.filter(s => s.value > 0).map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-400 text-sm">
              No hay datos de ventas
            </div>
          )}
        </div>
      </div>

      {/* Daily Tracking by Rep */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Seguimiento Diario por Visitador</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTrackingDate(d => subDays(d, 1))}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
              {format(trackingDate, "EEEE d MMM", { locale: es })}
            </span>
            <button
              onClick={() => setTrackingDate(d => addDays(d, 1))}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight size={18} className="text-gray-600" />
            </button>
            <button
              onClick={() => setTrackingDate(new Date())}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1"
            >
              Hoy
            </button>
          </div>
        </div>

        {!dailyTracking || dailyTracking.reps.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No hay visitas programadas para este día</p>
        ) : (
          <div className="space-y-3">
            {dailyTracking.reps.map((rep) => (
              <div key={rep.rep_id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-700 font-semibold text-sm">{rep.rep_name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{rep.rep_name}</p>
                      <p className="text-xs text-gray-500">{rep.completed} de {rep.total} visitas completadas</p>
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${
                    rep.completion_rate === 100 ? 'text-green-600' :
                    rep.completion_rate >= 50 ? 'text-yellow-600' :
                    rep.completion_rate > 0 ? 'text-orange-500' : 'text-gray-400'
                  }`}>
                    {rep.completion_rate}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="flex h-2.5 rounded-full overflow-hidden">
                    {rep.completed > 0 && (
                      <div className="bg-green-500 h-full" style={{ width: `${(rep.completed / rep.total) * 100}%` }} />
                    )}
                    {rep.missed > 0 && (
                      <div className="bg-red-400 h-full" style={{ width: `${(rep.missed / rep.total) * 100}%` }} />
                    )}
                  </div>
                </div>
                {/* Status pills */}
                <div className="flex gap-3 mt-2 text-xs">
                  {rep.completed > 0 && (
                    <span className="flex items-center gap-1 text-green-700">
                      <CheckCircle size={12} /> {rep.completed} completadas
                    </span>
                  )}
                  {rep.pending > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Clock size={12} /> {rep.pending} pendientes
                    </span>
                  )}
                  {rep.missed > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle size={12} /> {rep.missed} perdidas
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's visits */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Visitas de Hoy</h2>
        {todayVisits.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No hay visitas programadas para hoy</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Médico</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Especialidad</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Visitador</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Hora</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {todayVisits.map((v) => (
                  <tr key={v.visit_id} className="hover:bg-gray-50">
                    <td className="py-3 px-2 font-medium text-gray-900">{v.doctor_name}</td>
                    <td className="py-3 px-2 text-gray-500">{v.doctor_specialty || '—'}</td>
                    <td className="py-3 px-2 text-gray-600">{v.rep_name}</td>
                    <td className="py-3 px-2 text-gray-500">
                      {v.scheduled_date ? format(new Date(v.scheduled_date), 'HH:mm') : '—'}
                    </td>
                    <td className="py-3 px-2">{statusBadge(v.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
