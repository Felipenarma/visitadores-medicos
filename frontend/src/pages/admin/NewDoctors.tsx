import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, UserPlus, AlertCircle, CheckCircle, Edit2, Trash2, X, Save, Download } from 'lucide-react';
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

  useEffect(() => { load(); }, [month, year]);

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
    } catch {
      setErrorMsg('Error al eliminar.');
    } finally {
      setDeleting(false);
    }
  };

  const withRep    = data.filter(d => d.rep_name);
  const withoutRep = data.filter(d => !d.rep_name);

  const downloadExcel = () => {
    const rows = data.map(d => ({
      'Médico':          d.doctor_name,
      'RUT':             d.rut_doctor || '',
      'Especialidad':    d.specialty || '',
      'Primera Venta':   d.primera_venta ? format(new Date(d.primera_venta), 'dd/MM/yyyy', { locale: es }) : '',
      'Visitador':       d.rep_name || 'Sin asignar',
      'Productos':       d.productos.join(', '),
      'Recetas':         d.sales_count,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // Ancho de columnas
    ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 50 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Médicos Nuevos');
    XLSX.writeFile(wb, `medicos_nuevos_${MONTH_NAMES[month - 1]}_${year}.xlsx`);
  };

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
          {data.length > 0 && (
            <button
              onClick={downloadExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors ml-2"
              title="Descargar Excel"
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
