import { useState } from 'react';
import { FileSpreadsheet, X, Download, RefreshCw } from 'lucide-react';
import { dashboardApi } from '../api';

/** Descarga "Recetas por médico según visitador" (histórico o por rango de meses). */
export default function RecetasExportButton() {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'historico' | 'rango'>('historico');
  const [desde, setDesde] = useState(`${now.getFullYear()}-01`);
  const [hasta, setHasta] = useState(thisMonth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setLoading(true); setError('');
    try {
      const { blob, filename } = await dashboardApi.exportRecetasPorMedico(
        mode === 'rango' ? desde : undefined, mode === 'rango' ? hasta : undefined,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch {
      setError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally { setLoading(false); }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <FileSpreadsheet size={15} /> Recetas por médico
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl shadow-xl border border-gray-200 z-40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Recetas por médico según visitador</p>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={16} /></button>
          </div>
          <p className="text-xs text-gray-500">
            Excel con cada médico activo, su visitador, recetas y venta neta (sin IVA), más resúmenes por visitador y por grupo.
          </p>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={mode === 'historico'} onChange={() => setMode('historico')} />
              Histórico completo
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={mode === 'rango'} onChange={() => setMode('rango')} />
              Elegir período
            </label>
            {mode === 'rango' && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <label className="text-xs text-gray-500">Desde
                  <input type="month" value={desde} max={thisMonth} onChange={e => setDesde(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700" />
                </label>
                <label className="text-xs text-gray-500">Hasta
                  <input type="month" value={hasta} max={thisMonth} onChange={e => setHasta(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700" />
                </label>
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={download}
            disabled={loading || (mode === 'rango' && (!desde || !hasta))}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
            {loading ? 'Generando…' : 'Descargar Excel'}
          </button>
        </div>
      )}
    </div>
  );
}
