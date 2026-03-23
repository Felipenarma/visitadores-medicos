import React, { useState } from 'react';
import { Upload, Download, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { cardexApi, visitsApi } from '../../api';

export default function CardexUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setResult(null); setError(''); }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError(''); setResult(null);
    try {
      const res = await cardexApi.upload(file);
      setResult(res);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al cargar el archivo');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await cardexApi.downloadTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_cardex.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error al descargar plantilla');
    }
  };

  const handleGenerateVisits = async () => {
    setGenerating(true); setGenResult('');
    try {
      const res = await visitsApi.generate({ months_ahead: 6 });
      setGenResult(res.message);
    } catch (e: any) {
      setGenResult(e.response?.data?.detail || 'Error al generar visitas');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Carga de Cardex</h1>
        <p className="text-gray-500 text-sm mt-1">Importa tu lista de médicos desde un archivo CSV o Excel</p>
      </div>

      {/* Template download */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-green-50 rounded-xl">
            <FileSpreadsheet size={24} className="text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">Plantilla de Cardex</h2>
            <p className="text-sm text-gray-500 mt-1">
              Descarga la plantilla con las columnas requeridas para importar médicos correctamente.
            </p>
            <div className="mt-3">
              <p className="text-xs text-gray-400 font-medium mb-2">Columnas requeridas:</p>
              <div className="flex flex-wrap gap-2">
                {['nombre_medico', 'especialidad', 'direccion', 'telefono', 'email', 'nombre_visitador', 'linea_negocio', 'frecuencia_visita_dias', 'productos_prescribe', 'notas'].map(col => (
                  <span key={col} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded font-mono">{col}</span>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleDownloadTemplate} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
            <Download size={16} /> Descargar Plantilla
          </button>
        </div>
      </div>

      {/* Upload */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Cargar Archivo</h2>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setFile(f); setResult(null); setError(''); }
          }}
          onDragOver={e => e.preventDefault()}
        >
          <Upload size={36} className={`mx-auto mb-3 ${file ? 'text-blue-500' : 'text-gray-400'}`} />
          {file ? (
            <div>
              <p className="font-medium text-blue-700">{file.name}</p>
              <p className="text-sm text-blue-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 font-medium">Arrastra tu archivo aquí</p>
              <p className="text-sm text-gray-400">o haz clic para seleccionar</p>
            </div>
          )}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
            style={{ position: 'absolute', inset: 0 }}
          />
        </div>

        <div className="relative">
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400'} relative`}
          >
            <Upload size={36} className={`mx-auto mb-3 ${file ? 'text-blue-500' : 'text-gray-400'}`} />
            {file ? (
              <div>
                <p className="font-medium text-blue-700">{file.name}</p>
                <p className="text-sm text-blue-500">{(file.size / 1024).toFixed(1)} KB</p>
                <button className="text-xs text-blue-400 mt-1 hover:text-blue-600" onClick={() => setFile(null)}>
                  Cambiar archivo
                </button>
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
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          {file && (
            <button
              onClick={() => { setFile(null); setResult(null); setError(''); }}
              className="btn-secondary"
            >
              Limpiar
            </button>
          )}
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn-primary flex items-center gap-2"
          >
            <Upload size={16} />
            {uploading ? 'Cargando...' : 'Cargar Cardex'}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
            <AlertCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-green-500" />
              <p className="text-green-700 font-medium">{result.message}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-white rounded-lg p-3 text-center border border-green-100">
                <p className="text-2xl font-bold text-gray-900">{result.total_rows}</p>
                <p className="text-xs text-gray-500">Total filas</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-green-100">
                <p className="text-2xl font-bold text-green-600">{result.created}</p>
                <p className="text-xs text-gray-500">Creados</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-green-100">
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                <p className="text-xs text-gray-500">Actualizados</p>
              </div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-orange-600">Advertencias:</p>
                {result.errors.map((e: string, i: number) => (
                  <p key={i} className="text-xs text-orange-500">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generate Visits */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-2">Generar Calendario de Visitas</h2>
        <p className="text-sm text-gray-500 mb-4">
          Genera automáticamente las visitas para los próximos 6 meses basado en la frecuencia de visita de cada médico.
        </p>
        <button
          onClick={handleGenerateVisits}
          disabled={generating}
          className="btn-primary flex items-center gap-2"
        >
          <CheckCircle size={16} />
          {generating ? 'Generando...' : 'Generar Visitas (6 meses)'}
        </button>
        {genResult && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-blue-700 text-sm">{genResult}</p>
          </div>
        )}
      </div>
    </div>
  );
}
