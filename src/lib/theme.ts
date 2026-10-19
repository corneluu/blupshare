import { useEffect, useState } from 'react'
import { read, write } from './store'

export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = read('blup-theme')
    return saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    write('blup-theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, setDark] as const
}
