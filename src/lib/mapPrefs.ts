import { useState } from 'react'
import { read, write } from './store'

export const MAP_STYLES = ['auto', 'fiord', 'liberty', 'bright', 'positron', 'dark'] as const
export type MapStyle = (typeof MAP_STYLES)[number]

// OpenFreeMap: free vector tiles, no API key
export const styleUrl = (s: MapStyle, dark: boolean) => `https://tiles.openfreemap.org/styles/${s === 'auto' ? (dark ? 'fiord' : 'liberty') : s}`

export type MapPrefs = { style: MapStyle; names: boolean; acc: boolean; dist: boolean; vibrate: boolean }
const KEY: Record<keyof MapPrefs, string> = { style: 'blup-map-style', names: 'blup-map-names', acc: 'blup-map-acc', dist: 'blup-map-dist', vibrate: 'blup-map-vibrate' }

export function useMapPrefs() {
  const [prefs, setPrefs] = useState<MapPrefs>(() => {
    const s = read(KEY.style)
    return {
      style: MAP_STYLES.find((x) => x === s) ?? 'auto',
      names: read(KEY.names) !== '0',
      acc: read(KEY.acc) !== '0',
      dist: read(KEY.dist) !== '0',
      vibrate: read(KEY.vibrate) !== '0',
    }
  })
  function setPref<K extends keyof MapPrefs>(k: K, v: MapPrefs[K]) {
    setPrefs((p) => ({ ...p, [k]: v }))
    write(KEY[k], typeof v === 'boolean' ? (v ? '1' : '0') : v)
  }
  return [prefs, setPref] as const
}
