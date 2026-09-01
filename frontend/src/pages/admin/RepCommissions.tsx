import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, BarChart2, TrendingUp, UserPlus, Users, ChevronDown, ChevronUp, Download, UserX, UserCheck } from 'lucide-react';
import { dashboardApi, repsApi, doctorsApi } from '../../api';
import * as XLSX from 'xlsx';

interface CategoryBreakdown {
  [key: string]: number;
}

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
  rep_id: number | null;
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

const formatCLP = (v: number) => '$' + Math.round(v).toLocaleString('es-CL');
const formatCLPShort = (v: number) =>
  v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : '$' + Math.round(v / 1000) + 'K';

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

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-xl ${color}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  );
}

function UnassignedCard({ item, reps, onAssigned }: { item: RepCommissionItem; reps: { id: number; name: string }[]; onAssigned: () => void }) {
  const [showDoctors, setShowDoctors] = useState(false);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [selectedRep, setSelectedRep] = useState<Record<number, string>>({});

  const handleAssign = async (doctorId: number) => {
    const repId = parseInt(selectedRep[doctorId] || '');
    if (!repId) return;
    setAssigning(doctorId);
    try {
      await doctorsApi.assignRep(doctorId, repId);
      onAssigned();
    } catch (e) {
      console.error(e);
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border-2 border-amber-200 shadow-sm overflow-hidden">
      <div className="p-4 flex items-center gap-4 bg-amber-50">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-100">
          <UserX size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-amber-900 text-base">Sin visitador asignado</h3>
          <p className="text-xs text-amber-600">{item.doctors_with_sales} médico(s) con ventas sin rep</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-amber-700">{item.sales_count.toLocaleString('es-CL')}</p>
          <p className="text-xs text-amber-500">unidades</p>
        </div>
      </div>

      <div className="px-4 pb-3 pt-3 flex gap-2 flex-wrap">
        <StatPill label="Monto total" value={formatCLPShort(item.total_amount)} color="bg-emerald-50 text-emerald-700" />
        <StatPill label="Unidades" value={item.sales_count} color="bg-amber-50 text-amber-700" />
        <StatPill label="Médicos" value={item.doctors_with_sales} color="bg-orange-50 text-orange-700" />
      </div>

      {item.doctors_detail.length > 0 && (
        <>
          <button
            onClick={() => setShowDoctors(!showDoctors)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-amber-100 text-sm text-amber-700 hover:bg-amber-50 transition-colors font-medium"
          >
            <span className="flex items-center gap-2">
              <UserCheck size={14} className="text-amber-500" />
              Asignar visitador a {item.doctors_with_sales} médico(s)
            </span>
            {showDoctors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showDoctors && (
            <div className="border-t border-amber-100">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-amber-50 border-b border-amber-100">
                      <th className="text-left px-4 py-2 text-gray-500 font-medium">Médico</th>
                      <th className="text-right px-4 py-2 text-gray-500 font-medium">Monto</th>
                      <th className="text-center px-4 py-2 text-gray-500 font-medium">Uds.</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium min-w-[200px]">Asignar visitador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.doctors_detail.map((doc) => (
                      <tr key={doc.doctor_id} className="border-t border-gray-50 hover:bg-amber-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-800 truncate max-w-[130px] block">{doc.doctor_name}</span>
                          {doc.rut && <p className="text-gray-400 text-[10px]">{doc.rut}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-emerald-700">{formatCLP(doc.amount)}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-gray-800">{doc.units}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <select
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white flex-1"
                              value={selectedRep[doc.doctor_id] || ''}
                              onChange={e => setSelectedRep(prev => ({ ...prev, [doc.doctor_id]: e.target.value }))}
                            >
                              <option value="">Seleccionar...</option>
                              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                            <button
                              onClick={() => handleAssign(doc.doctor_id)}
                              disabled={!selectedRep[doc.doctor_id] || assigning === doc.doctor_id}
                              className="flex-shrink-0 px-2 py-1 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                            >
                              {assigning === doc.doctor_id ? '...' : 'Asignar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RepCard({ item, rank, totalUnits }: { item: RepCommissionItem; rank: number; totalUnits: number }) {
  const [showDoctors, setShowDoctors] = useState(false);
  const catEntries = Object.entries(item.categories).sort((a, b) => b[1] - a[1]);
  const pct = totalUnits > 0 ? ((item.sales_count / totalUnits) * 100).toFixed(1) : '0';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="p-4 flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
          style={{ backgroundColor: rank === 1 ? '#F59E0B' : rank === 2 ? '#9CA3AF' : rank === 3 ? '#CD7C2F' : '#0F1E2D' }}
        >
          #{rank}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base truncate">{item.rep_name}</h3>
          <p className="text-xs text-gray-400">{item.doctors_with_sales} médicos con ventas</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold" style={{ color: '#0F1E2D' }}>{item.sales_count.toLocaleString('es-CL')}</p>
          <p className="text-xs text-gray-400">{pct}% del total</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        <StatPill label="Monto total" value={formatCLPShort(item.total_amount)} color="bg-emerald-50 text-emerald-700" />
        <StatPill label="Unidades" value={item.sales_count} color="bg-blue-50 text-blue-700" />
        <StatPill label="Médicos activos" value={item.doctors_with_sales} color="bg-indigo-50 text-indigo-700" />
        <StatPill
          label="Médicos nuevos"
          value={item.new_doctors_count}
          color={item.new_doctors_count > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}
        />
      </div>

      {/* Category pills */}
      {catEntries.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {catEntries.map(([cat, count]) => (
            <span key={cat} className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-600'}`}>
              {cat}: {count} u
            </span>
          ))}
        </div>
      )}

      {/* Expandible: detalle de médicos con ventas */}
      {item.doctors_detail && item.doctors_detail.length > 0 && (
        <>
          <button
            onClick={() => setShowDoctors(!showDoctors)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
          >
            <span className="flex items-center gap-2">
              <Users size={14} className="text-blue-500" />
              Ver {item.doctors_with_sales} médico(s) con ventas
            </span>
            {showDoctors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showDoctors && (
            <div className="border-t border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-gray-500 font-medium">Médico</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium hidden sm:table-cell">Especialidad</th>
                      <th className="text-right px-4 py-2 text-gray-500 font-medium">Monto</th>
                      <th className="text-center px-4 py-2 text-gray-500 font-medium">Unidades</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium">Categorías</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.doctors_detail.map((doc) => (
                      <tr key={doc.doctor_id} className="border-t border-gray-50 hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800 truncate max-w-[130px]">{doc.doctor_name}</span>
                            {doc.is_new && (
                              <span className="flex-shrink-0 text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">NUEVO</span>
                            )}
                          </div>
                          {doc.rut && <p className="text-gray-400 text-[10px]">{doc.rut}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">
                          {doc.specialty || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-emerald-700">{formatCLP(doc.amount)}</td>
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
  const [reps, setReps] = useState<{ id: number; name: string }[]>([]);

  const _now = new Date();
  const isCurrentMonth = month === _now.getMonth() + 1 && year === _now.getFullYear();

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (isCurrentMonth) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const loadData = () => {
    setLoading(true);
    (dashboardApi as any).getRepCommissions(month, year)
      .then((res: RepCommissionItem[]) => setData(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [month, year]);
  useEffect(() => {
    repsApi.getAll().then(r => setReps(r.filter((rep: any) => rep.is_active).map((rep: any) => ({ id: rep.id, name: rep.name }))));
  }, []);

  const repData = data.filter(r => r.rep_id !== null);
  const unassignedData = data.find(r => r.rep_id === null) || null;

  const totalUnits = data.reduce((s, r) => s + r.sales_count, 0);
  const totalAmount = data.reduce((s, r) => s + r.total_amount, 0);
  const totalNewDoctors = repData.reduce((s, r) => s + r.new_doctors_count, 0);
  const totalDoctors = data.reduce((s, r) => s + r.doctors_with_sales, 0);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const allCats = Array.from(new Set(data.flatMap(r => Object.keys(r.categories))));

    // Hoja 1: Resumen por visitador
    const resumenRows = [
      ['Visitador', 'Monto Total ($)', 'Unidades', 'Médicos con ventas', 'Médicos nuevos', ...allCats],
      ...data.map(r => [
        r.rep_name, r.total_amount, r.sales_count, r.doctors_with_sales, r.new_doctors_count,
        ...allCats.map(cat => r.categories[cat] || 0),
      ]),
      [],
      ['TOTAL', totalAmount, totalUnits, totalDoctors, totalNewDoctors, ...allCats.map(cat => data.reduce((s, r) => s + (r.categories[cat] || 0), 0))],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumenRows);
    ws1['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, ...allCats.map(() => ({ wch: 18 }))];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    // Hoja 2: Detalle por médico
    const detalleRows = [
      ['Visitador', 'Médico', 'RUT', 'Especialidad', 'Monto ($)', 'Unidades', 'Médico Nuevo', ...allCats],
      ...data.flatMap(r =>
        (r.doctors_detail || []).map(d => [
          r.rep_name, d.doctor_name, d.rut || '', d.specialty || '', d.amount, d.units,
          d.is_new ? 'Sí' : 'No',
          ...allCats.map(cat => d.categories[cat] || 0),
        ])
      ),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(detalleRows);
    ws2['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, ...allCats.map(() => ({ wch: 18 }))];
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle Médicos');

    XLSX.writeFile(wb, `Comisiones_${MONTH_NAMES[month - 1]}_${year}.xlsx`);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0F1E2D' }}>
            <BarChart2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Comisiones por Visitador</h1>
            <p className="text-sm text-gray-500">Rendimiento mensual en unidades vendidas</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Export button */}
          {data.length > 0 && (
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download size={15} /> Exportar Excel
            </button>
          )}
          {/* Month selector */}
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
      </div>

      {/* Global summary */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl p-4 text-white shadow-sm" style={{ backgroundColor: '#0F1E2D' }}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="opacity-70" />
              <p className="text-sm opacity-70">Venta total del mes</p>
            </div>
            <p className="text-2xl font-bold">{formatCLPShort(totalAmount)}</p>
            <p className="text-xs opacity-50 mt-0.5">{totalUnits.toLocaleString('es-CL')} unidades</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-gray-400" />
              <p className="text-sm text-gray-500">Médicos activos (con ventas)</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalDoctors.toLocaleString('es-CL')}</p>
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
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
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
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Monto total</th>
                    <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Unidades</th>
                    <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Médicos activos</th>
                    <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Médicos nuevos</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium hidden sm:table-cell">% del Total</th>
                  </tr>
                </thead>
                <tbody>
                  {repData.map((item, idx) => (
                    <tr key={item.rep_id} className={`border-t border-gray-100 hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-4 py-3 font-bold text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{item.rep_name}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatCLP(item.total_amount)}</td>
                      <td className="px-4 py-3 text-center font-bold" style={{ color: '#0F1E2D' }}>{item.sales_count}</td>
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
                      <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
                        {totalUnits > 0 ? ((item.sales_count / totalUnits) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200" style={{ backgroundColor: '#E8F4F8' }}>
                    <td colSpan={2} className="px-4 py-3 font-bold text-gray-700">TOTAL</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatCLP(totalAmount)}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: '#0F1E2D' }}>{totalUnits}</td>
                    <td className="px-4 py-3 text-center font-bold text-gray-700">—</td>
                    <td className="px-4 py-3 text-center font-bold text-green-700">{totalNewDoctors}</td>
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
              {repData.map((item, idx) => (
                <RepCard key={item.rep_id} item={item} rank={idx + 1} totalUnits={totalUnits} />
              ))}
            </div>
          </div>

          {/* Sin visitador */}
          {unassignedData && unassignedData.sales_count > 0 && (
            <div className="mt-4">
              <h2 className="font-semibold text-amber-700 mb-3 flex items-center gap-2">
                <UserX size={16} />
                Ventas sin visitador asignado — asignar para incluir en comisiones
              </h2>
              <UnassignedCard item={unassignedData} reps={reps} onAssigned={loadData} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
