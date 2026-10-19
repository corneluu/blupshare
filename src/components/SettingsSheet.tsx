import { useEffect, useState, type FormEvent } from 'react'
import { LogOut, Moon, Sun } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { Button, Sheet, inputCls } from './ui'

type Props = { uid: string; dark: boolean; setDark: (d: boolean) => void; onSaved: () => void; onClose: () => void }

export default function SettingsSheet({ uid, dark, setDark, onSaved, onClose }: Props) {
  const { t, lang, setLang } = useLang()
  const toast = useToast()
  const [name, setName] = useState('')

  useEffect(() => {
    supabase!
      .from('profiles')
      .select('display_name')
      .eq('id', uid)
      .single()
      .then(({ data }) => data && setName(data.display_name))
  }, [uid])

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
