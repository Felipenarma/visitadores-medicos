import React, { useEffect, useRef, useState } from 'react';
import { MapPin, RefreshCw, Filter } from 'lucide-react';
import { repsApi } from '../../api';
import type { MedicalRep } from '../../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface LocationEvent {
  type: 'visit' | 'agent';
  id: number;
  rep_id: number;
  rep_name: string;
  doctor_name: string | null;
  status: string | null;
  lat: number;
  lng: number;
  timestamp: string | null;
  label: string;
}

const VISIT_COLORS: Record<string, string> = {
  completed: '#10B981',
  scheduled: '#3B82F6',
  missed: '#EF4444',
  cancelled: '#6B7280',
};

export default function LocationMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const [events, setEvents] = useState<LocationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reps, setReps] = useState<MedicalRep[]>([]);
  const [filterRep, setFilterRep] = useState<number | ''>('');
  const [filterDays, setFilterDays] = useState(30);
  const [filterType, setFilterType] = useState<'all' | 'visit' | 'agent'>('all');
  const [total, setTotal] = useState(0);
  const leafletLoaded = useRef(false);

  useEffect(() => {
    repsApi.getAll().then(setReps).catch(() => {});
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(filterDays) });
      if (filterRep) params.set('rep_id', String(filterRep));
      const res = await fetch(`${API_URL}/dashboard/locations?${params}`);
      const data = await res.json();
      setEvents(data.events || []);
      setTotal(data.total || 0);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLocations(); }, [filterRep, filterDays]);

  // Cargar Leaflet una sola vez
  useEffect(() => {
    if (leafletLoaded.current) return;
    leafletLoaded.current = true;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { leafletRef.current = (window as any).L; initMap(); };
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  const initMap = () => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const L = (window as any).L;
    const map = L.map(mapRef.current).setView([-33.45, -70.65], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    mapInstanceRef.current = map;
  };

  // Actualizar marcadores cuando cambian eventos o filtro de tipo
  useEffect(() => {
    const L = leafletRef.current || (window as any).L;
    if (!L || !mapInstanceRef.current) return;

    // Esperar si el mapa aún no está listo
    const timer = setTimeout(() => updateMarkers(), 300);
    return () => clearTimeout(timer);
  }, [events, filterType]);

  const updateMarkers = () => {
    const L = leafletRef.current || (window as any).L;
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Limpiar capas existentes (no el tile layer)
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    const visible = events.filter(e => filterType === 'all' || e.type === filterType);
    const bounds: [number, number][] = [];

    visible.forEach(e => {
      const color = e.type === 'agent' ? '#8B5CF6' : (VISIT_COLORS[e.status || ''] || '#3B82F6');
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:50%;
          background:${color};border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
          font-size:12px;color:white;font-weight:bold;
        ">${e.type === 'agent' ? '🤖' : '👁'}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const ts = e.timestamp ? new Date(e.timestamp).toLocaleString('es-CL') : '';
      const popup = `
        <div style="font-size:13px;min-width:180px">
          <strong>${e.rep_name}</strong><br/>
          ${e.label}<br/>
          ${e.doctor_name ? `<span style="color:#6B7280">Médico: ${e.doctor_name}</span><br/>` : ''}
          ${ts ? `<span style="color:#9CA3AF;font-size:11px">${ts}</span>` : ''}
        </div>`;

      L.marker([e.lat, e.lng], { icon }).addTo(map).bindPopup(popup);
      bounds.push([e.lat, e.lng]);
    });

    if (bounds.length > 0) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }); } catch { /* ignore */ }
    }
  };

  const visibleCount = events.filter(e => filterType === 'all' || e.type === filterType).length;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={24} className="text-blue-600" /> Mapa de Actividad
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${visibleCount} eventos en el mapa`}
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input text-sm py-1.5 w-40"
            value={filterRep}
            onChange={e => setFilterRep(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todos los visitadores</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <select
            className="input text-sm py-1.5 w-32"
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
          >
            <option value="all">Todo</option>
            <option value="visit">Visitas</option>
            <option value="agent">Agente IA</option>
          </select>

          <select
            className="input text-sm py-1.5 w-32"
            value={filterDays}
            onChange={e => setFilterDays(Number(e.target.value))}
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>

          <button
            onClick={fetchLocations}
            disabled={loading}
            className="btn-secondary py-1.5 px-3 flex items-center gap-1.5 text-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"/> Visita completada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"/> Visita programada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"/> Visita perdida</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block"/> Mensaje Agente IA</span>
      </div>

      {/* Mapa */}
      <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm relative">
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {events.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 pointer-events-none">
            <div className="text-center">
              <MapPin size={40} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">Sin ubicaciones registradas</p>
              <p className="text-gray-400 text-sm mt-1">
                Las ubicaciones se registran automáticamente cuando los visitadores<br/>
                crean visitas o usan el Agente IA desde su celular.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
