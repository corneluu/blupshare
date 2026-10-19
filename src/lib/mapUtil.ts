import { LngLatBounds, type Map as MlMap } from 'maplibre-gl'

export type LngLat = { lat: number; lng: number }

export function haversineM(a: LngLat, b: LngLat) {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)
export const walkMin = (m: number) => Math.max(1, Math.round(m / (5000 / 60))) // 5 km/h

export function fitPoints(map: MlMap, pts: LngLat[], maxZoom = 15) {
  if (!pts.length) return
  const b = new LngLatBounds()
  pts.forEach((p) => b.extend([p.lng, p.lat]))
  map.fitBounds(b, { padding: { top: 90, bottom: 300, left: 50, right: 70 }, maxZoom, duration: 600 })
}
