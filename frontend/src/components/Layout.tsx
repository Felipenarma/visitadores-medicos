import React, { ReactNode, useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { MapPin } from 'lucide-react';
import { prefetchGeoPosition } from '../utils/geo';

interface LayoutProps {
  children: ReactNode;
}

function GeoPermissionBanner() {
  const [status, setStatus] = useState<'idle' | 'denied' | 'unavailable'>('idle');

  useEffect(() => {
    if (!navigator.geolocation) { setStatus('unavailable'); return; }

    // Solicitar ubicación inmediatamente al cargar para que el browser pida permiso ya
    prefetchGeoPosition();

    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'denied') setStatus('denied');
      result.onchange = () => setStatus(result.state === 'denied' ? 'denied' : 'idle');
    }).catch(() => {});
  }, []);

  if (status === 'denied') return (
    <div className="flex items-start gap-3 bg-amber-50 border-b border-amber-200 px-4 lg:px-6 py-2.5 text-sm">
      <MapPin size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
      <p className="text-amber-800">
        <strong>Ubicación bloqueada:</strong> tus visitas no aparecerán en el mapa de actividad.
        Actívala en <strong>Configuración de tu navegador → Privacidad → Ubicación</strong>.
      </p>
    </div>
  );

  return null;
}

export default function Layout({ children }: LayoutProps) {
  const { isAdmin } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto w-full flex flex-col">
        {!isAdmin && <GeoPermissionBanner />}
        <div className="p-4 lg:p-6 max-w-7xl mx-auto pt-16 lg:pt-6 w-full flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
