import { useEffect, useRef, useState } from 'react';
import { BadgePercent, ChevronLeft, ChevronRight, Download, Search, Plus, X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { dashboardApi, doctorsApi } from '../../api';
import type { Doctor, DoctorCommissionsResponse, DoctorCommissionRow } from '../../types';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const clp = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export default function DoctorCommissions() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<DoctorCommissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  // Agregar médicos a comisión
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Doctor[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const load = () => {
    setLoading(true); setError('');
    dashboardApi.getDoctorCommissions(month, year)
      .then(setData)
      .catch(() => setError('No se pudo cargar el listado.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [month, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (isCurrentMonth) return; if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  useEffect(() => {
    if (!adding) return;
    clearTimeout(timer.current);
    if (query.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      setSearching(true);
      doctorsApi.getAll({ search: query.trim(), is_active: true })
        .then(r => setResults(r.slice(0, 15)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
  }, [query, adding]);

  const setCommission = async (doctorId: number, value: boolean) => {
    setBusyId(doctorId);
    try {
      await doctorsApi.update(doctorId, { has_commission: value });
      setResults(prev => prev.map(d => d.id === doctorId ? { ...d, has_commission: value } : d));
      load();
    } catch {
      setError('No se pudo actualizar el médico.');
    } finally { setBusyId(null); }
  };

  const rows: DoctorCommissionRow[] = (data?.doctors ?? []).filter(r => {
    const q = filter.trim().toLowerCase();
    return !q || [r.name, r.rut, r.rep_name, r.specialty].some(v => (v || '').toLowerCase().includes(q));
  });
  const t = data?.totals;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const exportExcel = () => {
    if (!data) return;
    const aoa = [
      ['Médico', 'RUT', 'Especialidad', 'Centro médico', 'Visitador', 'Línea de negocio', 'Recetas', 'Venta neta (sin IVA)', 'Venta con IVA', 'Venta neta mes anterior', 'Variación %'],
      ...data.doctors.map(r => [r.name, r.rut || '', r.specialty || '', r.medical_center || '', r.rep_name || 'Sin visitador', r.business_line || '',
        r.units, r.net_amount, r.gross_amount, r.prev_net_amount, r.change_pct ?? '']),
      [],
      ['TOTAL', '', '', '', '', '', data.totals.units, data.totals.net_amount, data.totals.gross_amount, data.totals.prev_net_amount, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 22 }, { wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 9 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 11 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comisiones médicos');
    XLSX.writeFile(wb, `Comisiones_Medicos_${MONTH_NAMES[month - 1]}_${year}.xlsx`);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-600">
            <BadgePercent size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Comisiones Médicos</h1>
            <p className="text-sm text-gray-500">Médicos con comisión y su venta neta (sin IVA) del mes</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setAdding(a => !a); setQuery(''); setResults([]); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
            <Plus size={15} /> Agregar médico
          </button>
          {data && data.doctors.length > 0 && (
            <button onClick={exportExcel}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <Download size={15} /> Exportar Excel
            </button>
          )}
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={18} /></button>
            <span className="text-sm font-semibold text-gray-700 min-w-[140px] text-center">{monthLabel}</span>
            <button onClick={nextMonth} disabled={isCurrentMonth}
              className={`p-1.5 rounded-lg border border-gray-200 ${isCurrentMonth ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Agregar médico */}
      {adding && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Marcar médicos con comisión</p>
            <button onClick={() => setAdding(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={16} /></button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nombre, RUT o centro médico…" className="input pl-9 w-full" />
          </div>
          {searching && <p className="text-xs text-gray-400">Buscando…</p>}
          {results.length > 0 && (
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl max-h-72 overflow-y-auto">
              {results.map(d => (
                <div key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                    <p className="text-xs text-gray-400 truncate">{[d.rut, d.specialty, d.rep_name].filter(Boolean).join(' · ')}</p>
                  </div>
                  {d.has_commission ? (
                    <button disabled={busyId === d.id} onClick={() => setCommission(d.id, false)}
                      className="text-xs px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                      ✓ Con comisión
                    </button>
                  ) : (
                    <button disabled={busyId === d.id} onClick={() => setCommission(d.id, true)}
                      className="text-xs px-3 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      {busyId === d.id ? '…' : 'Agregar'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && !searching && results.length === 0 && <p className="text-xs text-gray-400">Sin resultados.</p>}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</div>
      )}

      {/* Totales */}
      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">Venta neta {monthLabel}</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{clp(t.net_amount)}</p>
            {t.prev_net_amount > 0 && (
              <p className={`text-xs mt-1 ${t.net_amount >= t.prev_net_amount ? 'text-green-600' : 'text-red-500'}`}>
                {t.net_amount >= t.prev_net_amount ? '▲' : '▼'} {Math.abs(Math.round((t.net_amount / t.prev_net_amount - 1) * 100))}% vs mes anterior ({clp(t.prev_net_amount)})
              </p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">Médicos con comisión</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{t.doctors}</p>
            <p className="text-xs text-gray-400 mt-1">{t.with_sales} con recetas en el mes</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">Recetas</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{t.units.toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">Venta con IVA</p>
            <p className="text-2xl font-bold text-gray-500 mt-1">{clp(t.gross_amount)}</p>
          </div>
        </div>
      )}

      {/* Listado */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar listado…" className="input pl-9 w-full text-sm" />
          </div>
          <span className="text-xs text-gray-400 ml-auto">{rows.length} médico{rows.length !== 1 ? 's' : ''}</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
        ) : (data?.doctors.length ?? 0) === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Aún no hay médicos marcados con comisión.<br />
            Usa <strong>Agregar médico</strong> o marca "Tiene comisión" en la ficha del médico.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Médico</th>
                  <th className="text-left py-2.5 px-4 font-medium">Visitador</th>
                  <th className="text-right py-2.5 px-4 font-medium">Recetas</th>
                  <th className="text-right py-2.5 px-4 font-medium">Venta neta</th>
                  <th className="text-right py-2.5 px-4 font-medium">Mes anterior</th>
                  <th className="text-right py-2.5 px-4 font-medium">Variación</th>
                  <th className="py-2.5 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.doctor_id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{r.name}{!r.is_active && <span className="ml-2 text-[10px] text-gray-400">(inactivo)</span>}</p>
                      <p className="text-xs text-gray-400">{[r.rut, r.specialty, r.business_line].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{r.rep_name || <span className="text-xs text-red-400">Sin visitador</span>}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{r.units}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">{clp(r.net_amount)}</td>
                    <td className="py-3 px-4 text-right text-gray-500">{clp(r.prev_net_amount)}</td>
                    <td className="py-3 px-4 text-right">
                      {r.change_pct === null ? <span className="text-xs text-gray-300">—</span> : (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.change_pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {r.change_pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {r.change_pct > 0 ? '+' : ''}{r.change_pct}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => setCommission(r.doctor_id, false)} disabled={busyId === r.doctor_id}
                        className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50" title="Quitar comisión">
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-gray-800">
                <tr>
                  <td className="py-3 px-4" colSpan={2}>Total</td>
                  <td className="py-3 px-4 text-right">{t?.units}</td>
                  <td className="py-3 px-4 text-right text-emerald-700">{clp(t?.net_amount ?? 0)}</td>
                  <td className="py-3 px-4 text-right text-gray-500">{clp(t?.prev_net_amount ?? 0)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400">
        La venta de cada médico suma todas sus fichas con el mismo RUT (incluidas duplicadas o inactivas). Venta neta = monto con IVA / 1,19.
      </p>
    </div>
  );
}
