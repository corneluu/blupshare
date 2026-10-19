import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Map as MlMap } from 'maplibre-gl'
import { ChevronDown, ChevronUp, Layers, MapPin, Moon, Navigation, Pause, Play, Settings, Share2, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang, type TKey } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { read, remove, write } from '../lib/store'
import { REACTIONS, isExpired, type Loc, type Meeting, type Member, type MyMembership, type Reaction } from '../lib/types'
import { activity } from '../lib/activity'
import { fitPoints, fmtDist, haversineM, walkMin } from '../lib/mapUtil'
import { styleUrl, useMapPrefs } from '../lib/mapPrefs'
import { useGeoSharing } from '../lib/useGeoSharing'
import MapView, { type Accuracy, type Pin } from '../components/MapView'
import MapControls from '../components/MapControls'
import MapSheet from '../components/MapSheet'
import FriendsRow, { type Friend } from '../components/FriendsRow'
import CirclesSheet from '../components/CirclesSheet'
import SettingsSheet from '../components/SettingsSheet'
import { Button, IconButton, Sheet } from '../components/ui'

type Props = { session: Session; dark: boolean; setDark: (d: boolean) => void }
type T = (k: TKey, v?: Record<string, string | number>) => string

const STALE_MS = 15 * 60_000

function ago(iso: string, now: number, t: T) {
  const min = Math.floor((now - Date.parse(iso)) / 60_000)
  if (min < 1) return t('agoNow')
  if (min < 60) return t('agoMin', { n: min })
  return t('agoH', { n: Math.floor(min / 60) })
}

function timeLeft(iso: string, now: number) {
  const min = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000))
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`
}

export default function Home({ session, dark, setDark }: Props) {
  const uid = session.user.id
  const db = supabase!
  const { t } = useLang()
  const toast = useToast()

  const [mine, setMine] = useState<MyMembership[] | null>(null)
  const [selectedId, setSelectedId] = useState(() => read('blup-circle'))
  const [members, setMembers] = useState<Member[]>([])
  const [locs, setLocs] = useState<Record<string, Loc>>({})
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [sheet, setSheet] = useState<'circles' | 'settings' | 'map' | 'consent' | null>(null)
  const [prefs, setPref] = useMapPrefs()
  const [threeD, setThreeD] = useState(false)
  const [picking, setPicking] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [consent, setConsent] = useState(() => read('blup-consent') === '1')
  const [now, setNow] = useState(() => Date.now())
  const mapRef = useRef<MlMap | null>(null)
  const memberIds = useRef(new Set<string>())
  const membersRef = useRef<Member[]>([])
  const burstRef = useRef<((fromId: string, emoji: string) => void) | null>(null)
  const vibrateRef = useRef(prefs.vibrate)
  const consentAsked = useRef(false)

  const fail = useCallback((e: { message: string }) => toast(t('error') + e.message), [toast, t])

  // ─── DATA ───
  const loadMine = useCallback(async () => {
    const { data, error } = await db.from('memberships').select('role, sharing_enabled, circles(*)').eq('user_id', uid).order('joined_at')
    if (error) return fail(error)
    setMine(data as unknown as MyMembership[])
  }, [db, uid, fail])

  const current = mine?.find((m) => m.circles.id === selectedId) ?? mine?.[0]
  const circleId = current?.circles.id
  const expired = current ? isExpired(current.circles, now) : false

  const loadCircle = useCallback(
    async (id: string) => {
      const [m, mp] = await Promise.all([
        db.from('memberships').select('user_id, role, sharing_enabled, profiles(*)').eq('circle_id', id),  // profiles(*): still loads if migration 002 isn't applied yet
        db.from('meeting_points').select('*').eq('circle_id', id).maybeSingle(),
      ])
      if (m.error) return fail(m.error)
      const list = m.data as unknown as Member[]
      memberIds.current = new Set(list.map((x) => x.user_id))
      const l = await db.from('locations').select('*').in('user_id', [...memberIds.current])
      if (l.error) return fail(l.error)
      setMembers(list)
      setMeeting(mp.data as Meeting | null)
      setLocs(Object.fromEntries((l.data as Loc[]).map((x) => [x.user_id, x])))
    },
    [db, fail],
  )

  useEffect(() => {
    loadMine()
  }, [loadMine])

  useEffect(() => {
    if (!circleId) return
    write('blup-circle', circleId)
    loadCircle(circleId)
  }, [circleId, loadCircle])

  // Realtime covers movement; this poll covers joins, pauses and leaves (memberships are not in realtime)
  useEffect(() => {
    const tick = () => {
      setNow(Date.now())
      if (circleId && document.visibilityState === 'visible') loadCircle(circleId)
    }
    const id = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [circleId, loadCircle])

  useEffect(() => {
    if (!circleId) return
    const ch = db
      .channel(`circle-${circleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, (p) => {
        const row = p.new as Loc
        if (row?.user_id && memberIds.current.has(row.user_id)) setLocs((prev) => ({ ...prev, [row.user_id]: row }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_points' }, (p) => {
        // DELETE events can't be filtered server-side, so check the circle here
        if (p.eventType === 'DELETE') {
          if ((p.old as Partial<Meeting>).circle_id === circleId) setMeeting(null)
        } else if ((p.new as Meeting).circle_id === circleId) setMeeting(p.new as Meeting)
      })
      .subscribe()
    return () => {
      db.removeChannel(ch)
    }
  }, [db, circleId])

  useEffect(() => {
    membersRef.current = members
    vibrateRef.current = prefs.vibrate
  })

  // Incoming reactions get their own channel so a missing `reactions` table can't break location realtime
  useEffect(() => {
    const ch = db
      .channel(`reactions-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions', filter: `to_user=eq.${uid}` }, (p) => {
        const r = p.new as Reaction
        if (!REACTIONS.includes(r.emoji)) return
        const name = membersRef.current.find((m) => m.user_id === r.from_user)?.profiles?.display_name
        toast(name ? `${name}: ${r.emoji}` : r.emoji)
        burstRef.current?.(r.from_user, r.emoji)
        if (vibrateRef.current) navigator.vibrate?.(60)
      })
      .subscribe()
    return () => {
      db.removeChannel(ch)
    }
  }, [db, uid, toast])

  async function react(toId: string, emoji: string) {
    if (!circleId) return
    // only the allowed columns: from_user defaults to auth.uid() server-side
    const { error } = await db.from('reactions').insert({ circle_id: circleId, to_user: toId, emoji })
    if (error) return toast(error.code === 'P0001' ? t('slowDown') : t('error') + error.message)
    toast(t('sent', { e: emoji }))
  }

  // ─── JOIN (also from an invite link saved before login) ───
  const joinCircle = useCallback(
    async (code: string) => {
      const { data, error } = await db.rpc('join_circle', { p_code: code })
      if (error) {
        toast(error.code === 'P0002' ? t('invalidCode') : error.code === 'P0001' ? t('circleExpired') : t('error') + error.message)
        return false
      }
      toast(t('joined'))
      setSelectedId(data as string)
      setSheet(null)
      await loadMine()
      return true
    },
    [db, toast, t, loadMine],
  )

  useEffect(() => {
    const code = read('blup-join')
    if (!code) return
    remove('blup-join')
    joinCircle(code)
  }, [joinCircle])

  async function createCircle(name: string, nightOut: boolean) {
    const { data, error } = await db.rpc('create_circle', { p_name: name, p_night_out: nightOut })
    if (error) return fail(error)
    setSelectedId((data as { id: string }).id)
    setSheet(null)
    await loadMine()
  }

  async function leaveCircle(m: MyMembership, deleteAll: boolean) {
    if (!confirm(t(deleteAll ? 'confirmDelete' : 'confirmLeave'))) return
    const { error } = deleteAll
      ? await db.from('circles').delete().eq('id', m.circles.id)
      : await db.from('memberships').delete().eq('circle_id', m.circles.id).eq('user_id', uid)
    if (error) return fail(error)
    setSelectedId(null)
    setMembers([])
    setLocs({})
    setMeeting(null)
    await loadMine()
  }

  // ─── SHARING ───
  const sharingActive = consent && !!mine?.some((m) => m.sharing_enabled && !isExpired(m.circles, now))
  // until my profile has loaded, assume the privacy-safe answer: don't send speed
  const myShowActivity = members.find((m) => m.user_id === uid)?.profiles?.show_activity ?? false
  const geo = useGeoSharing(sharingActive, uid, myShowActivity)
  const sharingHere = consent && !!current?.sharing_enabled && !expired

  useEffect(() => {
    if (mine?.length && !consent && !consentAsked.current) {
      consentAsked.current = true
      setSheet('consent')
    }
  }, [mine, consent])

  async function toggleSharing() {
    if (!current) return
    if (!consent) return setSheet('consent')
    const next = !current.sharing_enabled
    const { error } = await db.from('memberships').update({ sharing_enabled: next }).eq('circle_id', current.circles.id).eq('user_id', uid)
    if (error) return fail(error)
    setMine((ms) => ms!.map((m) => (m === current ? { ...m, sharing_enabled: next } : m)))
    setMembers((ms) => ms.map((m) => (m.user_id === uid ? { ...m, sharing_enabled: next } : m)))
  }

  // ─── INVITE ───
  async function invite() {
    if (!current) return
    const url = `${location.origin}${import.meta.env.BASE_URL}?join=${current.circles.invite_code}`
    const text = `${t('inviteText')} · ${current.circles.name} · ${t('inviteCode')}: ${current.circles.invite_code}`
    if (navigator.share) {
      navigator.share({ title: 'Blup', text, url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      toast(t('copied'))
    }
  }

  // ─── MEETING POINT ───
  async function setMeetingAt(lat: number, lng: number) {
    setPicking(false)
    if (!circleId) return
    const { data, error } = await db.from('meeting_points').upsert({ circle_id: circleId, lat, lng, label: null, set_by: uid }).select().single()
    if (error) return fail(error)
    setMeeting(data as Meeting)
  }

  async function clearMeeting() {
    if (!circleId) return
    const { error } = await db.from('meeting_points').delete().eq('circle_id', circleId)
    if (error) return fail(error)
    setMeeting(null)
  }

  // ─── PINS ───
  const pins: Pin[] = useMemo(
    () =>
      members.flatMap((m) => {
        const isMe = m.user_id === uid
        // locations are readable via ANY shared circle, so re-apply this circle's own rules
        if (!isMe && (expired || !m.sharing_enabled)) return []
        const l = isMe && geo.me ? geo.me : locs[m.user_id]
        if (!l) return []
        const name = m.profiles?.display_name || '?'
        return [
          {
            id: m.user_id,
            lat: l.lat,
            lng: l.lng,
            color: m.profiles?.color ?? '#38BDF8',
            label: isMe ? t('you') : name,
            initial: name.slice(0, 1).toUpperCase(),
            emoji: m.profiles?.emoji ?? null,
            // never show a badge (not even the sleepy one) for someone who turned activity off
            activity: (m.profiles?.show_activity ?? true) ? activity(l.updated_at, l.speed, now) : null,
            ago: isMe ? t('agoNow') : ago(l.updated_at, now, t),
            isMe,
            stale: !isMe && now - Date.parse(l.updated_at) > STALE_MS,
          },
        ]
      }),
    [members, locs, geo.me, uid, expired, now, t],
  )

  function centerOnMe() {
    if (geo.me) mapRef.current?.flyTo({ center: [geo.me.lng, geo.me.lat], zoom: 15 })
  }

  const accuracy: Accuracy | null = useMemo(() => (geo.me ? { lat: geo.me.lat, lng: geo.me.lng, r: geo.me.accuracy } : null), [geo.me])
  const myPin = pins.find((p) => p.isMe)
  const meetInfo = meeting && myPin ? haversineM(myPin, meeting) : null

  const statusOf = (m: Member) => {
    const l = locs[m.user_id]
    return !m.sharing_enabled ? t('paused') : m.user_id === uid && geo.me ? t('agoNow') : l ? ago(l.updated_at, now, t) : t('noLocation')
  }
  // me first, then alphabetical
  const sorted = useMemo(
    () =>
      [...members].sort(
        (a, b) => +(b.user_id === uid) - +(a.user_id === uid) || (a.profiles?.display_name ?? '').localeCompare(b.profiles?.display_name ?? '', 'ro'),
      ),
    [members, uid],
  )
  const friends: Friend[] = sorted.map((m) => {
    const p = pins.find((x) => x.id === m.user_id)
    const name = m.profiles?.display_name || '?'
    return {
      id: m.user_id,
      face: m.profiles?.emoji || name.slice(0, 1).toUpperCase(),
      color: m.profiles?.color ?? '#38BDF8',
      name: m.user_id === uid ? t('you') : name,
      status: statusOf(m),
      activity: p?.activity ?? null,
      disabled: !p,
    }
  })

  // ─── UI ───
  return (
    <div className="relative h-full overflow-hidden">
      <MapView
        pins={pins}
        meeting={meeting}
        styleUrl={styleUrl(prefs.style, dark)}
        threeD={threeD}
        showNames={prefs.names}
        accuracy={prefs.acc ? accuracy : null}
        picking={picking}
        onPick={setMeetingAt}
        onReact={react}
        fitKey={circleId}
        mapRef={mapRef}
        burstRef={burstRef}
      />

      <div className="pointer-events-none absolute top-[calc(max(env(safe-area-inset-top),12px)+64px)] right-3">
        <MapControls
          mapRef={mapRef}
          threeD={threeD}
          onToggle3D={() => setThreeD(!threeD)}
          onFit={() => mapRef.current && fitPoints(mapRef.current, pins)}
          onMe={centerOnMe}
          canFit={pins.length > 0}
          canMe={!!geo.me}
        />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)]">
        <button
          onClick={() => setSheet('circles')}
          className="pointer-events-auto flex min-h-11 max-w-[70vw] items-center gap-2 rounded-full bg-[var(--surface)] py-1 pr-4 pl-1.5 font-bold shadow-md transition active:scale-[.97]"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-sm font-black text-white">b</span>
          <span className="truncate">{current?.circles.name ?? 'Blup'}</span>
          <ChevronDown size={18} className="shrink-0 text-[var(--muted)]" />
        </button>
        <span className="flex-1" />
        <IconButton label={t('map')} onClick={() => setSheet('map')} className="pointer-events-auto">
          <Layers size={20} />
        </IconButton>
        <IconButton label={t('settings')} onClick={() => setSheet('settings')} className="pointer-events-auto">
          <Settings size={20} />
        </IconButton>
      </header>

      {picking && (
        <div className="absolute inset-x-0 top-20 flex justify-center px-3">
          <div className="flex items-center gap-2 rounded-full bg-[var(--accent)] py-1 pr-1 pl-4 text-sm font-semibold text-white shadow-lg">
            {t('tapMap')}
            <button onClick={() => setPicking(false)} aria-label={t('close')} className="grid size-9 place-items-center rounded-full hover:bg-white/20">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {current && (
        <section className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <FriendsRow
            items={friends}
            label={t('friends')}
            onPick={(id) => {
              const p = pins.find((x) => x.id === id)
              if (p) mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 16 })
            }}
          />

          <div className="pointer-events-auto w-full rounded-3xl bg-[var(--surface)] p-4 shadow-xl sm:mx-auto sm:max-w-md">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-1.5 truncate font-bold">
                  {current.circles.expires_at && <Moon size={16} className="shrink-0 text-[var(--accent)]" />}
                  <span className="truncate">{current.circles.name}</span>
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  {members.length} 👥
                  {current.circles.expires_at && ` · ${expired ? t('expired') : t('expiresIn', { t: timeLeft(current.circles.expires_at, now) })}`}
                </p>
                {prefs.dist && meetInfo != null && (
                  <p className="text-xs font-semibold text-[var(--accent)]">📍 {t('walkMin', { d: fmtDist(meetInfo), n: walkMin(meetInfo) })}</p>
                )}
              </div>
              {!expired && (
                <button
                  onClick={toggleSharing}
                  aria-pressed={sharingHere}
                  className={`flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition active:scale-[.97] ${
                    sharingHere ? 'bg-emerald-500 text-white shadow-[0_6px_20px_-6px] shadow-emerald-500' : 'bg-[var(--accent-soft)] text-[var(--muted)]'
                  }`}
                >
                  {sharingHere ? <Pause size={16} /> : <Play size={16} />}
                  {sharingHere ? t('sharingOn') : t('sharingOff')}
                </button>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                aria-label={t('close')}
                aria-expanded={expanded}
                className="grid size-10 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--accent-soft)]"
              >
                {expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
              </button>
            </div>

            {sharingHere && geo.state === 'denied' && <p className="mt-2 text-xs text-rose-500">{t('geoDenied')}</p>}
            {sharingHere && geo.state === 'unsupported' && <p className="mt-2 text-xs text-rose-500">{t('geoUnsupported')}</p>}

            {expanded && (
              <>
                <ul className="mt-3 flex max-h-[30vh] flex-col gap-1 overflow-y-auto">
                  {sorted.map((m) => {
                    const isMe = m.user_id === uid
                    const status = statusOf(m)
                    return (
                      <li key={m.user_id}>
                        <button
                          disabled={!pins.some((p) => p.id === m.user_id)}
                          onClick={() => {
                            const p = pins.find((x) => x.id === m.user_id)
                            if (p) mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 16 })
                          }}
                          className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-2 text-left transition enabled:hover:bg-[var(--accent-soft)]"
                        >
                          <span
                            className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold text-[#0a1128]"
                            style={{ background: m.profiles?.color ?? '#38BDF8' }}
                          >
                            {m.profiles?.emoji || (m.profiles?.display_name || '?').slice(0, 1).toUpperCase()}
                          </span>
                          <span className="flex-1 truncate text-sm font-semibold">
                            {m.profiles?.display_name || '?'}
                            {isMe && <span className="font-normal text-[var(--muted)]"> ({t('you')})</span>}
                          </span>
                          <span className="text-xs text-[var(--muted)]">{status}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="ghost" className="flex-1" onClick={invite}>
                    <Share2 size={16} /> {t('invite')}
                  </Button>
                  {meeting ? (
                    <>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${meeting.lat},${meeting.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-md"
                      >
                        <Navigation size={16} /> {t('navigate')}
                      </a>
                      <IconButton label={t('clearMeeting')} onClick={clearMeeting} className="shadow-none">
                        <Trash2 size={18} />
                      </IconButton>
                    </>
                  ) : (
                    !expired && (
                      <Button variant="ghost" className="flex-1" onClick={() => setPicking(true)}>
                        <MapPin size={16} /> {t('meetingPoint')}
                      </Button>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {(sheet === 'circles' || (mine && mine.length === 0)) && (
        <CirclesSheet
          mine={mine ?? []}
          currentId={circleId}
          now={now}
          onSelect={(id) => {
            setSelectedId(id)
            setSheet(null)
          }}
          onCreate={createCircle}
          onJoin={joinCircle}
          onLeave={leaveCircle}
          onClose={mine?.length ? () => setSheet(null) : undefined}
        />
      )}

      {sheet === 'map' && <MapSheet prefs={prefs} setPref={setPref} onClose={() => setSheet(null)} />}

      {sheet === 'settings' && (
        <SettingsSheet uid={uid} dark={dark} setDark={setDark} onSaved={() => circleId && loadCircle(circleId)} onClose={() => setSheet(null)} />
      )}

      {sheet === 'consent' && (
        <Sheet title={t('consentTitle')} onClose={() => setSheet(null)}>
          <p className="mb-5 text-sm leading-relaxed text-[var(--muted)]">{t('consentBody')}</p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                write('blup-consent', '1')
                setConsent(true)
                setSheet(null)
              }}
            >
              {t('consentOk')}
            </Button>
            <Button variant="ghost" onClick={() => setSheet(null)}>
              {t('notNow')}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
