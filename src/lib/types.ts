export type Circle = {
  id: string
  name: string
  invite_code: string
  created_by: string | null
  expires_at: string | null
}
export type MyMembership = { role: 'owner' | 'member'; sharing_enabled: boolean; circles: Circle }
export type Member = {
  user_id: string
  role: 'owner' | 'member'
  sharing_enabled: boolean
  profiles: { display_name: string; color: string; avatar_url: string | null } | null
}
export type Loc = { user_id: string; lat: number; lng: number; accuracy: number | null; updated_at: string }
export type Meeting = { circle_id: string; lat: number; lng: number; label: string | null }

export const isExpired = (c: Circle, now: number) => !!c.expires_at && Date.parse(c.expires_at) <= now
