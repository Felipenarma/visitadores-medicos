import React from 'react';
import { TrendingUp, TrendingDown, Minus, CalendarClock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PeriodStats {
  total_amount: number;
  sales_count: number;
  doctors_with_sales: number;
}

interface Period {
  start: string;
  end: string;
}

export interface CommissionsComparisonProps {
  current: PeriodStats;
  previous: PeriodStats;
  pctChangeAmount: number | null;
  pctChangeUnits: number | null;
  currentPeriod: Period;
  previousPeriod: Period;
  isCurrentMonth: boolean;
  title?: string;
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const fmtCLP = (v: number) => '$' + Math.round(v / 1.19).toLocaleString('es-CL');
const fmtCLPShort = (v: number) => {
  const n = v / 1.19;
  return n >= 1000000 ? '$' + (n / 1000000).toFixed(1) + 'M' : '$' + Math.round(n / 1000) + 'K';
};

function formatRange(p: Period): string {
  const [, m, d] = p.start.split('-').map(Number);
  const [, , dEnd] = p.end.split('-').map(Number);
  if (d === dEnd) return `${d} de ${MONTH_NAMES[m - 1]}`;
  return `${d} al ${dEnd} de ${MONTH_NAMES[m - 1]}`;
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
        <Minus size={12} /> sin datos previos
      </span>
    );
  }
  const up = pct > 0;
  const flat = pct === 0;
  const color = flat ? 'text-gray-400' : up ? 'text-emerald-600' : 'text-red-500';
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${color}`}>
      <Icon size={12} />
      {up && !flat ? '+' : ''}{pct}%
    </span>
  );
}

function MiniComparisonChart({ label, currentValue, previousValue, formatter }: { label: string; currentValue: number; previousValue: number; formatter: (v: number) => string }) {
  const data = [
    { name: 'Este tramo', value: currentValue },
    { name: 'Mes anterior', value: previousValue },
  ];
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-1 text-center">{label}</p>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[0, (max: number) => max * 1.15]} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 11 }}
            formatter={(v: number) => [formatter(v), '']}
            labelFormatter={() => ''}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
            <Cell fill="#3B82F6" />
            <Cell fill="#CBD5E1" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function CommissionsComparison({
  current, previous, pctChangeAmount, pctChangeUnits, currentPeriod, previousPeriod, isCurrentMonth, title,
}: CommissionsComparisonProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock size={16} className="text-blue-500" />
        <h2 className="font-semibold text-gray-700 text-sm">{title || 'Seguimiento vs. mes anterior'}</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {isCurrentMonth ? 'Avance del mes en curso' : 'Mes completo'} ({formatRange(currentPeriod)}) comparado con el mismo tramo de días del mes anterior ({formatRange(previousPeriod)})
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Venta neta (sin IVA)</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-gray-900">{fmtCLP(current.total_amount)}</span>
            <DeltaBadge pct={pctChangeAmount} />
          </div>
          <p className="text-xs text-gray-400 mt-1 mb-2">Mismo tramo mes anterior: {fmtCLP(previous.total_amount)}</p>
          <MiniComparisonChart
            label="Venta neta"
            currentValue={current.total_amount / 1.19}
            previousValue={previous.total_amount / 1.19}
            formatter={(v) => '$' + Math.round(v).toLocaleString('es-CL')}
          />
        </div>
        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Unidades vendidas</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-gray-900">{current.sales_count}</span>
            <DeltaBadge pct={pctChangeUnits} />
          </div>
          <p className="text-xs text-gray-400 mt-1 mb-2">Mismo tramo mes anterior: {previous.sales_count} u.</p>
          <MiniComparisonChart
            label="Unidades"
            currentValue={current.sales_count}
            previousValue={previous.sales_count}
            formatter={(v) => `${Math.round(v)} u.`}
          />
        </div>
      </div>
    </div>
  );
}
