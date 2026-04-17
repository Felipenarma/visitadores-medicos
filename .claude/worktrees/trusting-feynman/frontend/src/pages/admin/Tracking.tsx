import React, { useEffect, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { doctorsApi, repsApi, businessLinesApi } from '../../api';
import type { Doctor, MedicalRep, BusinessLine } from '../../types';
import { format } from 'date-fns';

export default function Tracking() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [reps, setReps] = useState<MedicalRep[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    rep_id: '',
    business_line_id: '',
    has_sales: '',
    search: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.rep_id) params.rep_id = parseInt(filters.rep_id);
      if (filters.business_line_id) params.business_line_id = parseInt(filters.business_line_id);
      if (filters.has_sales === 'true') params.has_sales = true;
      if (filters.has_sales === 'false') params.has_sales = false;
      if (filters.search) params.search = filters.search;

      const [d, r, bl] = await Promise.all([
        doctorsApi.getAll(params),
        repsApi.getAll(),
        businessLinesApi.getAll(),
      ]);
      setDoctors(d);
      setReps(r);
      setBusinessLines(bl);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const getRowClass = (doc: Doctor) => {
    if (doc.has_sales && (doc.visits_count ?? 0) > 0) return 'bg-green-50/40';
    if (!doc.has_sales && (doc.visits_count ?? 0) > 3) return 'bg-orange-50/40';
    return '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel de Seguimiento</h1>
        <p className="text-gray-500 text-sm mt-1">Monitoreo detallado de médicos y su conversión</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-900">{doctors.length}</p>
          <p className="text-xs text-gray-500">Médicos totales</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{doctors.filter(d => d.has_sales).length}</p>
          <p className="text-xs text-gray-500">Con ventas</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-blue-600">{doctors.filter(d => (d.visits_count ?? 0) > 0).length}</p>
          <p className="text-xs text-gray-500">Con visitas</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-orange-500">{doctors.filter(d => !d.rep_id).length}</p>
          <p className="text-xs text-gray-500">Sin visitador</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar médico..."
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <select className="input" value={filters.rep_id} onChange={e => setFilters({ ...filters, rep_id: e.target.value })}>
            <option value="">Todos los visitadores</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input" value={filters.business_line_id} onChange={e => setFilters({ ...filters, business_line_id: e.target.value })}>
            <option value="">Todas las líneas</option>
            {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
          </select>
          <select className="input" value={filters.has_sales} onChange={e => setFilters({ ...filters, has_sales: e.target.value })}>
            <option value="">Con y sin ventas</option>
            <option value="true">Solo con ventas</option>
            <option value="false">Solo sin ventas</option>
          </select>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
            <span>Médico convirtiendo (visitas + ventas)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-100 border border-orange-200"></div>
            <span>Visitado +3 veces pero sin ventas</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Médico</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Especialidad</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Línea</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Visitador</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Última Visita</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Visitas</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Prescribe</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {doctors.map(doc => (
                  <tr key={doc.id} className={`hover:bg-gray-50 ${getRowClass(doc)}`}>
                    <td className="py-3 px-4 font-medium text-gray-900">{doc.name}</td>
                    <td className="py-3 px-4 text-gray-500">{doc.specialty || '—'}</td>
                    <td className="py-3 px-4">
                      {doc.business_line_name ? (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded font-medium">{doc.business_line_name}</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{doc.rep_name || <span className="text-orange-400 text-xs">Sin asignar</span>}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {doc.last_visit_date ? format(new Date(doc.last_visit_date), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold text-gray-900">{doc.visits_count ?? 0}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs max-w-xs truncate">
                      {doc.prescribes_products || '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {doc.has_sales ? (
                        <span className="badge-completed">Sí</span>
                      ) : (
                        <span className="badge-cancelled">No</span>
                      )}
                    </td>
                  </tr>
                ))}
                {doctors.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-gray-400">
                      <Activity size={32} className="mx-auto mb-2 opacity-40" />
                      No se encontraron médicos con los filtros actuales
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
