import React, { useEffect, useState } from 'react';
import { MapPin, Settings, RefreshCw } from 'lucide-react';
import { getGeoPermissionState, requestGeoPermission, GeoPermission, prefetchGeoPosition } from '../utils/geo';
import { detectPlatform } from '../utils/pwaInstall';

const LATER_KEY = 'vm_geo_later';

function DeniedHelp() {
  const p = detectPlatform();
  if (p === 'ios-safari' || p === 'ios-other') {
    return (
      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700">
        <li>Abre <strong>Ajustes</strong> del iPhone → <strong>Privacidad y seguridad</strong> → <strong>Localización</strong>.</li>
        <li>Verifica que <strong>Localización</strong> esté activada.</li>
        <li>Entra a <strong>Sitios web de Safari</strong> y elige <strong>"Al usar la app"</strong> o <strong>"Preguntar"</strong>. Activa también <strong>Ubicación exacta</strong>.</li>
        <li>Si la app sigue sin pedirla: en Ajustes → <strong>Apps → Safari → Ubicación</strong>, elige <strong>"Preguntar"</strong> o <strong>"Permitir"</strong>.</li>
        <li>Cierra la app Narma por completo y vuelve a abrirla.</li>
      </ol>
    );
  }
  if (p === 'android' || p === 'in-app') {
    return (
      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700">
        <li>Mantén presionado el ícono de <strong>Narma</strong> → <strong>Información de la app</strong> → <strong>Permisos</strong> → <strong>Ubicación</strong> → <strong>Permitir</strong>.</li>
        <li>Si no aparece: abre <strong>Chrome</strong> → menú ⋮ → <strong>Configuración</strong> → <strong>Configuración de sitios</strong> → <strong>Ubicación</strong> → quita el bloqueo de este sitio.</li>
        <li>Verifica que la <strong>ubicación del teléfono</strong> esté encendida (panel de accesos rápidos).</li>
      </ol>
    );
  }
  return (
    <p className="text-sm text-gray-700">
      Haz clic en el ícono del candado junto a la dirección del sitio → <strong>Ubicación</strong> → <strong>Permitir</strong>, y recarga la página.
    </p>
  );
}

/**
 * Para visitadores: exige el permiso de ubicación. Muestra una pantalla para
 * activarlo (al abrir la app instalada por primera vez, o si está bloqueado)
 * y un aviso persistente mientras no esté concedido.
 */
export default function LocationPermissionGate() {
  const [state, setState] = useState<GeoPermission>('unknown');
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(() => {
    try { return sessionStorage.getItem(LATER_KEY) === '1'; } catch { return false; }
  });

  const refresh = async () => {
    const s = await getGeoPermissionState();
    setState(s);
    if (s === 'granted') prefetchGeoPosition();
  };

  useEffect(() => {
    refresh();
    let status: PermissionStatus | null = null;
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(r => { status = r; r.onchange = () => refresh(); })
      .catch(() => {});
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (status) status.onchange = null;
    };
  }, []);

  const activate = async () => {
    setBusy(true);
    const r = await requestGeoPermission();
    setBusy(false);
    setState(r === 'granted' ? 'granted' : await getGeoPermissionState().then(s => (s === 'unknown' ? r : s)));
  };

  const postpone = () => {
    setLater(true);
    try { sessionStorage.setItem(LATER_KEY, '1'); } catch {}
  };

  if (state === 'granted' || state === 'unsupported') return null;

  const denied = state === 'denied';

  // Aviso persistente (después de "Más tarde")
  if (later) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border-b border-red-200 px-4 lg:px-6 py-2.5 text-sm">
        <MapPin size={15} className="text-red-500 flex-shrink-0" />
        <p className="text-red-800 flex-1">
          <strong>Ubicación desactivada:</strong> tus visitas y recorrido no se están registrando.
        </p>
        <button onClick={() => setLater(false)} className="btn-primary py-1 px-3 text-xs flex-shrink-0">
          Activar
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 pb-8 sm:pb-6 max-h-[90vh] overflow-y-auto">
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          {denied ? <Settings size={26} className="text-blue-600" /> : <MapPin size={26} className="text-blue-600" />}
        </div>
        <h2 className="text-lg font-bold text-gray-900 text-center mb-2">
          {denied ? 'La ubicación está bloqueada' : 'Activa tu ubicación'}
        </h2>
        <p className="text-sm text-gray-600 text-center mb-5">
          Narma registra tu ubicación mientras usas la app para validar tus visitas y mostrar tu recorrido del día.
        </p>

        {denied ? (
          <>
            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-sm font-semibold text-gray-800 mb-2">Para activarla:</p>
              <DeniedHelp />
            </div>
            <button onClick={activate} disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3 text-sm disabled:opacity-60">
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Ya la activé, verificar
            </button>
          </>
        ) : (
          <button onClick={activate} disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3 text-sm disabled:opacity-60">
            <MapPin size={16} /> {busy ? 'Esperando permiso…' : 'Permitir ubicación'}
          </button>
        )}
        <button onClick={postpone} className="w-full mt-2 py-2.5 text-sm text-gray-500 hover:text-gray-700">
          Más tarde
        </button>
      </div>
    </div>
  );
}
