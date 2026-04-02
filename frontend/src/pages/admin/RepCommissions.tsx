import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, DollarSign, TrendingUp, UserPlus, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { dashboardApi } from '../../api';

interface CategoryBreakdown {
  [key: string]: number;
}

interface RepCommissionItem {
  rep_id: number;
  rep_name: string;
  doctors_with_sales: number;
  new_doctors: string[];
  new_doctors_count: number;
  total_amount: number;
  sales_count: number;
  categories: CategoryBreakdown;
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const CATEGORY_COLORS: Record<string, string> = {
  'Cannabis Medicinal': 'bg-green-100 text-green-700',
  'Hormonas': 'bg-purple-100 text-purple-700',
  'Fertilidad': 'bg-pink-100 text-pink-700',
  'Pelo': 'bg-yellow-100 text-yellow-700',
  'Naltrexona': 'bg-blue-100 text-blue-700',
  'Producto Terminado': 'bg-gray-100 text-gray-700',
  'Recetario Magistral': 'bg-orange-100 text-orange-700',
};

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl ${color}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  );
}

function RepCard({ item, rank }: { item: RepCommissionItem; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const catEntries = Object.entries(item.categories).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="p-4 flex items-center gap-4">
        {/* Rank badge */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
          style={{ backgroundColor: rank === 1 ? '#F59E0B' : rank === 2 ? '#9CA3AF' : rank === 3 ? '#CD7C2F' : '#0F1E2D' }}
        >
          #{rank}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base truncate">{item.rep_name}</h3>
          <p className="text-xs text-gray-400">{item.sales_count} ventas · {item.doctors_with_sales} médicos activos</p>
        </div>

        {/* Total amount */}
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold" style={{ color: '#0F1E2D' }}>
            ${item.total_amount.toLocaleString('es-CL')}
          </p>
          <p className="text-xs text-gray-400">monto total</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        <StatPill
          label="Médicos activos"
          value={item.doctors_with_sales}
          color="bg-blue-50 text-blue-700"
        />
        <StatPill
          label="Médicos nuevos"
          value={item.new_doctors_count}
          color={item.new_doctors_count > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}
        />
        <StatPill
          label="Ventas"
          value={item.sales_count}
          color="bg-indigo-50 text-indigo-700"
        />
      </div>

      {/* Category pills */}
      {catEntries.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {catEntries.map(([cat, count]) => (
            <span
              key={cat}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-600'}`}
            >
              {cat}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Expand: new doctors list */}
      {item.new_doctors_count > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-2 border-t border-gray-100 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <UserPlus size={14} className="text-green-500" />
              Ver {item.new_doctors_count} médico(s) nuevo(s)
            </span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expanded && (
            <div className="px-4 py-3 bg-green-50 border-t border-green-100">
              <div className="flex flex-wrap gap-2">
                {item.new_doctors.map((name, i) => (
                  <span key={i} className="text-xs bg-white border border-green-200 text-green-700 px-2.5 py-1 rounded-full font-medium">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function RepCommissions() {
  const [data, setData] = useState<RepCommissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  useEffect(() => {
    setLoading(true);
    (dashboardApi as any).getRepCommissions(month, year)
      .then((res: RepCommissionItem[]) => setData(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month, year]);

  const totalAmount = data.reduce((s, r) => s + r.total_amount, 0);
  const totalNewDoctors = data.reduce((s, r) => s + r.new_doctors_count, 0);
  const totalSales = data.reduce((s, r) => s + r.sales_count, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0F1E2D' }}>
            <DollarSign size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Comisiones por Visitador</h1>
            <p className="text-sm text-gray-500">Rendimiento mensual y base de comisiones</p>
          </div>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[140px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Global summary */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl p-4 text-white shadow-sm" style={{ backgroundColor: '#0F1E2D' }}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="opacity-70" />
              <p className="text-sm opacity-70">Venta total del mes</p>
            </div>
            <p className="text-2xl font-bold">${totalAmount.toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-gray-400" />
              <p className="text-sm text-gray-500">Total ventas</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalSales.toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus size={16} className="text-green-500" />
              <p className="text-sm text-gray-500">Médicos nuevos totales</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{totalNewDoctors}</p>
          </div>
        </div>
      )}

      {/* Rep cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: '#4BA5C3' }} />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay datos de ventas para este período</p>
        </div>
      ) : (
        <>
          {/* Comparison table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm">Comparativo de Visitadores</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Visitador</th>
                    <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Ventas</th>
                    <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Médicos activos</th>
                    <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Médicos nuevos</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Monto Total</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium hidden sm:table-cell">% del Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, idx) => (
                    <tr key={item.rep_id} className={`border-t border-gray-100 hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-4 py-3 font-bold text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{item.rep_name}</td>
                      <td className="px-4 py-3 text-center">{item.sales_count}</td>
                      <td className="px-4 py-3 text-center">{item.doctors_with_sales}</td>
                      <td className="px-4 py-3 text-center">
                        {item.new_doctors_count > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                            {item.new_doctors_count}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold" style={{ color: '#0F1E2D' }}>
                        ${item.total_amount.toLocaleString('es-CL')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
                        {totalAmount > 0 ? ((item.total_amount / totalAmount) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200" style={{ backgroundColor: '#E8F4F8' }}>
                    <td colSpan={2} className="px-4 py-3 font-bold text-gray-700">TOTAL</td>
                    <td className="px-4 py-3 text-center font-bold text-gray-700">{totalSales}</td>
                    <td className="px-4 py-3 text-center font-bold text-gray-700">—</td>
                    <td className="px-4 py-3 text-center font-bold text-green-700">{totalNewDoctors}</td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: '#0F1E2D' }}>
                      ${totalAmount.toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-700 hidden sm:table-cell">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Detail cards */}
          <div>
            <h2 className="font-semibold text-gray-700 mb-3">Detalle por Visitador</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.map((item, idx) => (
                <RepCard key={item.rep_id} item={item} rank={idx + 1} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
