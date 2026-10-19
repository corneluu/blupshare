import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

// ─── LOGO ───
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <div
      className="blup-logo grid place-items-center rounded-full bg-[var(--accent)] font-black text-white shadow-[0_8px_30px_-6px_var(--accent)]"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      b
    </div>
  )
}

// ─── BUTTONS ───
export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const look = {
    primary: 'bg-[var(--accent)] text-white shadow-md hover:brightness-110',
    ghost: 'bg-[var(--accent-soft)] text-[var(--text)] hover:brightness-95 dark:hover:brightness-125',
    danger: 'bg-transparent text-rose-500 hover:bg-rose-500/10',
  }[variant]
  return (
    <button
      {...p}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition active:scale-[.97] disabled:opacity-50 ${look} ${className}`}
    />
  )
}

export function IconButton({ label, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={`grid size-11 place-items-center rounded-full bg-[var(--surface)] text-[var(--text)] shadow-md transition active:scale-90 ${className}`}
    />
  )
}

export const inputCls =
  'min-h-11 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 text-base outline-none transition focus:border-[var(--accent)]'

// ─── BOTTOM SHEET / MODAL ───
export function Sheet({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!onClose) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-5 pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          {onClose && (
            <button onClick={onClose} aria-label="close" className="grid size-10 place-items-center rounded-full hover:bg-[var(--accent-soft)]">
              <X size={20} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
