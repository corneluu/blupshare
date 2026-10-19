import { useLang, type TKey } from '../lib/i18n'
import { MAP_STYLES, type MapPrefs, type MapStyle } from '../lib/mapPrefs'
import { Sheet } from './ui'

type Props = { prefs: MapPrefs; setPref: <K extends keyof MapPrefs>(k: K, v: MapPrefs[K]) => void; onClose: () => void }

// Preview swatches stand for the external tile styles, so they are fixed colours, not theme tokens
const SWATCH: Record<MapStyle, string> = {
  auto: 'linear-gradient(135deg,#ece7da 50%,#1f2c4d 50%)',
  fiord: '#1f2c4d',
  liberty: '#ece7da',
  bright: '#f4efe4',
  positron: '#e4e4e4',
  dark: '#1b1b1b',
}
const NAME: Record<MapStyle, TKey> = { auto: 'styleAuto', fiord: 'styleNavy', liberty: 'styleLight', bright: 'styleBright', positron: 'styleGrey', dark: 'styleDark' }
const TOGGLES = [
  ['names', 'showNames'],
  ['acc', 'showAccuracy'],
  ['dist', 'showDistance'],
  ['vibrate', 'vibrateReactions'],
] as const

export default function MapSheet({ prefs, setPref, onClose }: Props) {
  const { t } = useLang()
  return (
    <Sheet title={t('map')} onClose={onClose}>
      <h3 className="mb-2 text-sm font-bold text-[var(--muted)]">{t('mapStyle')}</h3>
      <div className="mb-5 grid grid-cols-3 gap-2">
        {MAP_STYLES.map((s) => (
          <button
            key={s}
            onClick={() => setPref('style', s)}
            aria-pressed={prefs.style === s}
            className={`flex min-h-11 flex-col items-center gap-1.5 rounded-2xl border-2 p-2 text-xs font-semibold transition active:scale-95 ${
              prefs.style === s ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-transparent bg-[var(--bg)]'
            }`}
          >
            <span className="block h-10 w-full rounded-xl border border-[var(--line)]" style={{ background: SWATCH[s] }} />
            {t(NAME[s])}
          </button>
        ))}
      </div>

      <div className="flex flex-col">
        {TOGGLES.map(([k, label]) => (
          <button
            key={k}
            role="switch"
            aria-checked={prefs[k]}
            onClick={() => setPref(k, !prefs[k])}
            className="flex min-h-11 items-center justify-between gap-3 text-left text-sm font-semibold"
          >
            {t(label)}
            <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition ${prefs[k] ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`}>
              <span className={`size-6 rounded-full bg-white shadow transition-transform ${prefs[k] ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
