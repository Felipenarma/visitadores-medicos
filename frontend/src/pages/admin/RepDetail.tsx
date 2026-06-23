import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, MapPin, Phone, Mail, Users,
  CheckCircle, XCircle, Clock, AlertCircle, Calendar, Download,
  ChevronLeft, ChevronRight, TrendingUp, Award
} from 'lucide-react';
import { dashboardApi, doctorsApi } from '../../api';
import type { RepDetail, RepDetailPeriod, RepDetailVisit, RepDoctorRanking } from '../../types';

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

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

function fmtAmount(n: number) {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
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
      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
        <span className="text-blue-600 font-semibold text-sm">
          {v.doctor_name.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 text-sm truncate">{v.doctor_name}</p>
        <p className="text-xs text-gray-400 truncate">
          {[v.doctor_specialty, v.doctor_address].filter(Boolean).join(' · ') || 'Sin especialidad'}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-500">{fmtDate(v.scheduled_date)}</p>
        {v.actual_date && v.actual_date !== v.scheduled_date && (
          <p className="text-xs text-green-600">Real: {fmtDate(v.actual_date)}</p>
        )}
      </div>
      <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[v.status]}`}>
        {STATUS_LABELS[v.status]}
      </span>
      {v.notes && (
        <span className="text-gray-300 text-xs truncate max-w-[120px]" title={v.notes}>
          📝 {v.notes}
        </span>
      )}
    </div>
  );
}

function DoctorRankingSection({ ranking, monthLabel }: { ranking: RepDoctorRanking[]; monthLabel: string }) {
  if (ranking.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Award size={16} className="text-amber-500" />
            Ranking de Médicos — {monthLabel}
          </h2>
        </div>
        <div className="text-center py-12 text-gray-400 text-sm">
          Sin ventas registradas para este período
        </div>
      </div>
    );
  }

  const maxUnits = ranking[0]?.units || 1;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Award size={16} className="text-amber-500" />
          Ranking de Médicos — {monthLabel}
        </h2>
        <span className="text-sm text-gray-400">{ranking.length} médicos con ventas</span>
      </div>

      {/* Summary bar */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-6 text-sm">
        <span className="text-gray-500">
          Total unidades: <span className="font-semibold text-gray-800">{ranking.reduce((s, d) => s + d.units, 0)}</span>
        </span>
        <span className="text-gray-500">
          Total ventas: <span className="font-semibold text-gray-800">{fmtAmount(ranking.reduce((s, d) => s + d.total_amount, 0))}</span>
        </span>
      </div>

      <div className="divide-y divide-gray-50">
        {ranking.map((doc, idx) => (
          <div key={doc.doctor_id ?? doc.doctor_name} className="px-6 py-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-4">
              {/* Rank badge */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                idx === 0 ? 'bg-amber-100 text-amber-700' :
                idx === 1 ? 'bg-gray-200 text-gray-600' :
                idx === 2 ? 'bg-orange-100 text-orange-600' :
                'bg-gray-100 text-gray-500'
              }`}>
                {idx + 1}
              </div>

              {/* Doctor info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-800 text-sm truncate">{doc.doctor_name}</p>
                  {doc.rut && <span className="text-xs text-gray-400 shrink-0">{doc.rut}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {doc.specialty && (
                    <span className="text-xs text-gray-400">{doc.specialty}</span>
                  )}
                  {doc.categorias.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {doc.categorias.map(c => (
                        <span key={c} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${(doc.units / maxUnits) * 100}%` }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="text-right shrink-0">
                <p className="font-bold text-gray-800">{doc.units} <span className="text-xs font-normal text-gray-400">uds.</span></p>
                {doc.total_amount > 0 && (
                  <p className="text-xs text-gray-400">{fmtAmount(doc.total_amount)}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Period Navigator ────────────────────────────────────────────────────────

function PeriodNavigator({
  month, year, onChange,
}: {
  month: number;
  year: number;
  onChange: (m: number, y: number) => void;
}) {
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const prev = () => {
    if (month === 1) onChange(12, year - 1);
    else onChange(month - 1, year);
  };

  const next = () => {
    if (isCurrentMonth) return;
    if (month === 12) onChange(1, year + 1);
    else onChange(month + 1, year);
  };

  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
      <button
        onClick={prev}
        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
        {MONTH_NAMES[month - 1]} {year}
      </span>
      <button
        onClick={next}
        disabled={isCurrentMonth}
        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight size={16} />
      </button>
      {!isCurrentMonth && (
        <button
          onClick={() => onChange(now.getMonth() + 1, now.getFullYear())}
          className="ml-1 text-xs text-blue-600 hover:underline"
        >
          Hoy
        </button>
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
  const [exporting, setExporting] = useState(false);

  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(now.getFullYear());

  const handlePeriodChange = (m: number, y: number) => {
    setSelMonth(m);
    setSelYear(y);
  };

  const handleExportDoctors = async () => {
    if (!id) return;
    setExporting(true);
    try {
      const blob = await doctorsApi.exportExcel({ rep_id: Number(id), is_active: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const repName = data?.rep?.name?.replace(/\s+/g, '_') || `rep_${id}`;
      a.download = `medicos_${repName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error al exportar. Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    dashboardApi.getRepDetail(Number(id), selMonth, selYear)
      .then(setData)
      .catch(() => setError('No se pudo cargar la información del visitador'))
      .finally(() => setLoading(false));
  }, [id, selMonth, selYear]);

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

  const { rep, week, month, is_current_month, query_month, query_year, doctor_ranking } = data;
  const monthLabel = `${MONTH_NAMES[query_month - 1]} ${query_year}`;

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
          <div className="flex items-center justify-between gap-4 flex-wrap">
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
            <div className="flex items-center gap-3">
              <PeriodNavigator month={selMonth} year={selYear} onChange={handlePeriodChange} />
              <button
                onClick={handleExportDoctors}
                disabled={exporting}
                className="btn-secondary flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                <Download size={15} />
                {exporting ? 'Exportando...' : 'Exportar médicos'}
              </button>
            </div>
          </div>

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

      {/* Week section — solo en mes actual */}
      {is_current_month && (
        <PeriodSection
          title="Esta semana"
          period={week}
          dateRange={fmtDateRange(week.start, week.end)}
        />
      )}

      {/* Month section */}
      <PeriodSection
        title={is_current_month ? 'Este mes' : monthLabel}
        period={month}
        dateRange={fmtDateRange(month.start, month.end)}
      />

      {/* Doctor ranking */}
      <DoctorRankingSection ranking={doctor_ranking} monthLabel={monthLabel} />
    </div>
  );
}
