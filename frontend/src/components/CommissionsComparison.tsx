import React from 'react';
import { TrendingUp, TrendingDown, Minus, CalendarClock } from 'lucide-react';

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
          <p className="text-xs text-gray-400 mt-1">Mismo tramo mes anterior: {fmtCLP(previous.total_amount)}</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Unidades vendidas</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-gray-900">{current.sales_count}</span>
            <DeltaBadge pct={pctChangeUnits} />
          </div>
          <p className="text-xs text-gray-400 mt-1">Mismo tramo mes anterior: {previous.sales_count} u.</p>
        </div>
      </div>
    </div>
  );
}
