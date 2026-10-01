// src/utils/geo.ts — great-circle distance (no PostGIS needed)
export interface LatLng { latitude: number; longitude: number }

export function distanceKm(a: LatLng | null, b: LatLng | null): number | null {
  if (!a || !b) return null;
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function toLatLng(lat: unknown, lng: unknown): LatLng | null {
  const latitude = lat == null ? NaN : Number(lat);
  const longitude = lng == null ? NaN : Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}
