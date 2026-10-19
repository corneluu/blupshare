import { useEffect, useState, type FormEvent } from 'react'
import { LogOut, Moon, Sun } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { PROFILE_COLORS, PROFILE_EMOJIS } from '../lib/types'
import { useToast } from '../lib/toast'
import { Button, Sheet, inputCls } from './ui'

type Props = { uid: string; dark: boolean; setDark: (d: boolean) => void; onSaved: () => void; onClose: () => void }

export default function SettingsSheet({ uid, dark, setDark, onSaved, onClose }: Props) {
  const { t, lang, setLang } = useLang()
  const toast = useToast()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [showActivity, setShowActivity] = useState(true)

  useEffect(() => {
    supabase!
      .from('profiles')
      .select('display_name, emoji, color, show_activity')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        if (!data) return
        setName(data.display_name)
        setEmoji(data.emoji)
        setColor(data.color)
        setShowActivity(data.show_activity)
      })
  }, [uid])

  // emoji, color and activity switch save as soon as they are tapped
  async function patch(change: { emoji?: string | null; color?: string; show_activity?: boolean }) {
    const { error } = await supabase!.from('profiles').update(change).eq('id', uid)
    if (error) return toast(t('error') + error.message)
    if ('emoji' in change) setEmoji(change.emoji ?? null)
    if (change.color) setColor(change.color)
    if ('show_activity' in change) setShowActivity(!!change.show_activity)
    onSaved()
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase!.from('profiles').update({ display_name: name.trim() }).eq('id', uid)
    if (error) return toast(t('error') + error.message)
    toast(t('saved'))
    onSaved()
  }

  return (
    <Sheet title={t('settings')} onClose={onClose}>
      <form onSubmit={save} className="mb-5 flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-bold text-[var(--muted)]">
          {t('yourName')}
        </label>
        <div className="flex gap-2">
          <input id="name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          <Button>{t('save')}</Button>
        </div>
      </form>

      <h3 className="mb-2 text-sm font-bold text-[var(--muted)]">{t('yourEmoji')}</h3>
      <div className="mb-5 grid grid-cols-6 gap-1 sm:grid-cols-8">
        {[null, ...PROFILE_EMOJIS].map((e) => (
          <button
            key={e ?? 'none'}
            onClick={() => patch({ emoji: e })}
            aria-label={e ?? t('noEmoji')}
            title={e ?? t('noEmoji')}
            aria-pressed={emoji === e}
            className={`grid min-h-11 place-items-center rounded-2xl text-2xl transition active:scale-90 ${
              emoji === e ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--bg)]'
            }`}
          >
            {e ?? <span className="text-base font-extrabold">{(name.trim().slice(0, 1) || 'A').toUpperCase()}</span>}
          </button>
        ))}
      </div>

      <h3 className="mb-2 text-sm font-bold text-[var(--muted)]">{t('yourColor')}</h3>
      <div className="mb-5 flex flex-wrap gap-2">
        {PROFILE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => patch({ color: c })}
            aria-label={c}
            aria-pressed={color?.toLowerCase() === c.toLowerCase()}
            className={`size-11 rounded-full border-4 transition active:scale-90 ${color?.toLowerCase() === c.toLowerCase() ? 'border-[var(--text)]' : 'border-transparent'}`}
            style={{ background: c }}
          />
        ))}
      </div>

      <button
        role="switch"
        aria-checked={showActivity}
        onClick={() => patch({ show_activity: !showActivity })}
        className="mb-5 flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-bold text-[var(--muted)]"
      >
        {t('showActivity')}
        <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition ${showActivity ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`}>
          <span className={`size-6 rounded-full bg-white shadow transition-transform ${showActivity ? 'translate-x-5' : ''}`} />
        </span>
      </button>

      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[var(--muted)]">{t('language')}</span>
        <div className="flex rounded-2xl bg-[var(--bg)] p-1">
          {(['ro', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition ${lang === l ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => setDark(!dark)} className="mb-5 flex min-h-11 w-full items-center justify-between rounded-2xl text-sm font-bold text-[var(--muted)]">
        {t('darkMode')}
        <span className="grid size-10 place-items-center rounded-full bg-[var(--bg)] text-[var(--text)]">{dark ? <Moon size={18} /> : <Sun size={18} />}</span>
      </button>

      <Button variant="danger" className="w-full" onClick={() => supabase!.auth.signOut()}>
        <LogOut size={18} /> {t('signOut')}
      </Button>
    </Sheet>
  )
}
