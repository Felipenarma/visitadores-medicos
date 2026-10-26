import { TrendingDown } from 'lucide-react';

/** Extrae "2 vs 6" desde la nota automática: "Venta baja: 2 uds este mes vs 6 al día ..." */
export function lowSalesFigures(notes?: string | null): string | null {
  const m = (notes || '').match(/Venta baja:\s*(\d+)\s*uds este mes vs\s*(\d+)/);
  return m ? `${m[1]} vs ${m[2]} uds` : null;
}

export default function LowSalesBadge({ notes, compact = false }: { notes?: string | null; compact?: boolean }) {
  const fig = lowSalesFigures(notes);
  return (
    <span
      title="Agendada automáticamente: este médico lleva menos recetas que a la misma fecha del mes anterior"
      className="inline-flex items-center gap-1 text-[11px] font-medium bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded whitespace-nowrap"
    >
      <TrendingDown size={11} />
      {compact || !fig ? 'Venta baja' : `Venta baja · ${fig}`}
    </span>
  );
}
