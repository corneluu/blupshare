import { useEffect, useRef, type RefObject } from 'react'
import { LngLatBounds, Map as MlMap, Marker, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { Meeting } from '../lib/types'

// OpenFreeMap: free vector tiles, no API key
const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/fiord',
}
// MapLibre 6 looks for its worker next to its own file, which bundling breaks
setWorkerUrl(workerUrl)

const TIMISOARA: [number, number] = [21.2257, 45.7537]

export type Pin = { id: string; lat: number; lng: number; color: string; label: string; initial: string; isMe: boolean; stale: boolean }

type Props = {
  pins: Pin[]
  meeting: Meeting | null
  dark: boolean
  picking: boolean
  onPick: (lat: number, lng: number) => void
  fitKey: string | undefined // fit to pins once per circle
  mapRef: RefObject<MlMap | null>
}

// Built with textContent, never innerHTML: display names are user input
function pinEl() {
  const el = document.createElement('div')
  el.className = 'blup-pin'
  el.append(document.createElement('span'), document.createElement('small'))
  return el
}

export default function MapView({ pins, meeting, dark, picking, onPick, fitKey, mapRef }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const markers = useRef(new Map<string, Marker>())
  const meetMarker = useRef<Marker | null>(null)
  const fitted = useRef<string | undefined>(undefined)
  const pick = useRef({ picking, onPick })
  useEffect(() => {
    pick.current = { picking, onPick }
  })

  useEffect(() => {
    const map = new MlMap({
      container: box.current!,
      style: dark ? STYLE.dark : STYLE.light,
      center: TIMISOARA,
      zoom: 13,
      attributionControl: { compact: true },
    })
    map.on('click', (e) => pick.current.picking && pick.current.onPick(e.lngLat.lat, e.lngLat.lng))
    mapRef.current = map
    const all = markers.current
    return () => {
      map.remove()
      all.clear()
      mapRef.current = null
    }
    // style changes are handled below; the map is created once
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mapRef.current?.setStyle(dark ? STYLE.dark : STYLE.light)
  }, [dark, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = picking ? 'crosshair' : ''
  }, [picking, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set<string>()
    for (const p of pins) {
      seen.add(p.id)
      let m = markers.current.get(p.id)
      if (!m) {
        m = new Marker({ element: pinEl() }).setLngLat([p.lng, p.lat]).addTo(map)
        markers.current.set(p.id, m)
      }
      m!.setLngLat([p.lng, p.lat])
      const el = m!.getElement()
      el.classList.toggle('me', p.isMe)
      el.classList.toggle('stale', p.stale)
      const [dot, label] = el.children as unknown as [HTMLSpanElement, HTMLElement]
      dot.textContent = p.initial
      dot.style.background = p.color
      label.textContent = p.label
    }
    for (const [id, m] of markers.current) {
      if (!seen.has(id)) {
        m.remove()
        markers.current.delete(id)
      }
    }
    if (fitKey && fitted.current !== fitKey && pins.length) {
      fitted.current = fitKey
      const b = new LngLatBounds()
      pins.forEach((p) => b.extend([p.lng, p.lat]))
      map.fitBounds(b, { padding: { top: 90, bottom: 260, left: 50, right: 50 }, maxZoom: 15, duration: 600 })
    }
  }, [pins, fitKey, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!meeting) {
      meetMarker.current?.remove()
      meetMarker.current = null
      return
    }
    if (!meetMarker.current) {
      const el = document.createElement('div')
      el.className = 'blup-meet'
      el.textContent = '📍'
      meetMarker.current = new Marker({ element: el, anchor: 'bottom' })
    }
    meetMarker.current!.setLngLat([meeting.lng, meeting.lat]).addTo(map)
  }, [meeting, mapRef])

  // maplibre-gl.css forces position:relative on the map element, so the positioning lives on a wrapper
  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" />
    </div>
  )
}
