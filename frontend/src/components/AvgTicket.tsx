import type { RepSalesGoal } from '../types';

const clp = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

/** Ticket promedio = venta neta (sin IVA) / recetas del mes, con variación vs mes anterior. */
export default function AvgTicket({ g, compact = false }: { g: RepSalesGoal; compact?: boolean }) {
  const t = g.avg_ticket_net, p = g.prev_avg_ticket_net, ch = g.avg_ticket_change_pct;
  const color = ch == null ? 'text-gray-400' : ch >= 0 ? 'text-green-600' : 'text-red-500';
  return (
    <div className={compact ? '' : 'flex items-baseline gap-3 flex-wrap'}>
      <span className={`${compact ? 'block text-2xl' : 'text-lg'} font-bold text-gray-900`}>{t != null ? clp(t) : '—'}</span>
      <span className="text-xs text-gray-500">
        {g.units} receta{g.units !== 1 ? 's' : ''}
        {p != null && <> · mes anterior {clp(p)}</>}
        {ch != null && <span className={`ml-1 font-semibold ${color}`}>({ch > 0 ? '+' : ''}{ch}%)</span>}
      </span>
    </div>
  );
}
