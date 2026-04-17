import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, BookOpen, Search, X, Upload, FileText, File, CheckCircle, AlertCircle, FolderOpen } from 'lucide-react';
import { knowledgeApi, businessLinesApi } from '../api';

interface KBEntry {
  id: number;
  title: string;
  category: string;
  content: string;
  business_line_id: number | null;
  business_line_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface Category {
  value: string;
  label: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  productos: 'bg-blue-100 text-blue-800',
  protocolos: 'bg-green-100 text-green-800',
  faq: 'bg-purple-100 text-purple-800',
  general: 'bg-gray-100 text-gray-800',
  archivo: 'bg-orange-100 text-orange-800',
};

const ACCEPTED_FORMATS = '.pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json';

export default function KnowledgeBase() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [businessLines, setBusinessLines] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [form, setForm] = useState({ title: '', category: 'productos', content: '', business_line_id: '' as string, is_active: true });
  const [loading, setLoading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('archivo');
  const [uploadBL, setUploadBL] = useState('');
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState('');

  const loadData = async () => {
    try {
      const [entriesData, catsData, blData] = await Promise.all([
        knowledgeApi.getAll(filterCategory || undefined),
        knowledgeApi.getCategories(),
        businessLinesApi.getAll(),
      ]);
      setEntries(entriesData);
      setCategories(catsData);
      setBusinessLines(blData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadData(); }, [filterCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        category: form.category,
        content: form.content,
        business_line_id: form.business_line_id ? parseInt(form.business_line_id) : null,
        is_active: form.is_active,
      };
      if (editing) {
        await knowledgeApi.update(editing.id, payload);
      } else {
        await knowledgeApi.create(payload);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ title: '', category: 'productos', content: '', business_line_id: '', is_active: true });
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const SUPPORTED_EXT = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.json'];

  const filterSupported = (files: File[]) =>
    files.filter(f => SUPPORTED_EXT.some(ext => f.name.toLowerCase().endsWith(ext)));

  const uploadFiles = async (files: File[]) => {
    const supported = filterSupported(files);
    if (supported.length === 0) {
      setUploadResult({ success: false, message: `Ninguno de los ${files.length} archivos tiene formato soportado (PDF, Word, Excel, CSV, TXT)` });
      return;
    }
    setUploading(true);
    setUploadResult(null);
    setUploadProgress(`Procesando ${supported.length} archivo(s)...`);
    try {
      const blId = uploadBL ? parseInt(uploadBL) : undefined;
      if (supported.length === 1) {
        const result = await knowledgeApi.upload(supported[0], uploadCategory, blId);
        setUploadResult(result);
      } else {
        const result = await knowledgeApi.uploadMultiple(supported, uploadCategory, blId);
        if (supported.length < files.length) {
          result.message += ` (${files.length - supported.length} archivos ignorados por formato no soportado)`;
        }
        setUploadResult(result);
      }
      loadData();
    } catch (err: any) {
      setUploadResult({ success: false, message: err?.response?.data?.detail || 'Error al procesar archivo(s)' });
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileRef.current) fileRef.current.value = '';
      if (folderRef.current) folderRef.current.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    await uploadFiles(Array.from(fileList));
  };

  const handleEdit = (entry: KBEntry) => {
    setEditing(entry);
    setForm({
      title: entry.title,
      category: entry.category,
      content: entry.content,
      business_line_id: entry.business_line_id ? String(entry.business_line_id) : '',
      is_active: entry.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta entrada?')) return;
    await knowledgeApi.delete(id);
    loadData();
  };

  const filtered = entries.filter(e =>
    !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Base de Conocimiento</h1>
          <p className="text-gray-500 text-sm mt-1">Información de apoyo para el agente IA</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowUpload(true); setUploadResult(null); }} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium text-sm">
            <Upload size={18} /> Cargar Archivo
          </button>
          <button onClick={() => { setEditing(null); setForm({ title: '', category: 'productos', content: '', business_line_id: '', is_active: true }); setShowForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Agregar Manual
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="input pl-9 w-full" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input w-48">
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {categories.map(cat => {
          const count = entries.filter(e => e.category === cat.value).length;
          return (
            <div key={cat.value} className={`bg-white border rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 transition-colors ${filterCategory === cat.value ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`} onClick={() => setFilterCategory(filterCategory === cat.value ? '' : cat.value)}>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500">{cat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Entries list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No hay entradas en la base de conocimiento</p>
            <p className="text-gray-400 text-sm mt-1">Agrega información manualmente o carga archivos (PDF, Word, Excel, CSV)</p>
          </div>
        ) : filtered.map(entry => (
          <div key={entry.id} className={`bg-white border rounded-xl p-4 ${entry.is_active ? 'border-gray-200' : 'border-red-200 opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {entry.category === 'archivo' && <FileText size={16} className="text-orange-500" />}
                  <h3 className="font-semibold text-gray-900">{entry.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.general}`}>
                    {entry.category}
                  </span>
                  {entry.business_line_name && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{entry.business_line_name}</span>
                  )}
                  {!entry.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Inactivo</span>}
                </div>
                <p className={`text-sm text-gray-600 whitespace-pre-wrap ${expandedId === entry.id ? '' : 'line-clamp-3'}`}>
                  {entry.content}
                </p>
                {entry.content.length > 200 && (
                  <button className="text-xs text-blue-500 mt-1 hover:underline">
                    {expandedId === entry.id ? 'Ver menos' : 'Ver más...'}
                  </button>
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => handleEdit(entry)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(entry.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Upload size={20} /> Cargar Archivo</h2>
              <button onClick={() => setShowUpload(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800 font-medium mb-1">Formatos soportados</p>
                <div className="flex flex-wrap gap-2">
                  {['PDF', 'Word (.docx)', 'Excel (.xlsx)', 'CSV', 'Texto (.txt)'].map(f => (
                    <span key={f} className="text-xs bg-white px-2 py-1 rounded border border-blue-200 text-blue-700">{f}</span>
                  ))}
                </div>
                <p className="text-xs text-blue-600 mt-2">El sistema extraerá el texto automáticamente y lo agregará a la base de conocimiento del agente IA.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoría</label>
                  <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} className="input w-full">
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Línea de negocio</label>
                  <select value={uploadBL} onChange={e => setUploadBL(e.target.value)} className="input w-full">
                    <option value="">General</option>
                    {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Archivos</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center hover:border-blue-400 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
                    <File size={28} className="mx-auto text-gray-400 mb-1" />
                    <p className="text-sm text-gray-600">Seleccionar archivos</p>
                    <p className="text-xs text-gray-400 mt-1">Uno o varios</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={ACCEPTED_FORMATS}
                      onChange={handleFileUpload}
                      multiple
                      className="hidden"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Carpeta completa</label>
                  <div className="border-2 border-dashed border-orange-300 rounded-xl p-5 text-center hover:border-orange-400 transition-colors cursor-pointer" onClick={() => folderRef.current?.click()}>
                    <FolderOpen size={28} className="mx-auto text-orange-400 mb-1" />
                    <p className="text-sm text-gray-600">Seleccionar carpeta</p>
                    <p className="text-xs text-gray-400 mt-1">Todos los archivos</p>
                    <input
                      ref={folderRef}
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                      {...{ webkitdirectory: '', directory: '' } as any}
                    />
                  </div>
                </div>
              </div>

              {uploading && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
                  <p className="text-sm text-blue-700">{uploadProgress || 'Procesando...'}</p>
                </div>
              )}

              {uploadResult && (
                <div className={`flex items-start gap-3 rounded-xl p-4 ${uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {uploadResult.success ? <CheckCircle size={20} className="text-green-500 mt-0.5" /> : <AlertCircle size={20} className="text-red-500 mt-0.5" />}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${uploadResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {uploadResult.message}
                    </p>
                    {uploadResult.entries_created != null && (
                      <p className="text-xs text-green-600 mt-1">
                        {uploadResult.entries_created} entrada(s) creada(s) · {uploadResult.total_characters?.toLocaleString()} caracteres
                      </p>
                    )}
                    {uploadResult.total_entries_created != null && (
                      <p className="text-xs text-green-600 mt-1">
                        {uploadResult.total_entries_created} entrada(s) creada(s) · {uploadResult.total_characters?.toLocaleString()} caracteres
                      </p>
                    )}
                    {uploadResult.files && (
                      <div className="mt-2 space-y-1">
                        {uploadResult.files.map((f: any, i: number) => (
                          <div key={i} className={`text-xs flex items-center gap-1 ${f.success ? 'text-green-700' : 'text-red-700'}`}>
                            {f.success ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                            {f.filename} {f.success ? `(${f.entries_created} entradas)` : `- ${f.message}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button onClick={() => setShowUpload(false)} className="btn-secondary w-full">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual entry form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">{editing ? 'Editar entrada' : 'Nueva entrada manual'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Título</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input w-full" placeholder="Ej: Información sobre Producto X" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoría</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input w-full">
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Línea de negocio (opcional)</label>
                  <select value={form.business_line_id} onChange={e => setForm({ ...form, business_line_id: e.target.value })} className="input w-full">
                    <option value="">General</option>
                    {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Contenido</label>
                <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="input w-full" rows={8} placeholder="Escribe aquí toda la información que quieres que el agente conozca..." required />
                <p className="text-xs text-gray-400 mt-1">El agente usará esta información para responder a los visitadores</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                <label htmlFor="is_active" className="text-sm text-gray-700">Activo (visible para el agente)</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Guardando...' : editing ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
