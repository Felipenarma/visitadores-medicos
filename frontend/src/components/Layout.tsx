import React, { ReactNode, useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { MapPin, Download, X } from 'lucide-react';
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

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('vm_install_dismissed') === '1');

  useEffect(() => {
    if (isStandalone()) return;
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('vm_install_dismissed', '1');
  };

  if (dismissed || isStandalone()) return null;
  if (!deferredPrompt && !isIOS) return null;

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  return (
    <div className="flex items-center gap-3 bg-blue-50 border-b border-blue-200 px-4 lg:px-6 py-2.5 text-sm">
      <Download size={15} className="text-blue-600 flex-shrink-0" />
      <p className="text-blue-800 flex-1">
        {isIOS
          ? <><strong>Instala esta app:</strong> toca <strong>Compartir</strong> y luego <strong>"Agregar a inicio"</strong>.</>
          : <><strong>Instala esta app</strong> en tu celular para acceder más rápido, como cualquier otra app.</>}
      </p>
      {!isIOS && (
        <button onClick={install} className="btn-primary py-1 px-3 text-xs flex-shrink-0">
          Instalar
        </button>
      )}
      <button onClick={dismiss} className="text-blue-400 hover:text-blue-600 flex-shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}

export default function Layout({ children }: LayoutProps) {
  const { isAdmin } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto w-full flex flex-col">
        <InstallAppBanner />
        {!isAdmin && <GeoPermissionBanner />}
        <div className="p-4 lg:p-6 max-w-7xl mx-auto pt-16 lg:pt-6 w-full flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
