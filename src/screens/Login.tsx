import { useState, type FormEvent } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { Button, Logo, inputCls } from '../components/ui'

const redirectTo = () => location.origin + import.meta.env.BASE_URL

export default function Login() {
  const { t, lang, setLang } = useLang()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signUp, setSignUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  // Password, not magic link: Supabase's built-in mailer allows only ~2 emails/hour
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const creds = { email: email.trim(), password }
    if (signUp) {
      const { data, error } = await supabase!.auth.signUp({ ...creds, options: { emailRedirectTo: redirectTo() } })
      if (error) toast(t('error') + error.message)
      else if (!data.session) setSent(true) // "Confirm email" is on in Supabase
    } else {
      const { error } = await supabase!.auth.signInWithPassword(creds)
      if (error) toast(error.code === 'invalid_credentials' ? t('badLogin') : t('error') + error.message)
    }
    setBusy(false)
  }

  async function google() {
    const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })
    if (error) toast(t('error') + error.message)
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-8 p-6">
      <button
        onClick={() => setLang(lang === 'ro' ? 'en' : 'ro')}
        className="self-end rounded-full px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--accent-soft)]"
      >
        {lang === 'ro' ? 'EN' : 'RO'}
      </button>
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={72} />
        <h1 className="text-4xl font-black tracking-tight">Blup</h1>
        <p className="text-[var(--muted)]">{t('tagline')}</p>
      </div>

      <div className="flex flex-col gap-3">
        <Button variant="ghost" onClick={google} className="bg-[var(--surface)] shadow-sm">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {t('google')}
        </Button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-[var(--muted)]">
          <span className="h-px flex-1 bg-[var(--line)]" />
          {t('or')}
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>

        {sent ? (
          <p className="rounded-2xl bg-[var(--accent-soft)] p-4 text-center text-sm">{t('checkEmail')}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete={signUp ? 'new-password' : 'current-password'}
              placeholder={t('password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
            <Button disabled={busy}>
              {signUp ? <UserPlus size={18} /> : <LogIn size={18} />}
              {t(signUp ? 'signUp' : 'signIn')}
            </Button>
            <button type="button" onClick={() => setSignUp(!signUp)} className="min-h-11 text-sm font-semibold text-[var(--accent)]">
              {t(signUp ? 'toSignIn' : 'toSignUp')}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
