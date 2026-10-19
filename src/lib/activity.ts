// Activity badge, computed client-side from the last fix; nothing is stored.
export const SLEEP_MS = 30 * 60_000

export function activity(updatedAt: string, speed: number | null | undefined, now: number): string | null {
  if (now - Date.parse(updatedAt) > SLEEP_MS) return '😴'
  if (speed == null || !Number.isFinite(speed) || speed < 0.5) return null
  if (speed < 2.5) return '🚶'
  if (speed < 7) return '🚲'
  return '🚗'
}
