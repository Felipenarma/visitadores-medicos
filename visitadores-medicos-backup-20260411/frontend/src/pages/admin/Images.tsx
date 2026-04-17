import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Image, Copy, Check, X, QrCode } from 'lucide-react';
import { imagesApi, businessLinesApi } from '../../api';

interface ImageEntry {
  id: number;
  name: string;
  description: string;
  filename: string;
  category: string;
  business_line_id: number | null;
  business_line_name: string | null;
  url: string;
  created_at: string;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Images() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [businessLines, setBusinessLines] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category: 'qr', business_line_id: '' });
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const loadData = async () => {
    const [imgs, bls] = await Promise.all([
      imagesApi.getAll(),
      businessLinesApi.getAll(),
    ]);
    setImages(imgs);
    setBusinessLines(bls);
  };

  useEffect(() => { loadData(); }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    try {
      const blId = form.business_line_id ? parseInt(form.business_line_id) : undefined;
      await imagesApi.upload(selectedFile, form.name, form.description, form.category, blId);
      setShowUpload(false);
      setSelectedFile(null);
      setPreview(null);
      setForm({ name: '', description: '', category: 'qr', business_line_id: '' });
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminar esta imagen?')) return;
    await imagesApi.delete(id);
    loadData();
  };

  const copyUrl = (img: ImageEntry) => {
    const fullUrl = `${API_URL}/images/${img.id}/file`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(img.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getImageSrc = (img: ImageEntry) => `${API_URL}/images/${img.id}/file`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Imagenes y QR</h1>
          <p className="text-gray-500 text-sm mt-1">Sube QR codes e imagenes que el agente puede compartir</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Subir Imagen
        </button>
      </div>

      {/* Grid */}
      {images.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <QrCode size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay imagenes cargadas</p>
          <p className="text-gray-400 text-sm mt-1">Sube QR codes o imagenes de productos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map(img => (
            <div key={img.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="aspect-square bg-gray-50 flex items-center justify-center p-4">
                <img src={getImageSrc(img)} alt={img.name} className="max-w-full max-h-full object-contain" />
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 text-sm">{img.name}</h3>
                {img.description && <p className="text-xs text-gray-500 mt-1">{img.description}</p>}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{img.category}</span>
                  {img.business_line_name && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{img.business_line_name}</span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => copyUrl(img)} className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                    {copied === img.id ? <><Check size={14} className="text-green-500" /> Copiado</> : <><Copy size={14} /> Copiar URL</>}
                  </button>
                  <button onClick={() => handleDelete(img.id)} className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Subir Imagen</h2>
              <button onClick={() => { setShowUpload(false); setSelectedFile(null); setPreview(null); }} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpload} className="p-5 space-y-4">
              <div>
                <label className="label">Nombre</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input w-full" placeholder="Ej: QR Cotizacion Cannabis" required />
              </div>
              <div>
                <label className="label">Descripcion</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input w-full" placeholder="Ej: QR para que el medico cotice productos cannabis" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input w-full">
                    <option value="qr">Codigo QR</option>
                    <option value="product">Producto</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="label">Linea de negocio</label>
                  <select value={form.business_line_id} onChange={e => setForm({ ...form, business_line_id: e.target.value })} className="input w-full">
                    <option value="">General</option>
                    {businessLines.map(bl => <option key={bl.id} value={bl.id}>{bl.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Imagen</label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-blue-400 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
                  {preview ? (
                    <img src={preview} alt="Preview" className="max-h-40 mx-auto rounded" />
                  ) : (
                    <>
                      <Image size={32} className="mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600">Haz clic para seleccionar</p>
                      <p className="text-xs text-gray-400">PNG, JPG, GIF, WebP</p>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowUpload(false); setSelectedFile(null); setPreview(null); }} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={uploading || !selectedFile} className="btn-primary flex-1">
                  {uploading ? 'Subiendo...' : 'Subir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
