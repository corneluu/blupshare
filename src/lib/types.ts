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
  profiles: { display_name: string; color: string; avatar_url: string | null; emoji: string | null; show_activity: boolean } | null
}
export type Loc = { user_id: string; lat: number; lng: number; accuracy: number | null; speed: number | null; updated_at: string }
export type Meeting = { circle_id: string; lat: number; lng: number; label: string | null }

export const isExpired = (c: Circle, now: number) => !!c.expires_at && Date.parse(c.expires_at) <= now

// Allowed reactions: must match the DB check in migration 002 (❤️ is U+2764 U+FE0F)
export const REACTIONS = ['👋', '🍻', '🔥', '❤️', '😂', '🥳', '👀', '🏃']
export type Reaction = { id: number; circle_id: string; from_user: string; to_user: string; emoji: string; created_at: string }

export const PROFILE_COLORS = ['#38BDF8', '#F472B6', '#A78BFA', '#34D399', '#FBBF24', '#FB7185', '#60A5FA', '#F97316']
export const PROFILE_EMOJIS = [...'🫧🦊🐸🐼🐨🐯🦁🐵🐙🦄🐝🐢🐬🦖👽🤖👻💀🤠😎🥸🤓😈🎃🍕🍔🌮🍩⚽🎸🎧🚀']
