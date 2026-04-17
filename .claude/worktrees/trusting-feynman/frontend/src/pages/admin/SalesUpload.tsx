import React, { useState, useEffect } from 'react';
import { Upload, TrendingUp, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { salesApi, consolidatedSalesApi } from '../../api';
import type { SalesSummaryItem } from '../../types';

export default function SalesUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<SalesSummaryItem[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [lastUpload, setLastUpload] = useState<{ id: number; filename: string; upload_date: string; rows_processed: number } | null>(null);

  const loadSummary = async () => {
    setLoadingSummary(true);
    try { setSummary(await salesApi.getSummary()); }
    finally { setLoadingSummary(false); }
  };

  const loadLastUpload = async () => {
    try { setLastUpload(await consolidatedSalesApi.getLastUpload()); }
    catch { /* silencioso */ }
  };

  useEffect(() => { loadSummary(); loadLastUpload(); }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError(''); setResult(null);
    try {
      const res = await consolidatedSalesApi.upload(file);
      setResult(res);
      loadSummary();
      loadLastUpload();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al cargar el archivo');
    } finally {
      setUploading(false);
    }
  };

  const topSellers = summary.filter(s => (s.total_units || 0) > 0).slice(0, 30);
  const converting = summary.filter(s => (s.total_units || 0) > 0 && s.visits_count > 0);
  const withVisitsNoSales = summary.filter(s => (s.total_units || 0) === 0 && s.visits_count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ventas</h1>
        <p className="text-gray-500 text-sm mt-1">Carga archivos de ventas y visualiza la correlación con visitas</p>
      </div>

      {/* Último archivo cargado */}
      {lastUpload && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <FileText size={18} className="text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-800 truncate">
              Último archivo cargado: <span className="font-semibold">{lastUpload.filename}</span>
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              {new Date(lastUpload.upload_date).toLocaleString('es-CL', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}
              {' · '}
              {lastUpload.rows_processed.toLocaleString()} filas procesadas
            </p>
          </div>
        </div>
      )}

      {/* Upload section */}
      <div className="card max-w-2xl">
        <h2 className="font-semibold text-gray-900 mb-2">Cargar Archivo de Ventas</h2>
        <p className="text-sm text-gray-500 mb-4">
          Carga el archivo consolidado de ventas. El cruce con médicos se hace por <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">RUT Doctor</span>. Los registros duplicados se omiten automáticamente.
        </p>

        <div className="relative border-2 border-dashed rounded-xl p-8 text-center transition-colors border-gray-300 hover:border-blue-400">
          <TrendingUp size={36} className={`mx-auto mb-3 ${file ? 'text-blue-500' : 'text-gray-400'}`} />
          {file ? (
            <div>
              <p className="font-medium text-blue-700">{file.name}</p>
              <p className="text-sm text-blue-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 font-medium">Arrastra tu archivo aquí</p>
              <p className="text-sm text-gray-400">o haz clic para seleccionar (CSV, XLSX)</p>
            </div>
          )}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); setResult(null); setError(''); }
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>

        <div className="flex gap-3 mt-4">
          {file && (
            <button onClick={() => { setFile(null); setResult(null); setError(''); }} className="btn-secondary">Limpiar</button>
          )}
          <button onClick={handleUpload} disabled={!file || uploading} className="btn-primary flex items-center gap-2">
            <Upload size={16} />
            {uploading ? 'Cargando...' : 'Cargar Ventas'}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
            <AlertCircle size={18} className="text-red-500 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-green-500" />
              <p className="text-green-700 font-medium">{result.message}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 text-center border border-green-100">
                <p className="text-xl font-bold">{result.rows_processed}</p>
                <p className="text-xs text-gray-500">Filas procesadas</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-green-100">
                <p className="text-xl font-bold text-green-600">{result.matched_doctors}</p>
                <p className="text-xs text-gray-500">Médicos emparejados</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-green-100">
                <p className="text-xl font-bold text-blue-600">{result.new_doctors_created ?? 0}</p>
                <p className="text-xs text-gray-500">Médicos nuevos creados</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-green-100">
                <p className="text-xl font-bold text-gray-400">{result.duplicates_skipped ?? 0}</p>
                <p className="text-xs text-gray-500">Duplicados omitidos</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      {!loadingSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-3xl font-bold text-green-600">{converting.length}</p>
            <p className="text-sm text-gray-500 mt-1">Médicos con visitas Y ventas</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-orange-500">{withVisitsNoSales.length}</p>
            <p className="text-sm text-gray-500 mt-1">Médicos visitados sin ventas</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-blue-600">
              {summary.reduce((s, i) => s + (i.total_units || 0), 0).toLocaleString()}
            </p>
            <p className="text-sm text-gray-500 mt-1">Unidades vendidas</p>
          </div>
        </div>
      )}

      {/* Correlation table */}
      <div className="card overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Correlación Visitas vs Ventas</h2>
        </div>
        {loadingSummary ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Médico</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">RUT</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Visitas</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Unidades Vendidas</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Registros</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Convirtiendo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topSellers.map((item, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${(item.total_units || 0) > 0 && item.visits_count > 0 ? 'bg-green-50/30' : ''}`}>
                    <td className="py-3 px-4 font-medium text-gray-900">{item.doctor_name}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{item.doctor_rut || '—'}</td>
                    <td className="py-3 px-4 text-center text-gray-600">{item.visits_count}</td>
                    <td className="py-3 px-4 text-center font-semibold text-gray-900">
                      {(item.total_units || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600">{item.sales_count}</td>
                    <td className="py-3 px-4 text-center">
                      {(item.total_units || 0) > 0 && item.visits_count > 0 ? (
                        <span className="badge-completed">Sí</span>
                      ) : (item.total_units || 0) > 0 ? (
                        <span className="badge-scheduled">Solo ventas</span>
                      ) : item.visits_count > 0 ? (
                        <span className="badge-missed">Solo visitas</span>
                      ) : (
                        <span className="badge-cancelled">Sin datos</span>
                      )}
                    </td>
                  </tr>
                ))}
                {topSellers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      No hay datos de ventas cargados aún
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
