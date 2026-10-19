-- ═══════════════════════════════════════════════════════════════════════
-- BlupShare · 002 · emoji avatars, activity switch, emoji reactions
-- Rulează O SINGURĂ DATĂ în Supabase → SQL Editor, după 001.
--  • profiles.emoji        — emoji-ul tău pe hartă (null = inițiala)
--  • profiles.show_activity — arată prietenilor 🚶🚲🚗😴 sau nu
--  • reactions             — 👋🍻🔥… trimise unui prieten din același cerc;
--                            efemere: se șterg singure după 24 h,
--                            maximum 5 la 10 secunde per persoană.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── PROFILES ───────────────────────────────────────────────────────────

alter table public.profiles
  add column emoji text check (char_length(emoji) between 1 and 16),
  add column show_activity boolean not null default true;

grant update (emoji, show_activity) on public.profiles to authenticated;

-- ─── REACTIONS ──────────────────────────────────────────────────────────

create table public.reactions (
  id         bigint generated always as identity primary key,
  circle_id  uuid not null references public.circles (id) on delete cascade,
  from_user  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (emoji in ('👋','🍻','🔥','❤️','😂','🥳','👀','🏃')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index reactions_to_user_idx on public.reactions (to_user, created_at);
create index reactions_from_user_idx on public.reactions (from_user, created_at);

-- Is this user (not just me) a member of the circle?
create function private.is_circle_member(c uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where circle_id = c and user_id = u);
$$;
revoke execute on function private.is_circle_member(uuid, uuid) from public, anon;
grant execute on function private.is_circle_member(uuid, uuid) to authenticated;

-- Spam limit + 24 h retention, enforced on every insert
create function private.reactions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if (select count(*) from public.reactions
      where from_user = new.from_user and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'slow down' using errcode = 'P0001';
  end if;
  delete from public.reactions where created_at < now() - interval '24 hours';
  return new;
end $$;
revoke execute on function private.reactions_guard() from public, anon, authenticated;

create trigger reactions_guard before insert on public.reactions
  for each row execute function private.reactions_guard();

revoke all on public.reactions from anon, authenticated;
grant select, insert (circle_id, from_user, to_user, emoji) on public.reactions to authenticated;

alter table public.reactions enable row level security;

create policy "reactions: read mine" on public.reactions for select to authenticated
  using (to_user = (select auth.uid()) or from_user = (select auth.uid()));
create policy "reactions: send to circle mate" on public.reactions for insert to authenticated
  with check (
    from_user = (select auth.uid())
    and private.is_member(circle_id)
    and private.is_circle_member(circle_id, to_user)
  );

alter publication supabase_realtime add table public.reactions;
