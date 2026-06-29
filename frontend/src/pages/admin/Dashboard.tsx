import React, { useEffect, useState } from 'react';
import { Users, Stethoscope, Calendar, TrendingUp, CheckCircle, XCircle, ChevronLeft, ChevronRight, Clock, UserPlus, AlertTriangle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import StatCard from '../../components/StatCard';
import { dashboardApi, seedApi } from '../../api';
import type { DashboardStats, TodayVisit } from '../../types';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

type SalesByDoctorItem = {
  doctor_name: string;
  rut: string;
  rep_name: string;
  units_current: number;
  units_prev: number;
  amount_current: number;
  amount_prev: number;
};

type NewDoctorItem = {
  rut_doctor: string;
  doctor_name: string;
  specialty: string | null;
  primera_venta: string | null;
  rep_name: string | null;
  productos: string[];
  total_amount: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayVisits, setTodayVisits] = useState<TodayVisit[]>([]);
  const [visitsByRep, setVisitsByRep] = useState<{ rep_name: string; completed: number; total: number }[]>([]);
  const [salesByLine, setSalesByLine] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [chartMonth, setChartMonth] = useState(new Date().getMonth() + 1);
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const [salesMonth, setSalesMonth] = useState(new Date().getMonth() + 1);
  const [salesYear, setSalesYear] = useState(new Date().getFullYear());
  const [salesByDoctor, setSalesByDoctor] = useState<SalesByDoctorItem[]>([]);
  const [newDoctors, setNewDoctors] = useState<NewDoctorItem[]>([]);
  const [trackingDate, setTrackingDate] = useState(new Date());
  const [dailyTracking, setDailyTracking] = useState<{
    date: string;
    reps: { rep_id: number; rep_name: string; total: number; completed: number; pending: number; missed: number; completion_rate: number }[];
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, t, sl] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getTodayVisits(),
        dashboardApi.getSalesByBusinessLine(),
      ]);
      setStats(s);
      setTodayVisits(t);
      setSalesByLine(sl);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadChartData = async () => {
    try {
      const vr = await dashboardApi.getVisitsByRep(chartMonth, chartYear);
      setVisitsByRep(vr);
    } catch (e) { console.error(e); }
  };

  const loadSalesData = async () => {
    try {
      const [sd, nd] = await Promise.all([
        dashboardApi.getSalesByDoctor(salesMonth, salesYear),
        dashboardApi.getNewDoctors(salesMonth, salesYear),
      ]);
      setSalesByDoctor(sd);
      setNewDoctors(nd);
    } catch (e) { console.error(e); }
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
  useEffect(() => { loadChartData(); }, [chartMonth, chartYear]);
  useEffect(() => { loadSalesData(); }, [salesMonth, salesYear]);
  useEffect(() => { loadTracking(trackingDate); }, [trackingDate]);

  const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const prevMonth = () => {
    if (chartMonth === 1) { setChartMonth(12); setChartYear(y => y - 1); }
    else setChartMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (chartMonth === 12) { setChartMonth(1); setChartYear(y => y + 1); }
    else setChartMonth(m => m + 1);
  };

  const prevSalesMonth = () => {
    if (salesMonth === 1) { setSalesMonth(12); setSalesYear(y => y - 1); }
    else setSalesMonth(m => m - 1);
  };
  const nextSalesMonth = () => {
    if (salesMonth === 12) { setSalesMonth(1); setSalesYear(y => y + 1); }
    else setSalesMonth(m => m + 1);
  };

  const prevMonthLabel = () => {
    const m = salesMonth === 1 ? 12 : salesMonth - 1;
    return MONTH_NAMES[m - 1];
  };

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

      {/* Alertas de inactividad */}
      {(() => {
        const now = new Date();
        const inactivos = visitsByRep.filter(r => r.completed === 0);
        if (inactivos.length === 0) return null;
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-amber-600" />
              <h3 className="font-semibold text-amber-800">
                {inactivos.length} visitador{inactivos.length > 1 ? 'es' : ''} sin visitas completadas en {MONTH_NAMES[chartMonth - 1]}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {inactivos.map(r => (
                <span key={r.rep_id} className="inline-flex items-center gap-1.5 bg-white border border-amber-200 text-amber-700 text-sm px-3 py-1 rounded-full font-medium">
                  <span className="w-2 h-2 bg-amber-400 rounded-full" />
                  {r.rep_name}
                  {r.total > 0 && <span className="text-amber-400 text-xs">({r.total} prog.)</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visits by rep */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Visitas por Visitador</h2>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft size={18} className="text-gray-600" />
              </button>
              <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
                {MONTH_NAMES[chartMonth - 1]} {chartYear}
              </span>
              <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronRight size={18} className="text-gray-600" />
              </button>
            </div>
          </div>
          {visitsByRep.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={visitsByRep}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="rep_name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" fill="#22c55e" radius={[4, 4, 0, 0]} name="Completadas" />
                <Bar dataKey="total" fill="#d1d5db" radius={[4, 4, 0, 0]} name="Total programadas" />
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Unidades por Línea de Negocio</h2>
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
                <Tooltip formatter={(v: number) => [`${v.toLocaleString()} unidades`]} />
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

      {/* Ventas por Doctor — mes actual vs anterior */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Unidades por Médico</h2>
            <p className="text-xs text-gray-400 mt-0.5">Top 20 médicos por unidades vendidas</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevSalesMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[130px] text-center">
              {MONTH_NAMES[salesMonth - 1]} {salesYear}
            </span>
            <button onClick={nextSalesMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
        </div>

        {salesByDoctor.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            No hay datos de ventas para este período
          </div>
        ) : (
          <>
            {/* Leyenda */}
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
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="doctor_name"
                  width={160}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 21) + '…' : v}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(value: number, name: string) => [
                    `${value} unidades`,
                    name === 'units_current'
                      ? `${MONTH_NAMES[salesMonth - 1]} ${salesYear}`
                      : prevMonthLabel()
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

      {/* Médicos nuevos prescriptores */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <UserPlus size={18} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Nuevos Médicos Prescriptores</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Médicos que prescriben a Narma por primera vez en {MONTH_NAMES[salesMonth - 1]} {salesYear}
              </p>
            </div>
          </div>
          <span className="text-2xl font-bold text-emerald-600">{newDoctors.length}</span>
        </div>

        {newDoctors.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">
            No hay nuevos prescriptores en este período
          </p>
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
                          <span className="text-emerald-700 font-semibold text-xs">
                            {d.doctor_name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{d.doctor_name}</p>
                          {d.rut_doctor && (
                            <p className="text-xs text-gray-400">{d.rut_doctor}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">{d.specialty || '—'}</td>
                    <td className="py-2.5 px-3">
                      {d.rep_name ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {d.rep_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">
                      {d.primera_venta
                        ? format(new Date(d.primera_venta), "d MMM yyyy", { locale: es })
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {d.productos.slice(0, 3).map((p, pi) => (
                          <span key={pi} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {p}
                          </span>
                        ))}
                        {d.productos.length > 3 && (
                          <span className="text-xs text-gray-400">+{d.productos.length - 3}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
