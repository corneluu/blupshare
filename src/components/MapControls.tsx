import { useEffect, useState, type ReactNode } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { Box, LocateFixed, Maximize2, Minus, Navigation2, Plus } from 'lucide-react'
import { useLang } from '../lib/i18n'

type Props = {
  mapRef: { current: MlMap | null }
  threeD: boolean
  onToggle3D: () => void
  onFit: () => void
  onMe: () => void
  canFit: boolean
  canMe: boolean
}

function Btn({ label, on, disabled, onClick, children }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={`grid size-11 place-items-center transition active:scale-90 disabled:opacity-40 ${on ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}
    >
      {children}
    </button>
  )
}

// Stacked pill on the right side of the map
export default function MapControls({ mapRef, threeD, onToggle3D, onFit, onMe, canFit, canMe }: Props) {
  const { t } = useLang()
  const [bearing, setBearing] = useState(0)

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const f = () => setBearing(map.getBearing())
    map.on('rotate', f)
    f()
    return () => void map.off('rotate', f)
  }, [mapRef])

  return (
    <div className="pointer-events-auto flex flex-col divide-y divide-[var(--line)] overflow-hidden rounded-3xl bg-[var(--surface)] shadow-lg">
      <Btn label={t('zoomIn')} onClick={() => mapRef.current?.zoomIn()}>
        <Plus size={22} />
      </Btn>
      <Btn label={t('zoomOut')} onClick={() => mapRef.current?.zoomOut()}>
        <Minus size={22} />
      </Btn>
      <Btn label={t('resetNorth')} onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0 })}>
        <Navigation2 size={22} style={{ transform: `rotate(${-bearing}deg)` }} className={Math.abs(bearing) > 1 ? 'text-rose-500' : ''} />
      </Btn>
      <Btn label={t('fitAll')} onClick={onFit} disabled={!canFit}>
        <Maximize2 size={20} />
      </Btn>
      <Btn label={t('center')} onClick={onMe} disabled={!canMe}>
        <LocateFixed size={22} />
      </Btn>
      <Btn label={t('buildings3d')} on={threeD} onClick={onToggle3D}>
        <Box size={22} />
      </Btn>
    </div>
  )
}
