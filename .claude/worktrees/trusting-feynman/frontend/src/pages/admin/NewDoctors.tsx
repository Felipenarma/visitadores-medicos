import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, UserPlus, AlertCircle, CheckCircle } from 'lucide-react';
import { dashboardApi } from '../../api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface NewDoctorItem {
  rut_doctor: string;
  doctor_name: string;
  specialty: string | null;
  primera_venta: string | null;
  rep_name: string | null;
  rep_id: number | null;
  productos: string[];
  total_amount: number;
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function NewDoctors() {
  const [data, setData] = useState<NewDoctorItem[]>([]);
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
    (dashboardApi as any).getNewDoctors(month, year)
      .then((res: NewDoctorItem[]) => setData(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month, year]);

  const withRep = data.filter(d => d.rep_name);
  const withoutRep = data.filter(d => !d.rep_name);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0F1E2D' }}>
            <UserPlus size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Médicos Nuevos
              {data.length > 0 && (
                <span className="ml-2 text-sm font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: '#4BA5C3' }}>
                  {data.length}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500">Primera prescripción en el período</p>
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

      {/* Summary cards */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total médicos nuevos</p>
            <p className="text-3xl font-bold mt-1" style={{ color: '#0F1E2D' }}>{data.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-500" />
              <p className="text-sm text-gray-500">Con visitador asignado</p>
            </div>
            <p className="text-3xl font-bold mt-1 text-green-600">{withRep.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-500" />
              <p className="text-sm text-gray-500">Sin visitador asignado</p>
            </div>
            <p className="text-3xl font-bold mt-1 text-amber-600">{withoutRep.length}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: '#4BA5C3' }} />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <UserPlus size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay médicos nuevos en este período</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#0F1E2D' }}>
                  <th className="text-left px-4 py-3 text-white font-semibold">Médico</th>
                  <th className="text-left px-4 py-3 text-white font-semibold hidden md:table-cell">Especialidad</th>
                  <th className="text-left px-4 py-3 text-white font-semibold hidden sm:table-cell">Primera Venta</th>
                  <th className="text-left px-4 py-3 text-white font-semibold">Visitador</th>
                  <th className="text-left px-4 py-3 text-white font-semibold hidden lg:table-cell">Productos</th>
                  <th className="text-right px-4 py-3 text-white font-semibold hidden sm:table-cell">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, idx) => {
                  const noRep = !item.rep_name;
                  return (
                    <tr
                      key={`${item.rut_doctor}-${idx}`}
                      className={`border-t border-gray-100 transition-colors hover:bg-blue-50 ${
                        noRep ? 'bg-amber-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{item.doctor_name}</p>
                        {item.rut_doctor && (
                          <p className="text-xs text-gray-400">{item.rut_doctor}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                        {item.specialty || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                        {item.primera_venta
                          ? format(new Date(item.primera_venta), "d MMM yyyy", { locale: es })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {noRep ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                            <AlertCircle size={12} />
                            Sin asignar
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: '#E8F4F8', color: '#0F1E2D' }}>
                            {item.rep_name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {item.productos.slice(0, 3).map((p, i) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {p.length > 25 ? p.slice(0, 25) + '…' : p}
                            </span>
                          ))}
                          {item.productos.length > 3 && (
                            <span className="text-xs text-gray-400">+{item.productos.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-700 hidden sm:table-cell">
                        ${item.total_amount.toLocaleString('es-CL')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {withoutRep.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle size={16} />
              <span>{withoutRep.length} médico(s) nuevo(s) sin visitador asignado — oportunidad de gestión</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
