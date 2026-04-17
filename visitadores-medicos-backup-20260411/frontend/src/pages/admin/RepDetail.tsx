import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, MapPin, Phone, Mail, Users,
  CheckCircle, XCircle, Clock, AlertCircle, Calendar
} from 'lucide-react';
import { dashboardApi } from '../../api';
import type { RepDetail, RepDetailPeriod, RepDetailVisit } from '../../types';

// ─── helpers ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completada',
  missed: 'Perdida',
  scheduled: 'Pendiente',
  cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  missed: 'bg-red-100 text-red-700',
  scheduled: 'bg-blue-100 text-blue-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('es-CL', opts)} – ${e.toLocaleDateString('es-CL', opts)}`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatBadge({
  icon: Icon, label, value, colorClass,
}: { icon: React.ElementType; label: string; value: number; colorClass: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl p-4 ${colorClass}`}>
      <Icon size={20} className="mb-1 opacity-70" />
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs mt-0.5 text-center leading-tight">{label}</span>
    </div>
  );
}

function RateRing({ rate }: { rate: number }) {
  const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444';
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ;

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={36} cy={36} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
        <circle
          cx={36} cy={36} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text x={36} y={40} textAnchor="middle" fontSize={14} fontWeight="700" fill={color}>
          {rate}%
        </text>
      </svg>
      <span className="text-xs text-gray-500 mt-1">Completitud</span>
    </div>
  );
}

function PeriodSection({ title, period, dateRange }: {
  title: string;
  period: RepDetailPeriod;
  dateRange: string;
}) {
  const [filter, setFilter] = useState<'all' | 'completed' | 'missed' | 'scheduled' | 'cancelled'>('all');

  const filtered = filter === 'all'
    ? period.visits
    : period.visits.filter(v => v.status === filter);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Calendar size={16} className="text-blue-500" />
            {title}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{dateRange}</p>
        </div>
        <span className="text-sm text-gray-400">{period.total} visitas programadas</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 divide-x divide-gray-100 bg-gray-50">
        <RateRing rate={period.completion_rate} />
        <StatBadge icon={CheckCircle} label="Completadas" value={period.completed} colorClass="text-green-700" />
        <StatBadge icon={Clock} label="Pendientes" value={period.pending} colorClass="text-blue-600" />
        <StatBadge icon={XCircle} label="Perdidas" value={period.missed} colorClass="text-red-600" />
        <StatBadge icon={AlertCircle} label="Canceladas" value={period.cancelled} colorClass="text-gray-500" />
      </div>

      {/* Filter tabs */}
      <div className="px-6 pt-4 flex gap-2 flex-wrap">
        {(['all', 'completed', 'missed', 'scheduled', 'cancelled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? `Todas (${period.total})` : `${STATUS_LABELS[f]} (${period.visits.filter(v => v.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Visit list */}
      <div className="px-6 pb-6 mt-3">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No hay visitas en esta categoría
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(v => <VisitRow key={v.visit_id} visit={v} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function VisitRow({ visit: v }: { visit: RepDetailVisit }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
        <span className="text-blue-600 font-semibold text-sm">
          {v.doctor_name.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 text-sm truncate">{v.doctor_name}</p>
        <p className="text-xs text-gray-400 truncate">
          {[v.doctor_specialty, v.doctor_address].filter(Boolean).join(' · ') || 'Sin especialidad'}
        </p>
      </div>

      {/* Date */}
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-500">{fmtDate(v.scheduled_date)}</p>
        {v.actual_date && v.actual_date !== v.scheduled_date && (
          <p className="text-xs text-green-600">Real: {fmtDate(v.actual_date)}</p>
        )}
      </div>

      {/* Status badge */}
      <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[v.status]}`}>
        {STATUS_LABELS[v.status]}
      </span>

      {/* Notes tooltip */}
      {v.notes && (
        <span className="text-gray-300 text-xs truncate max-w-[120px]" title={v.notes}>
          📝 {v.notes}
        </span>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function RepDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<RepDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    dashboardApi.getRepDetail(Number(id))
      .then(setData)
      .catch(() => setError('No se pudo cargar la información del visitador'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>{error || 'Visitador no encontrado'}</p>
        <button onClick={() => navigate('/admin/reps')} className="mt-4 btn-secondary">
          Volver
        </button>
      </div>
    );
  }

  const { rep, week, month } = data;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/admin/reps')}
          className="mt-1 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-600 font-bold text-lg">
                {rep.name.charAt(0).toUpperCase()}
              </span>
            </div>
            {rep.name}
            <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${rep.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {rep.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </h1>

          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
            {rep.email && (
              <span className="flex items-center gap-1.5">
                <Mail size={13} /> {rep.email}
              </span>
            )}
            {rep.phone && (
              <span className="flex items-center gap-1.5">
                <Phone size={13} /> {rep.phone}
              </span>
            )}
            {(rep.territory || rep.zone) && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} />
                {[rep.territory, rep.zone].filter(Boolean).join(' · ')}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users size={13} /> {rep.doctor_count} médicos asignados
            </span>
          </div>
        </div>
      </div>

      {/* Week section */}
      <PeriodSection
        title="Esta semana"
        period={week}
        dateRange={fmtDateRange(week.start, week.end)}
      />

      {/* Month section */}
      <PeriodSection
        title="Este mes"
        period={month}
        dateRange={fmtDateRange(month.start, month.end)}
      />
    </div>
  );
}
