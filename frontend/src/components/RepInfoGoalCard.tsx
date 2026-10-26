import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Target, ChevronRight, CalendarClock, TrendingUp, Zap, Trophy } from 'lucide-react';
import type { RepDataCompleteness } from '../types';
import { FIELD_LABELS } from '../utils/doctorInfo';

const REASON_LABELS: Record<string, { text: string; icon: typeof Zap; cls: string }> = {
  visit: { text: 'Lo visitas pronto', icon: CalendarClock, cls: 'bg-blue-50 text-blue-700' },
  sales: { text: 'Te compra', icon: TrendingUp, cls: 'bg-green-50 text-green-700' },
  quick: { text: 'Falta solo 1 dato', icon: Zap, cls: 'bg-amber-50 text-amber-700' },
};

function fmtVisit(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function RepInfoGoalCard({ data }: { data: RepDataCompleteness }) {
  const navigate = useNavigate();
  const pct = data.pct_complete;
  const ringColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  const r = 30, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;

  const goal = data.weekly_goal;
  const done = data.done_this_week;
  const goalPct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 100;
  const goalMet = goal > 0 && done >= goal;
  const allDone = data.pending === 0 && data.total > 0;

  const openDoctor = (id: number) => navigate(`/rep/doctors?completar=${id}`);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardCheck size={18} className="text-indigo-500" />
          Información de mis médicos
        </h2>
        {data.pending > 0 && (
          <button
            onClick={() => navigate('/rep/doctors?filtro=incompletos')}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5"
          >
            Ver {data.pending} pendientes <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* % completo */}
        <div className="flex items-center gap-4">
          <svg width={76} height={76} viewBox="0 0 76 76" className="shrink-0">
            <circle cx={38} cy={38} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
            <circle cx={38} cy={38} r={r} fill="none" stroke={ringColor} strokeWidth={8}
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 38 38)" />
            <text x={38} y={43} textAnchor="middle" fontSize={15} fontWeight="700" fill={ringColor}>{Math.round(pct)}%</text>
          </svg>
          <div>
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{data.complete}</span> de <span className="font-semibold">{data.total}</span> médicos con datos completos
            </p>
            <p className="text-xs text-gray-400 mt-1">Teléfono, correo, centro médico y especialidad</p>
          </div>
        </div>

        {/* Meta semanal */}
        <div className={`rounded-lg p-4 ${allDone || goalMet ? 'bg-green-50' : 'bg-indigo-50'}`}>
          {allDone ? (
            <p className="text-sm font-semibold text-green-700 flex items-center gap-2">
              <Trophy size={16} /> ¡Todos tus médicos están completos!
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-sm font-semibold flex items-center gap-1.5 ${goalMet ? 'text-green-700' : 'text-indigo-800'}`}>
                  {goalMet ? <Trophy size={15} /> : <Target size={15} />}
                  Meta de la semana
                </p>
                <span className={`text-sm font-bold ${goalMet ? 'text-green-700' : 'text-indigo-700'}`}>{done}/{goal}</span>
              </div>
              <div className="h-2.5 bg-white rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${goalMet ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${goalPct}%` }} />
              </div>
              <p className="text-xs mt-2 text-gray-600">
                {goalMet
                  ? '¡Meta cumplida! Cada médico extra suma.'
                  : `Completa ${goal - done} médico${goal - done !== 1 ? 's' : ''} más antes del domingo.`}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Sugerencias */}
      {data.suggestions.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Te sugerimos completar</p>
          <div className="space-y-2">
            {data.suggestions.map(s => (
              <button
                key={s.id}
                onClick={() => openDoctor(s.id)}
                className="w-full text-left bg-gray-50 hover:bg-indigo-50 rounded-lg px-4 py-3 flex items-center gap-3 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{s.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.missing.map(f => (
                      <span key={f} className="text-[11px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Falta {FIELD_LABELS[f].toLowerCase()}</span>
                    ))}
                    {s.reasons.filter(r => REASON_LABELS[r]).map(r => {
                      const R = REASON_LABELS[r];
                      const Icon = R.icon;
                      return (
                        <span key={r} className={`text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1 ${R.cls}`}>
                          <Icon size={11} />
                          {r === 'visit' && s.next_visit ? `Visita ${fmtVisit(s.next_visit)}` : R.text}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <span className="text-xs font-medium text-indigo-600 shrink-0 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                  Completar <ChevronRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
