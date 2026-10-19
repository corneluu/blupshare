// localStorage can throw (private mode, blocked storage), so every access is guarded
export const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
export const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}
export const remove = (k: string) => {
  try {
    localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}
