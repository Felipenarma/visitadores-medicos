import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Mail, Users,
  CheckCircle, XCircle, Clock, AlertCircle, Calendar, Download,
  ChevronLeft, ChevronRight, Award, Stethoscope, TrendingUp,
  Edit2, X, Building2, Hash
} from 'lucide-react';
import { dashboardApi, doctorsApi, repsApi, businessLinesApi } from '../../api';
import type { RepDetail, RepDetailPeriod, RepDetailVisit, RepDoctorRanking, RepEffectiveness, Doctor, MedicalRep, BusinessLine } from '../../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

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

function EffectivenessCard({ e, monthLabel }: { e: RepEffectiveness; monthLabel: string }) {
  const convColor = e.conversion_rate >= 70 ? 'text-green-600' : e.conversion_rate >= 40 ? 'text-amber-500' : 'text-red-500';
  const penColor  = e.penetration_rate >= 50 ? 'text-green-600' : e.penetration_rate >= 25 ? 'text-amber-500' : 'text-red-500';
  const visColor  = e.visit_rate >= 70 ? 'text-green-600' : e.visit_rate >= 40 ? 'text-amber-500' : 'text-red-500';

  function Ring({ rate, color, label }: { rate: number; color: string; label: string }) {
    const r = 32; const circ = 2 * Math.PI * r;
    const hex = color.includes('green') ? '#22c55e' : color.includes('amber') ? '#f59e0b' : '#ef4444';
    return (
      <div className="flex flex-col items-center gap-1">
        <svg width={80} height={80} viewBox="0 0 80 80">
          <circle cx={40} cy={40} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
          <circle cx={40} cy={40} r={r} fill="none" stroke={hex} strokeWidth={8}
            strokeDasharray={`${(rate / 100) * circ} ${circ}`}
            strokeLinecap="round" transform="rotate(-90 40 40)" />
          <text x={40} y={45} textAnchor="middle" fontSize={15} fontWeight="700" fill={hex}>{rate}%</text>
        </svg>
        <span className="text-xs text-gray-500 text-center leading-tight max-w-[90px]">{label}</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <TrendingUp size={16} className="text-indigo-500" />
          Análisis de Efectividad — {monthLabel}
        </h2>
      </div>

      {/* Rings */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 py-6">
        <div className="flex flex-col items-center gap-1 px-4">
          <Ring rate={e.visit_rate} color={visColor} label="Médicos visitados vs asignados" />
        </div>
        <div className="flex flex-col items-center gap-1 px-4">
          <Ring rate={e.conversion_rate} color={convColor} label="Visitados que generaron recetas" />
        </div>
        <div className="flex flex-col items-center gap-1 px-4">
          <Ring rate={e.penetration_rate} color={penColor} label="Asignados que generaron recetas" />
        </div>
      </div>

      {/* Detail counters */}
      <div className="grid grid-cols-4 divide-x divide-gray-100 border-t border-gray-100 bg-gray-50">
        {[
          { label: 'Médicos asignados', value: e.total_assigned, color: 'text-gray-700' },
          { label: 'Visitados en el período', value: e.doctors_visited, color: visColor },
          { label: 'Generaron recetas', value: e.doctors_with_sales, color: penColor },
          { label: 'Visitados con receta', value: e.doctors_visited_with_sales, color: convColor },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center py-4 px-3">
            <span className={`text-2xl font-bold ${color}`}>{value}</span>
            <span className="text-xs text-gray-400 text-center mt-0.5 leading-tight">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Doctor Edit Modal ───────────────────────────────────────────────────────

interface DoctorForm {
  name: string; specialty: string; medical_center: string;
  address: string; city: string; commune: string;
  phone: string; email: string; rut: string; notes: string;
  visit_frequency: string; rep_id: string; business_line_id: string;
  is_active: boolean;
}

function DoctorEditModal({ doctor, reps, businessLines, onClose, onSaved }: {
  doctor: Doctor;
  reps: MedicalRep[];
  businessLines: BusinessLine[];
  onClose: () => void;
  onSaved: (updated: Doctor) => void;
}) {
  const [form, setForm] = useState<DoctorForm>({
    name: doctor.name || '',
    specialty: doctor.specialty || '',
    medical_center: (doctor as any).medical_center || '',
    address: doctor.address || '',
    city: (doctor as any).city || '',
    commune: (doctor as any).commune || '',
    phone: doctor.phone || '',
    email: doctor.email || '',
    rut: doctor.rut || '',
    notes: doctor.notes || '',
    visit_frequency: String(doctor.visit_frequency ?? 30),
    rep_id: doctor.rep_id ? String(doctor.rep_id) : '',
    business_line_id: doctor.business_line_id ? String(doctor.business_line_id) : '',
    is_active: doctor.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof DoctorForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError('');
    try {
      const updated = await doctorsApi.update(doctor.id, {
        name: form.name.trim(),
        specialty: form.specialty || undefined,
        medical_center: form.medical_center || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        commune: form.commune || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        rut: form.rut || undefined,
        notes: form.notes || undefined,
        visit_frequency: form.visit_frequency ? parseInt(form.visit_frequency) : 30,
        rep_id: form.rep_id ? parseInt(form.rep_id) : undefined,
        business_line_id: form.business_line_id ? parseInt(form.business_line_id) : undefined,
        is_active: form.is_active,
      });
      onSaved(updated);
    } catch {
      setError('Error al guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Stethoscope size={16} className="text-blue-500" />
            Editar médico
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Nombre + RUT */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
              <input value={form.name} onChange={set('name')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Hash size={11} /> RUT</label>
              <input value={form.rut} onChange={set('rut')} placeholder="12.345.678-9" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Especialidad + Centro */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Especialidad</label>
              <input value={form.specialty} onChange={set('specialty')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Building2 size={11} /> Centro médico</label>
              <input value={form.medical_center} onChange={set('medical_center')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Dirección + Ciudad + Comuna */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><MapPin size={11} /> Dirección</label>
              <input value={form.address} onChange={set('address')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ciudad</label>
              <input value={form.city} onChange={set('city')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comuna</label>
              <input value={form.commune} onChange={set('commune')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Teléfono + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Phone size={11} /> Teléfono</label>
              <input value={form.phone} onChange={set('phone')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Mail size={11} /> Email</label>
              <input value={form.email} onChange={set('email')} type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Visitador + Línea + Frecuencia */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Users size={11} /> Visitador</label>
              <select value={form.rep_id} onChange={set('rep_id')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="">Sin asignar</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Línea de negocio</label>
              <select value={form.business_line_id} onChange={set('business_line_id')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                <option value="">Sin línea</option>
                {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Frec. visita (días)</label>
              <input value={form.visit_frequency} onChange={set('visit_frequency')} type="number" min="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>

          {/* Activo */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="rounded" />
            <span className="text-sm text-gray-600">Médico activo</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DoctorListSection({ doctors, repName, onExport, exporting, onDoctorClick }: {
  doctors: Doctor[];
  repName: string;
  onExport: () => void;
  exporting: boolean;
  onDoctorClick: (doc: Doctor) => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Stethoscope size={16} className="text-blue-500" />
          Médicos registrados
          <span className="text-xs font-normal bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{doctors.length}</span>
        </h2>
        <button
          onClick={onExport}
          disabled={exporting}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <Download size={13} />
          {exporting ? 'Exportando...' : 'Exportar Excel'}
        </button>
      </div>
      {doctors.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Sin médicos asignados</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {doctors.map(doc => (
            <div
              key={doc.id}
              onClick={() => onDoctorClick(doc)}
              className="px-6 py-3 flex items-center gap-4 hover:bg-blue-50 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors">
                <span className="text-blue-600 font-semibold text-sm">{doc.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">{doc.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[doc.specialty, (doc as any).medical_center, (doc as any).city].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                </p>
              </div>
              {doc.rut && <span className="text-xs text-gray-400 shrink-0">{doc.rut}</span>}
              {doc.has_sales && (
                <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full shrink-0">Con ventas</span>
              )}
              <Edit2 size={13} className="text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RepDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<RepDetail | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Doctor edit modal
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [allReps, setAllReps] = useState<MedicalRep[]>([]);
  const [allBusinessLines, setAllBusinessLines] = useState<BusinessLine[]>([]);

  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(now.getFullYear());

  // Target state
  const [targetVisits, setTargetVisits] = useState(0);
  const [targetInput, setTargetInput] = useState('');
  const [savingTarget, setSavingTarget] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);

  // Monthly trend state
  const [monthlyTrend, setMonthlyTrend] = useState<{ label: string; completed: number; missed: number; total: number }[]>([]);
  const [loadingTrend, setLoadingTrend] = useState(false);

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

  const saveTarget = async () => {
    if (!id) return;
    const val = parseInt(targetInput);
    if (isNaN(val) || val < 0) return;
    setSavingTarget(true);
    try {
      await repsApi.setTarget(Number(id), { month: selMonth, year: selYear, target_visits: val });
      setTargetVisits(val);
      setEditingTarget(false);
    } catch { /* ignore */ }
    finally { setSavingTarget(false); }
  };

  // Load reps + business lines once for the edit modal
  useEffect(() => {
    Promise.all([repsApi.getAll(), businessLinesApi.getAll()])
      .then(([r, bl]) => { setAllReps(r); setAllBusinessLines(bl); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      dashboardApi.getRepDetail(Number(id), selMonth, selYear),
      doctorsApi.getAll({ rep_id: Number(id), is_active: true }),
    ])
      .then(([detail, docs]) => {
        setData(detail);
        setDoctors(docs);
        setEditingTarget(false);
        // Cargar objetivo independientemente para no bloquear si el endpoint no existe aún
        repsApi.getTarget(Number(id), selMonth, selYear)
          .then(target => {
            setTargetVisits(target.target_visits ?? 0);
            setTargetInput(String(target.target_visits ?? 0));
          })
          .catch(() => { setTargetVisits(0); setTargetInput('0'); });
      })
      .catch(() => setError('No se pudo cargar la información del visitador'))
      .finally(() => setLoading(false));
  }, [id, selMonth, selYear]);

  // Load trend data once on mount (not per period)
  useEffect(() => {
    if (!id) return;
    setLoadingTrend(true);
    dashboardApi.getRepMonthlyTrend(Number(id), 6)
      .then(setMonthlyTrend)
      .catch(() => {})
      .finally(() => setLoadingTrend(false));
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

  const {
    rep, week, month,
    effectiveness,
    is_current_month = true,
    query_month = selMonth,
    query_year = selYear,
    doctor_ranking = [],
  } = data;
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
            <PeriodNavigator month={selMonth} year={selYear} onChange={handlePeriodChange} />
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

      {/* Objetivo mensual */}
      {(() => {
        const completadas = month?.completed ?? 0;
        const pct = targetVisits > 0 ? Math.min(100, Math.round((completadas / targetVisits) * 100)) : 0;
        const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-orange-400';
        return (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-4 flex items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <TrendingUp size={15} className="text-blue-500" />
                  Objetivo {monthLabel}
                </span>
                <span className="text-sm text-gray-500">
                  {completadas} / {targetVisits > 0 ? targetVisits : '—'} visitas completadas
                  {targetVisits > 0 && <span className="ml-2 font-bold text-gray-700">{pct}%</span>}
                </span>
              </div>
              {targetVisits > 0 && (
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            <div className="shrink-0">
              {editingTarget ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={targetInput}
                    onChange={e => setTargetInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditingTarget(false); }}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                  />
                  <button onClick={saveTarget} disabled={savingTarget} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {savingTarget ? '...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditingTarget(false)} className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setTargetInput(String(targetVisits)); setEditingTarget(true); }}
                  className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  {targetVisits > 0 ? 'Editar objetivo' : 'Definir objetivo'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tendencia mensual — últimos 6 meses */}
      {(monthlyTrend.length > 0 || loadingTrend) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" />
              Tendencia de Visitas — Últimos 6 meses
            </h2>
          </div>
          {loadingTrend ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="completed" name="Completadas" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="missed" name="Perdidas" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 1. Análisis de efectividad */}
      {effectiveness && (
        <EffectivenessCard e={effectiveness} monthLabel={monthLabel} />
      )}

      {/* 2. Ranking de médicos por ventas */}
      <DoctorRankingSection ranking={doctor_ranking} monthLabel={monthLabel} />

      {/* 2. Seguimiento de visitas */}
      {is_current_month && (
        <PeriodSection
          title="Esta semana"
          period={week}
          dateRange={fmtDateRange(week.start, week.end)}
        />
      )}
      <PeriodSection
        title={is_current_month ? 'Este mes' : monthLabel}
        period={month}
        dateRange={fmtDateRange(month.start, month.end)}
      />

      {/* 3. Listado de médicos registrados */}
      <DoctorListSection
        doctors={doctors}
        repName={rep.name}
        onExport={handleExportDoctors}
        exporting={exporting}
        onDoctorClick={setSelectedDoctor}
      />

      {/* Doctor edit modal */}
      {selectedDoctor && (
        <DoctorEditModal
          doctor={selectedDoctor}
          reps={allReps}
          businessLines={allBusinessLines}
          onClose={() => setSelectedDoctor(null)}
          onSaved={(updated) => {
            setDoctors(prev => prev.map(d => d.id === updated.id ? updated : d));
            setSelectedDoctor(null);
          }}
        />
      )}
    </div>
  );
}
