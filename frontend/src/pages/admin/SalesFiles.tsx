import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { consolidatedSalesApi } from '../../api';

interface UploadItem {
  id: number;
  filename: string;
  upload_date: string;
  rows_processed: number;
  sales_count: number;
}

export default function SalesFiles() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Delete modal state
  const [deleteItem, setDeleteItem] = useState<UploadItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await consolidatedSalesApi.getUploads();
      setUploads(data);
    } catch {
      setError('Error al cargar los archivos de ventas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await consolidatedSalesApi.deleteUpload(deleteItem.id);
      setDeleteItem(null);
      load();
    } catch {
      setDeleteError('Error al eliminar el archivo. Intenta nuevamente.');
    } finally {
      setDeleting(false);
    }
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  const totalVentas = uploads.reduce((s, u) => s + u.sales_count, 0);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Archivos de Ventas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {uploads.length} archivos cargados · {totalVentas.toLocaleString('es-CL')} registros en total
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={15} />
          Actualizar
        </button>
      </div>

      {/* Error global */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Cargando archivos...</div>
        ) : uploads.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            No hay archivos de ventas cargados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Archivo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha de carga</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Filas procesadas</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ventas en BD</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {uploads.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet size={16} className="text-green-600 flex-shrink-0" />
                        <span className="font-medium text-gray-800 truncate max-w-xs">{u.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmt(u.upload_date)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{u.rows_processed.toLocaleString('es-CL')}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-blue-700">{u.sales_count.toLocaleString('es-CL')}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setDeleteItem(u); setDeleteError(''); }}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Eliminar archivo y sus ventas"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Eliminar archivo de ventas</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Estás a punto de eliminar <span className="font-medium text-gray-800">"{deleteItem.filename}"</span> y todas sus{' '}
                  <span className="font-semibold text-red-600">{deleteItem.sales_count.toLocaleString('es-CL')} ventas</span> asociadas.
                </p>
                <p className="text-sm text-red-600 mt-2 font-medium">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            {deleteError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={15} /> {deleteError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteItem(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
