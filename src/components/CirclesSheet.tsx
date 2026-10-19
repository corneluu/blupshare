import { useState, type FormEvent } from 'react'
import { Check, LogOut, Moon, Plus, Trash2 } from 'lucide-react'
import { useLang } from '../lib/i18n'
import { isExpired, type MyMembership } from '../lib/types'
import { Button, Sheet, inputCls } from './ui'

type Props = {
  mine: MyMembership[]
  currentId: string | undefined
  now: number
  onSelect: (id: string) => void
  onCreate: (name: string, nightOut: boolean) => Promise<void>
  onJoin: (code: string) => Promise<boolean>
  onLeave: (m: MyMembership, deleteAll: boolean) => void
  onClose?: () => void
}

export default function CirclesSheet({ mine, currentId, now, onSelect, onCreate, onJoin, onLeave, onClose }: Props) {
  const { t } = useLang()
  const [name, setName] = useState('')
  const [night, setNight] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await onCreate(name.trim(), night)
    setBusy(false)
    setName('')
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    if (await onJoin(code)) setCode('')
    setBusy(false)
  }

  return (
    <Sheet title={t('circles')} onClose={onClose}>
      {mine.length === 0 && <p className="mb-4 text-sm text-[var(--muted)]">{t('noCircles')}</p>}

      <ul className="mb-5 flex flex-col gap-1">
        {mine.map((m) => {
          const c = m.circles
          const active = c.id === currentId
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left transition ${active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]/60'}`}
              >
                {c.expires_at ? <Moon size={18} className="text-[var(--accent)]" /> : <span className="size-[18px]" />}
                <span className="flex-1 font-semibold">{c.name}</span>
                {isExpired(c, now) && <span className="text-xs text-[var(--muted)]">{t('expired')}</span>}
                {active && <Check size={18} className="text-[var(--accent)]" />}
              </button>
              {active && (
                <div className="flex flex-wrap justify-end gap-1 px-1 pt-1">
                  <Button variant="danger" className="min-h-9 text-xs" onClick={() => onLeave(m, false)}>
                    <LogOut size={14} /> {t('leave')}
                  </Button>
                  {m.role === 'owner' && (
                    <Button variant="danger" className="min-h-9 text-xs" onClick={() => onLeave(m, true)}>
                      <Trash2 size={14} /> {t('deleteCircle')}
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <form onSubmit={create} className="mb-5 flex flex-col gap-2">
        <h3 className="text-sm font-bold text-[var(--muted)]">{t('createCircle')}</h3>
        <input required maxLength={40} placeholder={t('circleName')} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-sm">
          <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          {t('nightOut')}
        </label>
        <Button disabled={busy}>
          <Plus size={18} /> {t('create')}
        </Button>
      </form>

      <form onSubmit={join} className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-[var(--muted)]">{t('joinCircle')}</h3>
        <div className="flex gap-2">
          <input
            required
            maxLength={8}
            placeholder={t('inviteCode')}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            className={`${inputCls} font-mono tracking-[.2em]`}
          />
          <Button variant="ghost" disabled={busy}>
            {t('join')}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
