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
