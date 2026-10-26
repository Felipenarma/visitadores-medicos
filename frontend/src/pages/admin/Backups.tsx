import { useEffect, useState } from 'react';
import { DatabaseBackup, Download, Mail, MailX, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { backupsApi, type BackupItem } from '../../api';

function fmtSize(b: number) {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  // created_at viene en UTC sin zona
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Backups() {
  const [items, setItems] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    backupsApi.list()
      .then(setItems)
      .catch(() => setError('No se pudieron cargar los respaldos.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const createNow = async () => {
    setCreating(true); setError('');
    try { await backupsApi.create(); load(); }
    catch { setError('Error al generar el respaldo. Intenta de nuevo.'); }
    finally { setCreating(false); }
  };

  const download = async (b: BackupItem) => {
    setDownloading(b.id);
    try {
      const blob = await backupsApi.download(b.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = b.filename; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Error al descargar.'); }
    finally { setDownloading(null); }
  };

  const last = items[0];
  const emailIssue = last && !last.emailed ? last.email_error : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DatabaseBackup size={24} className="text-blue-600" /> Respaldos
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Cada lunes a las 6:00 se genera un Excel con todos los médicos, el historial completo de ventas, visitas y visitadores,
            y se envía por correo. Se guardan los últimos 26 (≈ 6 meses). No incluye datos de pacientes.
          </p>
        </div>
        <button onClick={createNow} disabled={creating} className="btn-primary flex items-center gap-2 disabled:opacity-60">
          <RefreshCw size={16} className={creating ? 'animate-spin' : ''} />
          {creating ? 'Generando…' : 'Crear respaldo ahora'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {emailIssue && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
          <MailX size={16} className="shrink-0 mt-0.5" />
          <span>El último respaldo quedó guardado aquí, pero <strong>no se envió por correo</strong>: {emailIssue}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <Clock size={28} className="mx-auto mb-2 opacity-50" />
            Aún no hay respaldos. El primero se generará el próximo lunes, o créalo ahora.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map(b => (
              <div key={b.id} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <p className="font-medium text-gray-800 text-sm">{fmtDate(b.created_at)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {b.summary.medicos ?? 0} médicos · {(b.summary.ventas ?? 0).toLocaleString('es-CL')} ventas · {(b.summary.visitas ?? 0).toLocaleString('es-CL')} visitas · {fmtSize(b.size_bytes)}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${b.trigger === 'semanal' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  {b.trigger === 'semanal' ? 'Semanal' : 'Manual'}
                </span>
                <span title={b.email_error || ''} className={`text-xs flex items-center gap-1 ${b.emailed ? 'text-green-600' : 'text-gray-400'}`}>
                  {b.emailed ? <><Mail size={13} /> Enviado</> : <><MailX size={13} /> Sin correo</>}
                </span>
                <button
                  onClick={() => download(b)}
                  disabled={downloading === b.id}
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1 font-medium disabled:opacity-50"
                >
                  {downloading === b.id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />} Descargar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {last && last.emailed && (
        <p className="text-xs text-gray-400 flex items-center gap-1"><CheckCircle size={12} className="text-green-500" /> El último respaldo se envió por correo correctamente.</p>
      )}
    </div>
  );
}
