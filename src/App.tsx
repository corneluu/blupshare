import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useLang } from './lib/i18n'
import { useDarkMode } from './lib/theme'
import { write } from './lib/store'
import { Logo } from './components/ui'
import Login from './screens/Login'
import Home from './screens/Home'

// Save ?join=CODE before login so the invite survives the sign-in redirect
const join = new URLSearchParams(location.search).get('join')
if (join) {
  write('blup-join', join)
  history.replaceState(null, '', location.pathname + location.hash)
}

export default function App() {
  const { t } = useLang()
  const [dark, setDark] = useDarkMode()
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabase || session === undefined) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo />
        {!supabase && <p className="text-sm text-[var(--muted)]">{t('setupMissing')}</p>}
      </main>
    )
  }
  return session ? <Home key={session.user.id} session={session} dark={dark} setDark={setDark} /> : <Login />
}
