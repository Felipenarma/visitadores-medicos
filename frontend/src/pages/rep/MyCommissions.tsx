import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, BarChart2, TrendingUp, UserPlus, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { dashboardApi } from '../../api';
import { useAuth } from '../../context/AuthContext';

interface CategoryBreakdown { [key: string]: number; }

interface DoctorDetail {
  doctor_id: number;
  doctor_name: string;
  rut?: string;
  specialty?: string;
  is_new: boolean;
  units: number;
  amount: number;
  categories: CategoryBreakdown;
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
  doctors_detail: DoctorDetail[];
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const CATEGORY_COLORS: Record<string, string> = {
  'Cannabis Medicinal': 'bg-green-100 text-green-700',
  'Hormonas': 'bg-purple-100 text-purple-700',
  'Fertilidad': 'bg-pink-100 text-pink-700',
  'Pelo': 'bg-yellow-100 text-yellow-700',
  'Producto Terminado': 'bg-gray-100 text-gray-700',
  'Dermatología': 'bg-orange-100 text-orange-700',
  'Control de Peso': 'bg-red-100 text-red-700',
  'Suero Terapia': 'bg-blue-100 text-blue-700',
};

export default function MyCommissions() {
  const { user } = useAuth();
  const [data, setData] = useState<RepCommissionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showDoctors, setShowDoctors] = useState(false);

  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (isCurrentMonth) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  useEffect(() => {
    if (!user?.rep_id) return;
    setLoading(true);
    (dashboardApi as any).getRepCommissions(month, year)
      .then((res: RepCommissionItem[]) => {
        const mine = res.find((r: RepCommissionItem) => r.rep_id === user.rep_id) ?? null;
        setData(mine);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month, year, user?.rep_id]);

  const catEntries = data ? Object.entries(data.categories).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Comisiones</h1>
          <p className="text-sm text-gray-500">Rendimiento mensual en unidades vendidas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[140px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className={`p-1.5 rounded-lg border border-gray-200 ${isCurrentMonth ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-50'}`}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-gray-400">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay ventas registradas para este período</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl p-5 text-white shadow-sm" style={{ backgroundColor: '#0F1E2D' }}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="opacity-70" />
                <p className="text-sm opacity-70">Unidades totales</p>
              </div>
              <p className="text-3xl font-bold">{data.sales_count.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Users size={16} className="text-gray-400" />
                <p className="text-sm text-gray-500">Médicos con ventas</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{data.doctors_with_sales}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus size={16} className="text-green-500" />
                <p className="text-sm text-gray-500">Médicos nuevos</p>
              </div>
              <p className="text-3xl font-bold text-green-600">{data.new_doctors_count}</p>
            </div>
          </div>

          {/* Categorías */}
          {catEntries.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-3 text-sm">Unidades por categoría</h2>
              <div className="space-y-2">
                {catEntries.map(([cat, count]) => {
                  const pct = Math.round((count / data.sales_count) * 100);
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-600'}`}>{cat}</span>
                        <span className="font-semibold text-gray-700">{count} u · {pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detalle de médicos */}
          {data.doctors_detail && data.doctors_detail.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowDoctors(!showDoctors)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Users size={15} className="text-blue-500" />
                  Médicos con ventas este mes ({data.doctors_with_sales})
                </span>
                {showDoctors ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {showDoctors && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Médico</th>
                        <th className="text-left px-4 py-2.5 text-gray-500 font-medium hidden sm:table-cell">Especialidad</th>
                        <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Unidades</th>
                        <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Categorías</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.doctors_detail.sort((a, b) => b.units - a.units).map(doc => (
                        <tr key={doc.doctor_id} className="border-t border-gray-50 hover:bg-blue-50 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{doc.doctor_name}</span>
                              {doc.is_new && (
                                <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full flex-shrink-0">NUEVO</span>
                              )}
                            </div>
                            {doc.rut && <p className="text-gray-400 text-xs">{doc.rut}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">
                            {doc.specialty || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-gray-800">{doc.units}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(doc.categories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                                <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-600'}`}>
                                  {cat.split(' ')[0]}: {count}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
