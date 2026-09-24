import React, { useEffect, useRef, useState } from 'react';
import { Radar, RefreshCw, Route, Calendar } from 'lucide-react';
import { dashboardApi, repsApi } from '../../api';
import type { MedicalRep } from '../../types';

interface LiveRep {
  rep_id: number;
  rep_name: string;
  lat: number;
  lng: number;
  last_activity: string | null;
  minutes_since: number | null;
  online: boolean;
}

interface HistoryPoint {
  lat: number;
  lng: number;
  recorded_at: string | null;
}

const REFRESH_MS = 30 * 1000; // 30 segundos

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function LiveTracking() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const leafletLoaded = useRef(false);
  const [reps, setReps] = useState<LiveRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Recorrido del día
  const historyMapRef = useRef<HTMLDivElement>(null);
  const historyMapInstanceRef = useRef<any>(null);
  const [allReps, setAllReps] = useState<MedicalRep[]>([]);
  const [historyRepId, setHistoryRepId] = useState<number | ''>('');
  const [historyDate, setHistoryDate] = useState<string>(todayISO());
  const [historyPoints, setHistoryPoints] = useState<HistoryPoint[]>([]);
  const [historyRepName, setHistoryRepName] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearched, setHistorySearched] = useState(false);

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

  useEffect(() => {
    repsApi.getAll().then(setAllReps).catch(() => {});
  }, []);

  const fetchHistory = async () => {
    if (!historyRepId) return;
    setHistoryLoading(true);
    setHistorySearched(true);
    try {
      const data = await dashboardApi.getLocationHistory(historyRepId, historyDate);
      setHistoryPoints(data.points || []);
      setHistoryRepName(data.rep_name);
    } catch {
      setHistoryPoints([]);
    } finally {
      setHistoryLoading(false);
    }
  };

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
    initHistoryMap();
  };

  const initHistoryMap = () => {
    if (!historyMapRef.current || historyMapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map(historyMapRef.current).setView([-33.45, -70.65], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    historyMapInstanceRef.current = map;
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

  useEffect(() => {
    const L = leafletRef.current || (window as any).L;
    const map = historyMapInstanceRef.current;
    if (!L || !map) return;

    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    if (historyPoints.length === 0) return;

    const latlngs = historyPoints.map(p => [p.lat, p.lng]) as [number, number][];
    L.polyline(latlngs, { color: '#2563EB', weight: 3, opacity: 0.7 }).addTo(map);

    const fmtTime = (iso: string | null) => {
      if (!iso) return '';
      try { return new Date(iso + 'Z').toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); }
      catch { return ''; }
    };

    historyPoints.forEach((p, i) => {
      const isFirst = i === 0;
      const isLast = i === historyPoints.length - 1;
      const color = isFirst ? '#10B981' : isLast ? '#EF4444' : '#2563EB';
      L.circleMarker([p.lat, p.lng], {
        radius: isFirst || isLast ? 7 : 4,
        color: 'white',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(`<div style="font-size:12px">${isFirst ? 'Inicio' : isLast ? 'Última posición' : 'Punto'} · ${fmtTime(p.recorded_at)}</div>`);
    });

    try { map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 15 }); } catch { /* ignore */ }
  }, [historyPoints]);

  const onlineCount = reps.filter(r => r.online).length;

  return (
    <div className="flex flex-col">
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

      <div className="h-[480px] rounded-xl overflow-hidden border border-gray-200 shadow-sm relative">
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

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
          <Route size={20} className="text-blue-600" /> Recorrido del día
        </h2>
        <p className="text-gray-500 text-sm mb-4">
          Revisa el trayecto que hizo un visitador en una fecha específica, punto por punto.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Visitador</label>
            <select
              className="input py-1.5 text-sm min-w-[200px]"
              value={historyRepId}
              onChange={e => setHistoryRepId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Seleccionar...</option>
              {allReps.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
              <Calendar size={12} /> Fecha
            </label>
            <input
              type="date"
              className="input py-1.5 text-sm"
              value={historyDate}
              max={todayISO()}
              onChange={e => setHistoryDate(e.target.value)}
            />
          </div>
          <button
            onClick={fetchHistory}
            disabled={!historyRepId || historyLoading}
            className="btn-primary py-1.5 px-4 text-sm disabled:opacity-50"
          >
            {historyLoading ? 'Buscando...' : 'Ver recorrido'}
          </button>
          {historySearched && !historyLoading && (
            <span className="text-xs text-gray-500 mb-1.5">
              {historyPoints.length > 0
                ? `${historyPoints.length} puntos registrados${historyRepName ? ` · ${historyRepName}` : ''}`
                : 'Sin puntos de ubicación para esa fecha'}
            </span>
          )}
        </div>

        <div className="h-[420px] rounded-xl overflow-hidden border border-gray-200 shadow-sm relative">
          <div ref={historyMapRef} style={{ width: '100%', height: '100%' }} />
          {historySearched && !historyLoading && historyPoints.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 pointer-events-none">
              <div className="text-center">
                <Route size={40} className="text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 font-medium">No hay ubicaciones registradas ese día</p>
                <p className="text-gray-400 text-sm mt-1">
                  El visitador no abrió la app o no tenía el permiso de ubicación activado.
                </p>
              </div>
            </div>
          )}
        </div>
        {historyPoints.length > 0 && (
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"/> Inicio del día</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"/> Puntos intermedios</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/> Última posición</span>
          </div>
        )}
      </div>
    </div>
  );
}
