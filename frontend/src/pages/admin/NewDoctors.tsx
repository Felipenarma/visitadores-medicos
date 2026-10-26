import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, UserPlus, AlertCircle, CheckCircle, Edit2, Trash2, X, Save, Download, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { dashboardApi, doctorsApi, repsApi, businessLinesApi } from '../../api';
import type { BusinessLine } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import type { MedicalRep } from '../../types';

interface NewDoctorItem {
  doctor_id: number | null;
  rut_doctor: string;
  doctor_name: string;
  specialty: string | null;
  primera_venta: string | null;
  rep_name: string | null;
  rep_id: number | null;
  productos: string[];
  categorias: string[];
  business_line_id: number | null;
  business_line_name: string | null;
  total_amount: number;
  sales_count: number;
  email?: string | null;
  phone?: string | null;
}

interface TrendPoint {
  year: number;
  month: number;
  total: number;
  con_visitador: number;
  sin_visitador: number;
}

const ALL_CATEGORIES = [
  'Hormonas', 'Cannabis Medicinal', 'Dermatología',
  'Control de Peso', 'Suero Terapia', 'Fertilidad',
  'Pelo', 'Producto Terminado', 'Veterinario',
];

const CAT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Hormonas':           { bg: '#F3F0FF', text: '#6D28D9', dot: '#8B5CF6' },
  'Cannabis Medicinal': { bg: '#ECFDF5', text: '#065F46', dot: '#10B981' },
  'Dermatología':       { bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B' },
  'Control de Peso':    { bg: '#FEF2F2', text: '#991B1B', dot: '#EF4444' },
  'Suero Terapia':      { bg: '#EFF6FF', text: '#1E40AF', dot: '#3B82F6' },
  'Fertilidad':         { bg: '#FDF4FF', text: '#6B21A8', dot: '#C084FC' },
  'Pelo':               { bg: '#F0FDF4', text: '#14532D', dot: '#4ADE80' },
  'Producto Terminado': { bg: '#F8FAFC', text: '#475569', dot: '#94A3B8' },
  'Veterinario':        { bg: '#ECFEFF', text: '#155E75', dot: '#06B6D4' },
};

function CategoryBadge({ cat }: { cat: string }) {
  const c = CAT_COLORS[cat] || { bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' };
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
      {cat}
    </span>
  );
}

function ProductTooltip({ productos }: { productos: string[] }) {
  const [show, setShow] = React.useState(false);
  if (productos.length === 0) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="flex flex-wrap gap-1 cursor-default">
        {productos.slice(0, 2).map((p, i) => (
          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full max-w-[140px] truncate" title={p}>
            {p}
          </span>
        ))}
        {productos.length > 2 && (
          <span className="text-xs text-blue-500 font-medium cursor-pointer">+{productos.length - 2} más</span>
        )}
      </div>
      {show && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-72 bg-gray-900 text-white text-xs rounded-xl p-3 shadow-2xl"
          style={{ minWidth: '200px' }}>
          <p className="font-semibold text-gray-300 mb-2">Todos los productos ({productos.length}):</p>
          <div className="space-y-1">
            {productos.map((p, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-gray-400 mt-0.5">·</span>
                <span className="text-white leading-tight">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface EditForm {
  name: string;
  rut: string;
  specialty: string;
  email: string;
  phone: string;
  rep_id: string;
  business_line_id: string;
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// 'YYYY-MM' helpers para <input type="month">
const toYM = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const fromYM = (v: string) => { const [y, m] = v.split('-').map(Number); return { y, m }; };
const shiftMonth = (y: number, m: number, delta: number) => {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
};

type ExportPreset = 'month' | '3m' | '6m' | '12m' | 'ytd' | 'custom';

export default function NewDoctors() {
  const [data, setData]       = useState<NewDoctorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth]     = useState(new Date().getMonth() + 1);
  const [year, setYear]       = useState(new Date().getFullYear());
  const [reps, setReps]       = useState<MedicalRep[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);

  // Modal state
  const [editItem, setEditItem]       = useState<NewDoctorItem | null>(null);
  const [deleteItem, setDeleteItem]   = useState<NewDoctorItem | null>(null);
  const [form, setForm]               = useState<EditForm>({ name: '', rut: '', specialty: '', email: '', phone: '', rep_id: '', business_line_id: '' });
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');

  // Tendencia 12 meses
  const [trend, setTrend]             = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  // Export por período
  const [showExport, setShowExport]   = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>('month');
  const [exportFrom, setExportFrom]   = useState('');
  const [exportTo, setExportTo]       = useState('');
  const [exporting, setExporting]     = useState(false);
  const [exportError, setExportError] = useState('');

  const _now = new Date();
  const isCurrentMonth = month === _now.getMonth() + 1 && year === _now.getFullYear();

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (isCurrentMonth) return; if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const load = () => {
    setLoading(true);
    Promise.all([
      (dashboardApi as any).getNewDoctors(month, year),
      repsApi.getAll(),
      businessLinesApi.getAll(),
    ])
      .then(([newDocs, repList, blList]: [NewDoctorItem[], MedicalRep[], BusinessLine[]]) => {
        setData(newDocs);
        setReps(repList);
        setBusinessLines(blList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const loadTrend = () => {
    setTrendLoading(true);
    (dashboardApi as any).getNewDoctorsTrend(month, year, 12)
      .then((t: TrendPoint[]) => setTrend(t))
      .catch(console.error)
      .finally(() => setTrendLoading(false));
  };

  useEffect(() => { load(); loadTrend(); }, [month, year]);

  // ── Export por período ──────────────────────────────────────────────────
  const currentYM = toYM(_now.getFullYear(), _now.getMonth() + 1);

  const applyPreset = (preset: ExportPreset) => {
    setExportPreset(preset);
    setExportError('');
    const endY = year, endM = month;
    let start = { y: endY, m: endM };
    if (preset === '3m')  start = shiftMonth(endY, endM, -2);
    if (preset === '6m')  start = shiftMonth(endY, endM, -5);
    if (preset === '12m') start = shiftMonth(endY, endM, -11);
    if (preset === 'ytd') start = { y: endY, m: 1 };
    if (preset !== 'custom') {
      setExportFrom(toYM(start.y, start.m));
      setExportTo(toYM(endY, endM));
    }
  };

  const openExport = () => {
    applyPreset('month');
    setShowExport(true);
  };

  const periodLabel = (from: string, to: string) => {
    const a = fromYM(from), b = fromYM(to);
    if (from === to) return `${MONTH_NAMES[a.m - 1]} ${a.y}`;
    return `${MONTH_SHORT[a.m - 1]} ${a.y} – ${MONTH_SHORT[b.m - 1]} ${b.y}`;
  };

  const downloadExcel = async () => {
    if (!exportFrom || !exportTo) { setExportError('Selecciona el mes de inicio y de término.'); return; }
    if (exportFrom > exportTo) { setExportError('El mes "desde" debe ser anterior o igual al mes "hasta".'); return; }
    setExporting(true);
    setExportError('');
    try {
      const a = fromYM(exportFrom), b = fromYM(exportTo);
      const rowsData: NewDoctorItem[] = await (dashboardApi as any).getNewDoctorsRange(a.m, a.y, b.m, b.y);
      if (rowsData.length === 0) { setExportError('No hay médicos nuevos en el período seleccionado.'); return; }

      const rows = rowsData.map(d => {
        const fv = d.primera_venta ? new Date(d.primera_venta) : null;
        return {
          'Mes de ingreso': fv ? `${MONTH_NAMES[fv.getMonth()]} ${fv.getFullYear()}` : '',
          'Médico':         d.doctor_name,
          'RUT':            d.rut_doctor || '',
          'Especialidad':   d.specialty || '',
          'Email':          d.email || '',
          'Teléfono':       d.phone || '',
          'Primera Venta':  fv ? format(fv, 'dd/MM/yyyy', { locale: es }) : '',
          'Visitador':      d.rep_name || 'Sin asignar',
          'Línea':          d.business_line_name || (d.categorias || []).join(', '),
          'Productos':      (d.productos || []).join(', '),
          'Recetas en el período': d.sales_count,
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 50 }, { wch: 12 }];

      // Resumen mensual
      const summary: Record<string, { label: string; total: number; con: number; sin: number }> = {};
      for (let ym = exportFrom; ym <= exportTo; ) {
        const { y, m } = fromYM(ym);
        summary[ym] = { label: `${MONTH_NAMES[m - 1]} ${y}`, total: 0, con: 0, sin: 0 };
        const n = shiftMonth(y, m, 1); ym = toYM(n.y, n.m);
      }
      rowsData.forEach(d => {
        if (!d.primera_venta) return;
        const fv = new Date(d.primera_venta);
        const k = toYM(fv.getFullYear(), fv.getMonth() + 1);
        if (!summary[k]) return;
        summary[k].total += 1;
        if (d.rep_name) summary[k].con += 1; else summary[k].sin += 1;
      });
      const summaryRows = Object.values(summary).map(s => ({
        'Mes': s.label, 'Médicos nuevos': s.total, 'Con visitador': s.con, 'Sin visitador': s.sin,
      }));
      summaryRows.push({
        'Mes': 'TOTAL',
        'Médicos nuevos': summaryRows.reduce((acc, r) => acc + r['Médicos nuevos'], 0),
        'Con visitador':  summaryRows.reduce((acc, r) => acc + r['Con visitador'], 0),
        'Sin visitador':  summaryRows.reduce((acc, r) => acc + r['Sin visitador'], 0),
      });
      const ws2 = XLSX.utils.json_to_sheet(summaryRows);
      ws2['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Médicos Nuevos');
      XLSX.utils.book_append_sheet(wb, ws2, 'Resumen mensual');
      const fname = exportFrom === exportTo
        ? `medicos_nuevos_${MONTH_NAMES[a.m - 1]}_${a.y}.xlsx`
        : `medicos_nuevos_${exportFrom}_a_${exportTo}.xlsx`;
      XLSX.writeFile(wb, fname);
      setShowExport(false);
    } catch (e) {
      console.error(e);
      setExportError('Error al generar el Excel. Intenta nuevamente.');
    } finally {
      setExporting(false);
    }
  };

  // Datos para el gráfico
  const chartData = trend.map(t => ({
    ...t,
    label: `${MONTH_SHORT[t.month - 1]} ${String(t.year).slice(2)}`,
    selected: t.month === month && t.year === year,
  }));
  const trendTotal = trend.reduce((acc, t) => acc + t.total, 0);
  const trendAvg = trend.length ? trendTotal / trend.length : 0;
  const trendMax = trend.reduce((best, t) => (t.total > (best?.total ?? -1) ? t : best), null as TrendPoint | null);

  const openEdit = (item: NewDoctorItem) => {
    setEditItem(item);
    setForm({
      name:             item.doctor_name,
      rut:              item.rut_doctor,
      specialty:        item.specialty || '',
      email:            '',
      phone:            '',
      rep_id:           item.rep_id ? String(item.rep_id) : '',
      business_line_id: item.business_line_id ? String(item.business_line_id) : '',
    });
    setErrorMsg('');
  };

  const handleSave = async () => {
    if (!editItem?.doctor_id) { setErrorMsg('Este médico no tiene ID en la base de datos.'); return; }
    if (!form.name.trim()) { setErrorMsg('El nombre es requerido.'); return; }
    setSaving(true);
    setErrorMsg('');
    try {
      await doctorsApi.update(editItem.doctor_id, {
        name:             form.name.trim(),
        rut:              form.rut.trim() || undefined,
        specialty:        form.specialty.trim() || undefined,
        email:            form.email.trim() || undefined,
        phone:            form.phone.trim() || undefined,
        rep_id:           form.rep_id ? parseInt(form.rep_id) : undefined,
        business_line_id: form.business_line_id ? parseInt(form.business_line_id) : undefined,
      });
      setEditItem(null);
      load();
      loadTrend();
    } catch {
      setErrorMsg('Error al guardar. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem?.doctor_id) return;
    setDeleting(true);
    try {
      await doctorsApi.delete(deleteItem.doctor_id);
      setDeleteItem(null);
      load();
      loadTrend();
    } catch {
      setErrorMsg('Error al eliminar.');
    } finally {
      setDeleting(false);
    }
  };

  const withRep    = data.filter(d => d.rep_name);
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
          {(
            <button
              onClick={openExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors ml-2"
              title="Descargar Excel por período"
            >
              <Download size={15} />
              Excel
            </button>
          )}
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

      {/* Tendencia últimos 12 meses */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 lg:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} style={{ color: '#4BA5C3' }} />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Médicos nuevos por mes</h2>
              <p className="text-xs text-gray-500">Últimos 12 meses hasta {MONTH_NAMES[month - 1]} {year} · haz clic en una barra para ver ese mes</p>
            </div>
          </div>
          {!trendLoading && trend.length > 0 && (
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-xs text-gray-500">Total 12 meses</p>
                <p className="text-lg font-bold" style={{ color: '#0F1E2D' }}>{trendTotal}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Promedio mensual</p>
                <p className="text-lg font-bold" style={{ color: '#0F1E2D' }}>{trendAvg.toFixed(1)}</p>
              </div>
              {trendMax && trendMax.total > 0 && (
                <div className="hidden sm:block">
                  <p className="text-xs text-gray-500">Mejor mes</p>
                  <p className="text-lg font-bold" style={{ color: '#0F1E2D' }}>
                    {MONTH_SHORT[trendMax.month - 1]} {String(trendMax.year).slice(2)} <span className="text-sm font-medium text-gray-500">({trendMax.total})</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        {trendLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#4BA5C3' }} />
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                onClick={(e: any) => {
                  const p = e?.activePayload?.[0]?.payload;
                  if (p) { setMonth(p.month); setYear(p.year); }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(75,165,195,0.08)' }}
                  formatter={(value: number, name: string) => [value, name]}
                  labelFormatter={(_l: string, payload: any[]) => {
                    const p = payload?.[0]?.payload;
                    return p ? `${MONTH_NAMES[p.month - 1]} ${p.year} · ${p.total} nuevos` : '';
                  }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="con_visitador" name="Con visitador" stackId="a" fill="#0F1E2D" cursor="pointer">
                  {chartData.map((d, i) => <Cell key={i} fillOpacity={d.selected ? 1 : 0.55} />)}
                </Bar>
                <Bar dataKey="sin_visitador" name="Sin visitador" stackId="a" fill="#4BA5C3" radius={[4, 4, 0, 0]} cursor="pointer">
                  {chartData.map((d, i) => <Cell key={i} fillOpacity={d.selected ? 1 : 0.55} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

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
                  <th className="text-left px-4 py-3 text-white font-semibold hidden md:table-cell">Línea</th>
                  <th className="text-left px-4 py-3 text-white font-semibold hidden lg:table-cell">Productos</th>
                  <th className="text-right px-4 py-3 text-white font-semibold hidden sm:table-cell">Recetas</th>
                  <th className="px-4 py-3"></th>
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
                        {item.rut_doctor && <p className="text-xs text-gray-400">{item.rut_doctor}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                        {item.specialty || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                        {item.primera_venta ? format(new Date(item.primera_venta), "d MMM yyyy", { locale: es }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {noRep ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                            <AlertCircle size={12} /> Sin asignar
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: '#E8F4F8', color: '#0F1E2D' }}>
                            {item.rep_name}
                          </span>
                        )}
                      </td>
                      {/* Línea de negocio */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {item.business_line_name ? (
                          <CategoryBadge cat={item.business_line_name} />
                        ) : (item.categorias || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(item.categorias || []).map((cat, i) => <CategoryBadge key={i} cat={cat} />)}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-500 italic">Por definir</span>
                        )}
                      </td>
                      {/* Productos con tooltip */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <ProductTooltip productos={item.productos || []} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-700 hidden sm:table-cell">
                        {item.sales_count ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Editar médico"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => { setDeleteItem(item); setErrorMsg(''); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Eliminar médico"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
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

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Descargar médicos nuevos</h2>
                <p className="text-xs text-gray-500 mt-0.5">Elige el período a exportar</p>
              </div>
              <button onClick={() => setShowExport(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  ['month', `${MONTH_SHORT[month - 1]} ${year}`],
                  ['3m', 'Últimos 3 meses'],
                  ['6m', 'Últimos 6 meses'],
                  ['12m', 'Últimos 12 meses'],
                  ['ytd', `Año ${year}`],
                  ['custom', 'Personalizado'],
                ] as [ExportPreset, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      exportPreset === key ? 'text-white border-transparent' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                    style={exportPreset === key ? { backgroundColor: '#0F1E2D' } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
                  <input
                    type="month"
                    max={currentYM}
                    value={exportFrom}
                    onChange={e => { setExportFrom(e.target.value); setExportPreset('custom'); setExportError(''); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
                  <input
                    type="month"
                    max={currentYM}
                    value={exportTo}
                    onChange={e => { setExportTo(e.target.value); setExportPreset('custom'); setExportError(''); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
              {exportFrom && exportTo && exportFrom <= exportTo && (
                <p className="text-xs text-gray-500">
                  Período: <span className="font-semibold text-gray-700">{periodLabel(exportFrom, exportTo)}</span>.
                  El archivo incluye el detalle por médico y una hoja de resumen mensual.
                </p>
              )}
              {exportError && <p className="text-sm text-red-500">{exportError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setShowExport(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={downloadExcel}
                disabled={exporting}
                className="px-4 py-2 text-sm rounded-lg text-white font-semibold flex items-center gap-2 disabled:opacity-50 bg-green-600 hover:bg-green-700"
              >
                <Download size={15} />
                {exporting ? 'Generando…' : 'Descargar Excel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Editar médico</h2>
              <button onClick={() => setEditItem(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!editItem.doctor_id && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                  Este médico no está registrado aún en la base de datos. Edita para crearlo.
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo <span className="text-red-400">*</span></label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">RUT</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.rut}
                    onChange={e => setForm(f => ({ ...f, rut: e.target.value }))}
                    placeholder="12345678-9"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Especialidad</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.specialty}
                    onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                    placeholder="Ej: Ginecología"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="doctor@clinica.cl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+56 9 1234 5678"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Visitador asignado</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.rep_id}
                    onChange={e => setForm(f => ({ ...f, rep_id: e.target.value }))}
                  >
                    <option value="">— Sin asignar —</option>
                    {reps.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Línea de productos</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.business_line_id}
                    onChange={e => setForm(f => ({ ...f, business_line_id: e.target.value }))}
                  >
                    <option value="">— Sin asignar —</option>
                    {businessLines.map(bl => (
                      <option key={bl.id} value={bl.id}>{bl.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setEditItem(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: '#0F1E2D' }}
              >
                <Save size={15} />
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Eliminar médico</h2>
              <p className="text-sm text-gray-500 mb-1">
                ¿Estás seguro que quieres eliminar a
              </p>
              <p className="font-semibold text-gray-800 mb-4">"{deleteItem.doctor_name}"?</p>
              <p className="text-xs text-gray-400 mb-6">Esta acción no se puede deshacer. Se eliminarán también sus visitas asociadas.</p>
              {errorMsg && <p className="text-sm text-red-500 mb-3">{errorMsg}</p>}
              <div className="flex gap-3">
                <button onClick={() => setDeleteItem(null)} className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold disabled:opacity-50"
                >
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
