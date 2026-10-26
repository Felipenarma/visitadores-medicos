let cached: { latitude: number; longitude: number } | null = null;
let fetchedAt = 0;
const TTL = 5 * 60 * 1000; // 5 minutos

export async function getGeoPosition(): Promise<{ latitude: number; longitude: number } | null> {
  if (cached && Date.now() - fetchedAt < TTL) return cached;
  if (!navigator.geolocation) return null;
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        cached = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        fetchedAt = Date.now();
        resolve(cached);
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}

/** Llama sin await para solicitar el permiso en segundo plano al abrir la app. */
export function prefetchGeoPosition(): void {
  getGeoPosition().catch(() => {});
}

// ─── Permiso de ubicación ───────────────────────────────────────────────────
export type GeoPermission = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unknown';

/** Estado actual del permiso sin disparar el diálogo del navegador. */
export async function getGeoPermissionState(): Promise<GeoPermission> {
  if (!navigator.geolocation) return 'unsupported';
  try {
    if (navigator.permissions?.query) {
      const r = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return r.state as GeoPermission;
    }
  } catch {}
  return 'unknown';
}

/**
 * Pide el permiso explícitamente. Debe llamarse desde un toque del usuario
 * (botón): en la app instalada de iPhone el diálogo solo aparece así.
 */
export function requestGeoPermission(): Promise<GeoPermission> {
  if (!navigator.geolocation) return Promise.resolve('unsupported');
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        cached = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        fetchedAt = Date.now();
        resolve('granted');
      },
      err => resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'granted'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
