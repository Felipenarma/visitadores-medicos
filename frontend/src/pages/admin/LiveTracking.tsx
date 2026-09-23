import React, { useEffect, useRef, useState } from 'react';
import { Radar, RefreshCw } from 'lucide-react';
import { dashboardApi } from '../../api';

interface LiveRep {
  rep_id: number;
  rep_name: string;
  lat: number;
  lng: number;
  last_activity: string | null;
  minutes_since: number | null;
  online: boolean;
}

const REFRESH_MS = 30 * 1000; // 30 segundos

export default function LiveTracking() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const leafletLoaded = useRef(false);
  const [reps, setReps] = useState<LiveRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchLive = async () => {
    try {
      const data = await dashboardApi.getLiveLocations();
      setReps(data.reps || []);
      setLastRefresh(new Date());
    } catch {
      // mantener lo último conocido si falla una actualización puntual
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // Cargar Leaflet una sola vez
  useEffect(() => {
    if (leafletLoaded.current) return;
    leafletLoaded.current = true;

    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }

    if ((window as any).L) {
      leafletRef.current = (window as any).L;
      initMap();
      return;
    }
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
    updateMarkers();
  };

  useEffect(() => {
    const timer = setTimeout(() => updateMarkers(), 200);
    return () => clearTimeout(timer);
  }, [reps]);

  const updateMarkers = () => {
    const L = leafletRef.current || (window as any).L;
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    const bounds: [number, number][] = [];

    reps.forEach(r => {
      const color = r.online ? '#10B981' : '#9CA3AF';
      const pulse = r.online ? `
        <span style="
          position:absolute;inset:-6px;border-radius:50%;
          border:2px solid ${color};opacity:0.6;
          animation:live-pulse 1.6s ease-out infinite;
        "></span>` : '';
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:30px;height:30px;">
          ${pulse}
          <div style="
            width:30px;height:30px;border-radius:50%;
            background:${color};border:3px solid white;
            box-shadow:0 2px 6px rgba(0,0,0,0.35);
            display:flex;align-items:center;justify-content:center;
            font-size:13px;color:white;font-weight:bold;
          ">📍</div>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const mins = r.minutes_since;
      const freshness = mins === null ? '' : mins < 1 ? 'hace instantes' : `hace ${mins} min`;
      const popup = `
        <div style="font-size:13px;min-width:170px">
          <strong>${r.rep_name}</strong><br/>
          <span style="color:${r.online ? '#059669' : '#6B7280'}">${r.online ? '● En línea' : '○ Desconectado'}</span><br/>
          <span style="color:#9CA3AF;font-size:11px">Última actualización: ${freshness}</span>
        </div>`;

      L.marker([r.lat, r.lng], { icon }).addTo(map).bindPopup(popup);
      bounds.push([r.lat, r.lng]);
    });

    if (bounds.length > 0) {
      try { map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 }); } catch { /* ignore */ }
    }
  };

  const onlineCount = reps.filter(r => r.online).length;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <style>{`
        @keyframes live-pulse {
          0% { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radar size={24} className="text-emerald-600" /> Seguimiento en Vivo
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${onlineCount} de ${reps.length} visitadores en línea ahora`}
            {lastRefresh && ` · actualizado ${lastRefresh.toLocaleTimeString('es-CL')}`}
          </p>
        </div>
        <button
          onClick={fetchLive}
          disabled={loading}
          className="btn-secondary py-1.5 px-3 flex items-center gap-1.5 text-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar ahora
        </button>
      </div>

      <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"/> En línea (actividad reciente)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block"/> Desconectado / sin actividad reciente</span>
      </div>

      <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm relative">
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {reps.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 pointer-events-none">
            <div className="text-center">
              <Radar size={40} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">Ningún visitador conectado ahora mismo</p>
              <p className="text-gray-400 text-sm mt-1">
                La posición se actualiza automáticamente cada pocos minutos<br/>
                mientras el visitador tiene la app abierta en su celular.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
