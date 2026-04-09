import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, Filter } from 'lucide-react';
import { dashboardApi, repsApi } from '../../api';
import type { MedicalRep } from '../../types';

interface DoctorRankingItem {
  doctor_id: number | null;
  doctor_name: string;
  rut_doctor: string;
  specialty: string | null;
  rep_name: string;
  rep_id: number | null;
  units: number;
  total_amount: number;
  categorias: string[];
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

const MEDALS = ['🥇','🥈','🥉'];

export default function SalesRanking() {
  const [data, setData] = useState<DoctorRankingItem[]>([]);
  const [reps, setReps] = useState<MedicalRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [repFilter, setRepFilter] = useState<string>('');

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  useEffect(() => {
    repsApi.getAll().then(setReps).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    (dashboardApi as any).getDoctorRanking(month, year)
      .then((res: DoctorRankingItem[]) => setData(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month, year]);

  const filtered = repFilter
    ? data.filter(d => d.rep_name === repFilter)
    : data;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0F1E2D' }}>
            <TrendingUp size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ranking de Médicos</h1>
            <p className="text-sm text-gray-500">Unidades vendidas por médico</p>
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

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Filter size={16} className="text-gray-400" />
        <select
          value={repFilter}
          onChange={e => setRepFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los visitadores</option>
          {reps.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          <option value="Sin visitador">Sin visitador</option>
        </select>
        <span className="text-sm text-gray-500">{filtered.length} médicos</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: '#4BA5C3' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay ventas registradas para este período</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#0F1E2D' }}>
                  <th className="text-left px-4 py-3 text-white font-semibold w-12">#</th>
                  <th className="text-left px-4 py-3 text-white font-semibold">Médico</th>
                  <th className="text-left px-4 py-3 text-white font-semibold hidden md:table-cell">Especialidad</th>
                  <th className="text-left px-4 py-3 text-white font-semibold hidden lg:table-cell">Visitador</th>
                  <th className="text-left px-4 py-3 text-white font-semibold hidden lg:table-cell">Categorías</th>
                  <th className="text-center px-4 py-3 text-white font-semibold">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr
                    key={`${item.rut_doctor}-${idx}`}
                    className={`border-t border-gray-100 transition-colors hover:bg-blue-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 font-bold text-gray-500">
                      {idx < 3 ? (
                        <span className="text-lg">{MEDALS[idx]}</span>
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{item.doctor_name}</p>
                      {item.rut_doctor && (
                        <p className="text-xs text-gray-400">{item.rut_doctor}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                      {item.specialty || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {item.rep_name === 'Sin visitador' ? (
                        <span className="text-xs text-gray-400 italic">Sin visitador</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: '#E8F4F8', color: '#0F1E2D' }}>
                          {item.rep_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {item.categorias.map(cat => (
                          <span key={cat} className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-600'}`}>
                            {cat}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-lg font-bold" style={{ color: '#0F1E2D' }}>{item.units}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
