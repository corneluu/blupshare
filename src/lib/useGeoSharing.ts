import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type GeoState = 'off' | 'on' | 'denied' | 'unsupported'
type Fix = { lat: number; lng: number; accuracy: number; speed: number | null; t: number }

function distanceM(a: Fix, b: Fix) {
  const r = Math.PI / 180
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r)
  const y = (b.lat - a.lat) * r
  return Math.hypot(x, y) * 6_371_000
}

// Sends my position while the page is open and `active` is true.
// shortcut: fixed 25 m / 60 s throttle + 2 min heartbeat; Phase 4 adds battery- and speed-aware rules
export function useGeoSharing(active: boolean, userId: string, shareSpeed: boolean) {
  const speedOk = useRef(shareSpeed) // read at send time so toggling it doesn't restart the GPS watch
  useEffect(() => {
    speedOk.current = shareSpeed
  }, [shareSpeed])
  const [state, setState] = useState<GeoState>('off')
  const [me, setMe] = useState<{ lat: number; lng: number; accuracy: number; speed: number | null; updated_at: string } | null>(null)

  useEffect(() => {
    if (!active || !supabase) return setState('off')
    if (!('geolocation' in navigator)) return setState('unsupported')
    const db = supabase
    let latest: Fix | null = null
    let sent: Fix | null = null
    const send = (f: Fix) => {
      sent = { ...f, t: Date.now() }
      db.from('locations')
        .upsert({ user_id: userId, lat: f.lat, lng: f.lng, accuracy: f.accuracy, speed: speedOk.current ? f.speed : null })
        .then(({ error }) => error && console.warn('location upsert failed', error.message))
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords
        latest = { lat, lng, accuracy, speed: Number.isFinite(speed) ? speed : null, t: Date.now() }
        setState('on')
        setMe({ lat, lng, accuracy, speed: latest.speed, updated_at: new Date().toISOString() })
        if (!sent || distanceM(sent, latest) > 25 || latest.t - sent.t > 60_000) send(latest)
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'off'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    )
    // watchPosition goes quiet when you stand still; this keeps "last seen" fresh
    const beat = setInterval(() => latest && send(latest), 120_000)
    return () => {
      navigator.geolocation.clearWatch(watch)
      clearInterval(beat)
    }
  }, [active, userId])

  return { state, me }
}
