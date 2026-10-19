-- ═══════════════════════════════════════════════════════════════════════
-- BlupShare · Faza 1 · schemă + RLS
-- Rulează O SINGURĂ DATĂ în Supabase → SQL Editor → New query → Run.
-- Tabele: profiles, circles, memberships, locations, meeting_points.
-- (places / place_events vin în Faza 2.)
--
-- Reguli:
--  • RLS pe fiecare tabel; anon nu are acces la nimic.
--  • Cercurile se creează / se intră în ele DOAR prin funcțiile
--    create_circle() și join_circle() (nu prin insert direct).
--  • Vezi locația cuiva doar dacă sunteți în același cerc activ
--    (neexpirat) și EL are sharing_enabled = true în acel cerc.
-- ═══════════════════════════════════════════════════════════════════════

-- Helper functions live in "private", which the Data API does not expose.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ─── TABLES ─────────────────────────────────────────────────────────────

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  avatar_url   text check (char_length(avatar_url) <= 500),
  color        text not null default '#38BDF8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at   timestamptz not null default now()
);

create table public.circles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique,
  created_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz,               -- set for "Night out" circles
  created_at  timestamptz not null default now()
);

create table public.memberships (
  circle_id       uuid not null references public.circles (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'member')),
  sharing_enabled boolean not null default true,
  joined_at       timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- One latest row per user, upserted by the app.
create table public.locations (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  accuracy   real check (accuracy >= 0),
  battery    smallint check (battery between 0 and 100),
  speed      real check (speed >= 0),
  updated_at timestamptz not null default now()
);

-- One meeting point per circle (Night out).
create table public.meeting_points (
  circle_id  uuid primary key references public.circles (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  label      text check (char_length(label) <= 60),
  set_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ─── TRIGGERS ───────────────────────────────────────────────────────────

-- Server clock wins, so clients cannot fake freshness.
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger locations_touch before insert or update on public.locations
  for each row execute function private.touch_updated_at();
create trigger meeting_points_touch before insert or update on public.meeting_points
  for each row execute function private.touch_updated_at();

-- Every new auth user gets a profile (name from Google, else email prefix).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url, color)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name',
                  new.raw_user_meta_data ->> 'name',
                  split_part(new.email, '@', 1), ''), 40),
    new.raw_user_meta_data ->> 'avatar_url',
    (array['#38BDF8','#F472B6','#A78BFA','#34D399','#FBBF24','#FB7185','#60A5FA','#F97316'])
      [1 + floor(random() * 8)::int]
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ─── RLS HELPERS (security definer = no recursion through memberships) ──

create function private.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships
                 where circle_id = c and user_id = (select auth.uid()));
$$;

create function private.is_owner(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships
                 where circle_id = c and user_id = (select auth.uid()) and role = 'owner');
$$;

-- Do I share ANY circle with this user? (to see their name/color)
create function private.shares_circle(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships me
                 join public.memberships them on them.circle_id = me.circle_id
                 where me.user_id = (select auth.uid()) and them.user_id = target);
$$;

-- Can I see this user's location? Same ACTIVE circle + they share in THAT circle.
create function private.can_see_location(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships me
                 join public.memberships them on them.circle_id = me.circle_id
                 join public.circles c on c.id = me.circle_id
                 where me.user_id = (select auth.uid())
                   and them.user_id = target
                   and them.sharing_enabled
                   and (c.expires_at is null or c.expires_at > now()));
$$;

-- ─── RPC: create / join circles ─────────────────────────────────────────

-- 8 chars from 32 unambiguous symbols ≈ 10^12 codes, so guessing is impractical.
create function public.create_circle(p_name text, p_night_out boolean default false)
returns public.circles
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  uid uuid := auth.uid();
  b bytea;
  code text;
  i int;
  result public.circles;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  loop
    b := uuid_send(gen_random_uuid());
    code := '';
    foreach i in array array[0,1,2,3,4,5,10,11] loop  -- skip uuid version/variant bytes
      code := code || substr(alphabet, 1 + get_byte(b, i) % 32, 1);
    end loop;
    insert into public.circles (name, invite_code, created_by, expires_at)
    values (trim(p_name), code, uid,
            case when p_night_out then now() + interval '12 hours' end)
    on conflict (invite_code) do nothing
    returning * into result;
    exit when found;
  end loop;
  insert into public.memberships (circle_id, user_id, role) values (result.id, uid, 'owner');
  return result;
end $$;

create function public.join_circle(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.circles;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into c from public.circles where invite_code = upper(trim(p_code));
  if not found then raise exception 'invalid invite code' using errcode = 'P0002'; end if;
  if c.expires_at is not null and c.expires_at <= now() then
    raise exception 'circle expired' using errcode = 'P0001';
  end if;
  insert into public.memberships (circle_id, user_id) values (c.id, uid)
  on conflict do nothing;
  return c.id;
end $$;

-- ─── PRIVILEGES (explicit, works whether "auto-expose" was on or off) ───

revoke all on public.profiles, public.circles, public.memberships,
              public.locations, public.meeting_points from anon, authenticated;

grant select, update (display_name, avatar_url, color) on public.profiles to authenticated;
grant select, delete, update (name)                    on public.circles to authenticated;
grant select, delete, update (sharing_enabled)         on public.memberships to authenticated;
grant select, insert, update, delete                   on public.locations to authenticated;
grant select, insert, update, delete                   on public.meeting_points to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(uuid), private.is_owner(uuid),
                          private.shares_circle(uuid), private.can_see_location(uuid)
  to authenticated;

revoke execute on function public.create_circle(text, boolean), public.join_circle(text)
  from public, anon;
grant execute on function public.create_circle(text, boolean), public.join_circle(text)
  to authenticated;

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────

alter table public.profiles       enable row level security;
alter table public.circles        enable row level security;
alter table public.memberships    enable row level security;
alter table public.locations      enable row level security;
alter table public.meeting_points enable row level security;

-- profiles: me + people I share a circle with; edit only mine
create policy "profiles: read me and circle mates" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_circle(id));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- circles: members read; owner renames/deletes; create only via create_circle()
create policy "circles: members read" on public.circles for select to authenticated
  using (private.is_member(id));
create policy "circles: owner renames" on public.circles for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id));
create policy "circles: owner deletes" on public.circles for delete to authenticated
  using (private.is_owner(id));

-- memberships: members see the member list; I toggle my own sharing;
-- I can leave, owner can remove people; join only via join_circle()
create policy "memberships: members read" on public.memberships for select to authenticated
  using (private.is_member(circle_id));
create policy "memberships: toggle own sharing" on public.memberships for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "memberships: leave or owner removes" on public.memberships for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_owner(circle_id));

-- locations: write only mine; read mine + shared ones
create policy "locations: read own and shared" on public.locations for select to authenticated
  using (user_id = (select auth.uid()) or private.can_see_location(user_id));
create policy "locations: insert own" on public.locations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "locations: update own" on public.locations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "locations: delete own" on public.locations for delete to authenticated
  using (user_id = (select auth.uid()));

-- meeting_points: any member of the circle reads / sets / clears it
create policy "meeting_points: members read" on public.meeting_points for select to authenticated
  using (private.is_member(circle_id));
create policy "meeting_points: members insert" on public.meeting_points for insert to authenticated
  with check (private.is_member(circle_id) and set_by = (select auth.uid()));
create policy "meeting_points: members update" on public.meeting_points for update to authenticated
  using (private.is_member(circle_id))
  with check (private.is_member(circle_id) and set_by = (select auth.uid()));
create policy "meeting_points: members delete" on public.meeting_points for delete to authenticated
  using (private.is_member(circle_id));

-- ─── REALTIME (RLS is applied per subscriber) ───────────────────────────

alter publication supabase_realtime add table public.locations, public.meeting_points;
