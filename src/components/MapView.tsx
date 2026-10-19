import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { LngLatBounds, Map as MlMap, Marker, setWorkerUrl, type MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { Meeting } from '../lib/types'
import { cluster, zoomLevel } from '../lib/cluster'
import { fitPoints } from '../lib/mapUtil'
import ReactionPopover from './ReactionPopover'

// MapLibre 6 looks for its worker next to its own file, which bundling breaks
setWorkerUrl(workerUrl)

const TIMISOARA: [number, number] = [21.2257, 45.7537]
const BUILDINGS = 'blup-3d'

export type Pin = {
  id: string
  lat: number
  lng: number
  color: string
  label: string
  initial: string
  emoji: string | null
  activity: string | null
  ago: string
  isMe: boolean
  stale: boolean
}
export type Accuracy = { lat: number; lng: number; r: number }

type Props = {
  pins: Pin[]
  meeting: Meeting | null
  styleUrl: string
  threeD: boolean
  showNames: boolean
  accuracy: Accuracy | null
  picking: boolean
  onPick: (lat: number, lng: number) => void
  onReact: (toId: string, emoji: string) => void
  fitKey: string | undefined // fit to pins once per circle
  mapRef: RefObject<MlMap | null>
  burstRef: MutableRefObject<((fromId: string, emoji: string) => void) | null>
}

const face = (p: Pin) => p.emoji || p.initial

// Everything below is built with textContent, never innerHTML: names and emoji are user input
function pinEl() {
  const el = document.createElement('div')
  el.className = 'blup-pin'
  const bubble = document.createElement('div')
  bubble.className = 'blup-bubble'
  bubble.append(document.createElement('span'), Object.assign(document.createElement('i'), { className: 'blup-badge' }))
  const tag = document.createElement('div')
  tag.className = 'blup-tag'
  tag.append(document.createElement('b'), document.createElement('small'))
  el.append(bubble, tag)
  return el
}

function groupEl(members: Pin[]) {
  const el = document.createElement('div')
  el.className = 'blup-group'
  for (const m of members.slice(0, 3)) {
    const b = document.createElement('div')
    b.className = 'blup-bubble'
    b.style.setProperty('--c', m.color)
    b.textContent = face(m)
    el.append(b)
  }
  if (members.length > 3) {
    const more = document.createElement('span')
    more.className = 'blup-more'
    more.textContent = `+${members.length - 3}`
    el.append(more)
  }
  return el
}

function apply3D(map: MlMap, on: boolean) {
  if (map.getLayer(BUILDINGS)) map.removeLayer(BUILDINGS)
  if (!on || !map.getSource('openmaptiles')) return
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addLayer(
    {
      id: BUILDINGS,
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#9aa6bd',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.8,
      },
    },
    firstSymbol,
  )
}

export default function MapView({ pins, meeting, styleUrl, threeD, showNames, accuracy, picking, onPick, onReact, fitKey, mapRef, burstRef }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const markers = useRef(new Map<string, Marker>())
  const groups = useRef(new Map<string, Marker>())
  const meetMarker = useRef<Marker | null>(null)
  const popMarker = useRef<Marker | null>(null)
  const ring = useRef<Marker | null>(null)
  const fitted = useRef<string | undefined>(undefined)
  const recompute = useRef(() => {})
  const syncRing = useRef(() => {})
  const pinsRef = useRef(pins)
  const accRef = useRef(accuracy)
  const threeRef = useRef(threeD)
  const styleRef = useRef(styleUrl)
  const pick = useRef({ picking, onPick })
  const [sel, setSel] = useState<string | null>(null)
  const popEl = useMemo(() => Object.assign(document.createElement('div'), { className: 'blup-pop' }), [])

  useEffect(() => {
    pick.current = { picking, onPick }
    threeRef.current = threeD
    accRef.current = accuracy
  })

  // ─── map lifecycle ───
  useEffect(() => {
    const el = box.current!
    const map = new MlMap({
      container: el,
      style: styleRef.current,
      center: TIMISOARA,
      zoom: 13,
      attributionControl: { compact: true },
    })
    const floats = new Set<Marker>()
    const timers = new Set<number>()

    // zoom → one CSS variable + one data attribute on the container; no per-marker work
    const applyZoom = () => {
      const { px, lvl } = zoomLevel(map.getZoom())
      el.style.setProperty('--pin', `${px}px`)
      el.dataset.lvl = String(lvl)
    }
    const onClick = (e: MapMouseEvent) => {
      // marker clicks bubble up to the map: the markers handle themselves
      if ((e.originalEvent.target as Element | null)?.closest('.blup-pin, .blup-group, .blup-pop')) return
      setSel(null)
      if (pick.current.picking) pick.current.onPick(e.lngLat.lat, e.lngLat.lng)
    }
    const onStyle = () => apply3D(map, threeRef.current)
    const onMoved = () => recompute.current()
    const onZoom = () => {
      applyZoom()
      syncRing.current()
    }

    syncRing.current = () => {
      const a = accRef.current
      if (!a) {
        ring.current?.remove()
        ring.current = null
        return
      }
      if (!ring.current) {
        const r = document.createElement('div')
        r.className = 'blup-ring'
        ring.current = new Marker({ element: r, pitchAlignment: 'map', rotationAlignment: 'map' })
      }
      const r = ring.current.getElement()
      const mpp = (78271.51696 * Math.cos((a.lat * Math.PI) / 180)) / 2 ** map.getZoom() // 512px tiles
      const d = Math.min((2 * a.r) / mpp, 4000)
      r.style.setProperty('--d', `${d}px`)
      r.style.display = d < zoomLevel(map.getZoom()).px ? 'none' : ''
      ring.current.setLngLat([a.lng, a.lat])
      if (!r.parentNode) ring.current.addTo(map)
    }

    // shortcut: greedy O(n²) grouping on every move; fine for circles of a few dozen people
    recompute.current = () => {
      const { px } = zoomLevel(map.getZoom())
      const list = pinsRef.current.filter((p) => markers.current.has(p.id))
      const pts = list.map((p) => {
        const o = map.project([p.lng, p.lat])
        return { id: p.id, x: o.x, y: o.y }
      })
      const byId = new Map(list.map((p) => [p.id, p]))
      const hidden = new Set<string>()
      const keep = new Set<string>()
      for (const ids of cluster(pts, Math.max(44, px))) {
        if (ids.length === 1) {
          markers.current.get(ids[0])!.getElement().style.display = ''
          continue
        }
        const members = ids.map((id) => byId.get(id)!)
        members.forEach((m) => {
          markers.current.get(m.id)!.getElement().style.display = 'none'
          hidden.add(m.id)
        })
        const key = members.map((m) => `${m.id}|${face(m)}|${m.color}`).join(',')
        keep.add(key)
        let g = groups.current.get(key)
        if (!g) {
          const gel = groupEl(members)
          gel.addEventListener('click', () => {
            const b = new LngLatBounds()
            for (const id of ids) {
              const p = pinsRef.current.find((x) => x.id === id)
              if (p) b.extend([p.lng, p.lat])
            }
            map.fitBounds(b, { padding: 90, maxZoom: 18, duration: 500 })
          })
          g = new Marker({ element: gel }).setLngLat([0, 0]).addTo(map)
          groups.current.set(key, g)
        }
        g.setLngLat([members.reduce((s, m) => s + m.lng, 0) / members.length, members.reduce((s, m) => s + m.lat, 0) / members.length])
      }
      for (const [key, g] of groups.current) {
        if (!keep.has(key)) {
          g.remove()
          groups.current.delete(key)
        }
      }
      setSel((s) => (s && hidden.has(s) ? null : s))
    }

    burstRef.current = (fromId, emoji) => {
      const p = pinsRef.current.find((x) => x.id === fromId)
      if (!p) return
      const f = document.createElement('div')
      f.className = 'blup-float'
      f.append(Object.assign(document.createElement('span'), { textContent: emoji }))
      const m = new Marker({ element: f }).setLngLat([p.lng, p.lat]).addTo(map)
      floats.add(m)
      const id = window.setTimeout(() => {
        m.remove()
        floats.delete(m)
        timers.delete(id)
      }, 2000)
      timers.add(id)
    }

    map.on('click', onClick)
    map.on('style.load', onStyle)
    map.on('zoom', onZoom)
    map.on('moveend', onMoved)
    map.on('zoomend', onMoved)
    applyZoom()
    mapRef.current = map

    const all = markers.current
    const grp = groups.current
    return () => {
      timers.forEach(clearTimeout)
      floats.forEach((m) => m.remove())
      map.off('click', onClick)
      map.off('style.load', onStyle)
      map.off('zoom', onZoom)
      map.off('moveend', onMoved)
      map.off('zoomend', onMoved)
      map.remove()
      all.clear()
      grp.clear()
      meetMarker.current = null
      popMarker.current = null
      ring.current = null
      burstRef.current = null
      recompute.current = () => {}
      syncRing.current = () => {}
      mapRef.current = null
    }
    // style changes are handled below; the map is created once
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── style / 3D / toggles ───
  useEffect(() => {
    const map = mapRef.current
    if (!map || styleRef.current === styleUrl) return
    styleRef.current = styleUrl
    map.setStyle(styleUrl) // DOM markers survive; 3D is re-added on style.load
  }, [styleUrl, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    apply3D(map, threeD)
    map.easeTo({ pitch: threeD ? 55 : 0, duration: 600 })
  }, [threeD, mapRef])

  useEffect(() => {
    if (box.current) box.current.dataset.names = showNames ? '1' : '0'
  }, [showNames])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = picking ? 'crosshair' : ''
  }, [picking, mapRef])

  useEffect(() => {
    syncRing.current()
  }, [accuracy])

  // ─── pins ───
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    pinsRef.current = pins
    const seen = new Set<string>()
    for (const p of pins) {
      seen.add(p.id)
      let m = markers.current.get(p.id)
      if (!m) {
        const el = pinEl()
        el.addEventListener('click', () => {
          const cur = pinsRef.current.find((x) => x.id === p.id)
          if (cur && !cur.isMe) setSel((s) => (s === p.id ? null : p.id))
        })
        m = new Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map)
        markers.current.set(p.id, m)
      }
      m.setLngLat([p.lng, p.lat])
      const el = m.getElement()
      el.classList.toggle('me', p.isMe)
      el.classList.toggle('stale', p.stale)
      const [bubble, tag] = el.children as unknown as [HTMLElement, HTMLElement]
      bubble.style.setProperty('--c', p.color)
      bubble.children[0].textContent = face(p)
      bubble.children[1].textContent = p.activity ?? ''
      tag.children[0].textContent = p.label
      tag.children[1].textContent = p.ago
    }
    for (const [id, m] of markers.current) {
      if (!seen.has(id)) {
        m.remove()
        markers.current.delete(id)
      }
    }
    recompute.current()
    if (fitKey && fitted.current !== fitKey && pins.length) {
      fitted.current = fitKey
      fitPoints(map, pins)
    }
  }, [pins, fitKey, mapRef])

  // ─── reaction popover (a marker whose content React renders through a portal) ───
  const selPin = sel ? pins.find((p) => p.id === sel && !p.isMe) : undefined
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!selPin) {
      popMarker.current?.remove()
      return
    }
    popMarker.current ??= new Marker({ element: popEl, anchor: 'bottom' })
    popMarker.current.setLngLat([selPin.lng, selPin.lat]).addTo(map)
  }, [selPin, popEl, mapRef])

  // ─── meeting point ───
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
      {selPin &&
        createPortal(
          <ReactionPopover
            name={selPin.label}
            onPick={(emoji) => {
              onReact(selPin.id, emoji)
              setSel(null)
            }}
          />,
          popEl,
        )}
    </div>
  )
}
