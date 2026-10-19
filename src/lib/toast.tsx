import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null)
  const timer = useRef(0)
  const show = useCallback((text: string) => {
    setMsg({ text, id: Date.now() })
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div
          key={msg.id}
          role="status"
          className="toast fixed bottom-6 left-1/2 z-50 max-w-[90vw] rounded-full bg-[var(--text)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] shadow-lg"
        >
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
