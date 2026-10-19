-- ═══════════════════════════════════════════════════════════════════════
-- BlupShare · teste pentru 002 (emoji, reacții). Rulează după 002.
-- Totul se anulează la final (ROLLBACK). Corect = "002 tests passed".
-- ═══════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  x uuid := gen_random_uuid();  -- attacker, not in the circle
  c1 public.circles;
  n int;
  blocked boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'a@test.local', 'authenticated', 'authenticated'),
    (b, 'b@test.local', 'authenticated', 'authenticated'),
    (x, 'x@test.local', 'authenticated', 'authenticated');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  c1 := public.create_circle('Test', false);
  update public.profiles set emoji = '🦊', show_activity = false where id = a;
  get diagnostics n = row_count;
  assert n = 1, 'FAIL: could not set own emoji';

  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  perform public.join_circle(c1.invite_code);
  update public.profiles set emoji = '💀' where id = a;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: B changed A''s emoji';

  -- B reacts to A
  insert into public.reactions (circle_id, to_user, emoji) values (c1.id, a, '🍻');
  blocked := false;
  begin
    insert into public.reactions (circle_id, to_user, emoji) values (c1.id, a, '🍆');
  exception when check_violation then blocked := true;
  end;
  assert blocked, 'FAIL: emoji outside the allowed set accepted';
  blocked := false;
  begin
    insert into public.reactions (circle_id, from_user, to_user, emoji) values (c1.id, a, b, '👋');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: B sent a reaction as A';
  blocked := false;
  begin
    insert into public.reactions (circle_id, to_user, emoji) values (c1.id, x, '👋');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: reaction to someone outside the circle';

  -- spam limit: 1 sent above, 4 more OK, the 6th blocked
  for i in 1..4 loop
    insert into public.reactions (circle_id, to_user, emoji) values (c1.id, a, '🔥');
  end loop;
  blocked := false;
  begin
    insert into public.reactions (circle_id, to_user, emoji) values (c1.id, a, '🔥');
  exception when raise_exception then blocked := true;
  end;
  assert blocked, 'FAIL: spam limit not enforced';

  -- A sees reactions to A
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  select count(*) into n from public.reactions where to_user = a;
  assert n = 5, 'FAIL: A should see 5 reactions, saw ' || n;
  blocked := false;
  begin
    delete from public.reactions;
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: reactions can be deleted by users';

  -- X, the attacker
  perform set_config('request.jwt.claims', json_build_object('sub', x)::text, true);
  select count(*) into n from public.reactions;
  assert n = 0, 'FAIL: X sees reactions';
  blocked := false;
  begin
    insert into public.reactions (circle_id, to_user, emoji) values (c1.id, a, '👋');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL: X sent a reaction into a foreign circle';
  select count(*) into n from public.profiles where id = a;
  assert n = 0, 'FAIL: X sees A''s profile';

  perform set_config('role', 'postgres', true);
end $$;

select '002 tests passed' as result;
rollback;
