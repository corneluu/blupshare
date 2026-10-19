-- ═══════════════════════════════════════════════════════════════════════
-- BlupShare · teste RLS (atacator = un utilizator din afara cercului)
-- Rulează în Supabase → SQL Editor după 001_phase1_schema.sql.
-- Totul e într-o tranzacție cu ROLLBACK: nu rămân date de test.
-- Rezultat corect: un rând "all RLS tests passed".
-- Dacă un test pică, vezi eroarea "FAIL: ...".
-- ═══════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  a uuid := gen_random_uuid();  -- circle owner
  b uuid := gen_random_uuid();  -- friend who joins
  x uuid := gen_random_uuid();  -- attacker, never invited
  c1 public.circles;
  c2 public.circles;
  n int;
  blocked boolean;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (a, 'a@test.local', 'authenticated', 'authenticated', '{"full_name":"Ana Test"}'),
    (b, 'b@test.local', 'authenticated', 'authenticated', '{}'),
    (x, 'x@test.local', 'authenticated', 'authenticated', '{}');

  select count(*) into n from public.profiles where id in (a, b, x);
  assert n = 3, 'FAIL: signup trigger did not create profiles';
  assert (select display_name from public.profiles where id = a) = 'Ana Test', 'FAIL: name from metadata';

  -- ── A creates a normal circle and a night-out circle, shares location ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  c1 := public.create_circle('Prieteni', false);
  c2 := public.create_circle('Night out', true);
  assert c1.invite_code ~ '^[A-HJ-NP-Z2-9]{8}$', 'FAIL: invite code format';
  assert c2.expires_at > now() + interval '11 hours', 'FAIL: night out expiry';
  insert into public.locations (user_id, lat, lng) values (a, 45.7537, 21.2257);

  -- ── B joins both (lower-case code with spaces must still work) ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.join_circle(' ' || lower(c1.invite_code) || ' ');
  perform public.join_circle(c2.invite_code);
  select count(*) into n from public.locations where user_id = a;
  assert n = 1, 'FAIL: B should see A';
  select count(*) into n from public.profiles where id = a;
  assert n = 1, 'FAIL: B should see A''s profile';
  insert into public.meeting_points (circle_id, lat, lng, label, set_by)
    values (c2.id, 45.757, 21.229, 'Piața Unirii', b);

  -- B cannot touch A's sharing flag, own role, or A's location
  update public.memberships set sharing_enabled = false where user_id = a;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: B changed A''s sharing flag';
  update public.locations set lat = 0 where user_id = a;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: B moved A''s location';
  blocked := false;
  begin
    update public.memberships set role = 'owner' where user_id = b;
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: B promoted self to owner';
  delete from public.circles where id = c1.id;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: non-owner deleted circle';

  -- ── X, the attacker: must see and change nothing ──
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  select count(*) into n from public.locations where user_id <> x;
  assert n = 0, 'FAIL: X sees locations';
  select count(*) into n from public.profiles where id <> x;
  assert n = 0, 'FAIL: X sees profiles';
  select count(*) into n from public.circles;
  assert n = 0, 'FAIL: X sees circles';
  select count(*) into n from public.memberships;
  assert n = 0, 'FAIL: X sees memberships';
  select count(*) into n from public.meeting_points;
  assert n = 0, 'FAIL: X sees meeting points';
  update public.locations set lat = 0 where user_id = a;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: X moved A''s location';
  delete from public.memberships where circle_id = c1.id;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: X deleted memberships';
  blocked := false;
  begin
    insert into public.memberships (circle_id, user_id) values (c1.id, x);
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: X inserted a membership directly';
  blocked := false;
  begin
    insert into public.circles (name, invite_code) values ('hack', 'AAAAAAAA');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: X inserted a circle directly';
  blocked := false;
  begin
    insert into public.locations (user_id, lat, lng) values (a, 1, 1);
  exception when insufficient_privilege or unique_violation then blocked := true;
  end;
  assert blocked, 'FAIL: X wrote a location as A';
  blocked := false;
  begin
    insert into public.meeting_points (circle_id, lat, lng, set_by) values (c1.id, 1, 1, x);
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: X set a meeting point in a foreign circle';
  blocked := false;
  begin
    perform public.join_circle('ZZZZZZZZ');
  exception when no_data_found then blocked := true;
  end;
  assert blocked, 'FAIL: wrong invite code accepted';

  -- ── Anonymous (not logged in): nothing ──
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  blocked := false;
  begin
    select count(*) into n from public.locations;
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: anon can read locations';
  blocked := false;
  begin
    perform public.create_circle('anon', false);
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: anon can call create_circle';

  -- ── Pause is per circle: A pauses in c1, still shares in c2 ──
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.memberships set sharing_enabled = false where circle_id = c1.id and user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.locations where user_id = a;
  assert n = 1, 'FAIL: B should still see A via the night-out circle';

  -- ── Night out expires: A is paused in c1 and c2 is over, so B sees nothing ──
  perform set_config('role', 'postgres', true);
  update public.circles set expires_at = now() - interval '1 minute' where id = c2.id;
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.locations where user_id = a;
  assert n = 0, 'FAIL: B sees A after pause + expiry';
  blocked := false;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  begin
    perform public.join_circle(c2.invite_code);
  exception when raise_exception then blocked := true;
  end;
  assert blocked, 'FAIL: joined an expired circle';

  -- ── Leaving works; owner can remove a member ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  delete from public.memberships where circle_id = c1.id and user_id = b;
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: owner could not remove member';

  perform set_config('role', 'postgres', true);
end $$;

select 'all RLS tests passed' as result;
rollback;
