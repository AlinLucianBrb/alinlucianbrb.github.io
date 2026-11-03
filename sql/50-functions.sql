-- ===== Functions =====

-- Returns null if the username is fine, otherwise 'format', 'blocked' or 'lookalike'.
create or replace function public.username_problem(p_username text) returns text
language plpgsql stable security definer set search_path = public as $$
declare skel text;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,16}$' then return 'format'; end if;
  skel := translate(lower(p_username), '01i', 'oll');
  if exists (
    select 1 from public.blocked_names b
    where (b.mode = 'exact' and translate(b.term, '01i', 'oll') = skel)
       or (b.mode = 'contains' and position(translate(b.term, '01i', 'oll') in skel) > 0)
  ) then return 'blocked'; end if;
  if exists (
    select 1 from public.profiles p
    where translate(lower(p.username), '01i', 'oll') = skel and lower(p.username) <> lower(p_username)
  ) then return 'lookalike'; end if;
  return null;
end;
$$;

-- Creates the profile when an account is created. Enforces the username rules even if someone skips the sign-up form.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare prob text;
begin
  prob := public.username_problem(new.raw_user_meta_data ->> 'username');
  if prob is not null then raise exception 'username not allowed (%)', prob; end if;
  insert into public.profiles (id, username, email)
  values (new.id, new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'contact_email');
  return new;
end;
$$;

-- Used by the sign-up form for friendly messages.
create or replace function public.signup_check(p_username text, p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'username_taken',   exists (select 1 from public.profiles where lower(username) = lower(p_username)),
    'email_taken',      exists (select 1 from public.profiles where lower(email) = lower(p_email)),
    'username_problem', public.username_problem(p_username));
$$;

-- Public leaderboard: levels cleared, then furthest wave on the level a player is working on.
drop function if exists public.get_leaderboard(int);
create function public.get_leaderboard(p_limit int default 20)
returns table (username text, level int, levels_cleared int, frontier_wave int)
language sql stable security definer set search_path = public as $$
  select p.username, p.level, p.levels_cleared, p.frontier_wave from public.profiles p
  where p.runs > 0
  order by p.levels_cleared desc, p.frontier_wave desc, p.level desc, p.created_at
  limit least(greatest(p_limit, 1), 100);
$$;

-- Talent points: 1 per level above 1. Checks the point budget, that every node exists, and that each one connects to its tree's start.
create or replace function public.save_talents(p_nodes text[]) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles; nodes text[]; n int; ok int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  nodes := coalesce(p_nodes, '{}');
  n := coalesce(array_length(nodes, 1), 0);
  if n > me.level - 1 then raise exception 'too many talent points'; end if;
  if (select count(distinct x) from unnest(nodes) x) <> n then raise exception 'duplicate nodes'; end if;
  if n > 0 then
    if (select count(*) from public.talent_nodes t where t.id = any (nodes) and not t.is_root) <> n then
      raise exception 'unknown talent node';
    end if;
    with recursive reach(id) as (
      select t.id from public.talent_nodes t where t.is_root
      union
      select l.b from reach r join public.talent_links l on l.a = r.id where l.b = any (nodes)
    )
    select count(*) into ok from reach where id = any (nodes);
    if ok <> n then raise exception 'talents must connect to the start of their tree'; end if;
  end if;
  update public.profiles set talents = nodes where id = auth.uid() returning * into me;
  return me;
end;
$$;

-- Lower bound on how long a run of this many completed waves takes in real time: enemies spawn one at a time, and the game runs at
-- most 2x speed, so a wave cannot finish faster than half its spawn time. 0.8 leaves a safety margin.
create or replace function public.min_run_seconds(p_waves int) returns numeric
language sql immutable as $$
  select coalesce(sum(0.4 * (4 + 2 * w) * greatest(0.35, 0.85 - 0.02 * w)), 0)
  from generate_series(1, greatest(p_waves, 0)) as w;
$$;

-- Called when a level starts. Only one unfinished run per player: starting a new one cancels the old one.
-- The run remembers the lineup and equipment it started with.
drop function if exists public.start_run(int);
create function public.start_run(p_stage int) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; rid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_stage < 1 or p_stage > 5 then raise exception 'invalid stage'; end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'no profile'; end if;
  if p_stage > me.levels_cleared + 1 then raise exception 'stage locked'; end if;
  if exists (select 1 from public.runs where user_id = auth.uid() and finished_at is null and started_at > now() - interval '2 seconds') then
    raise exception 'slow down';
  end if;
  delete from public.runs where user_id = auth.uid() and finished_at is null;
  delete from public.runs where finished_at < now() - interval '30 days';
  insert into public.runs (user_id, stage, loadout)
  values (auth.uid(), p_stage, jsonb_build_object('lineup', to_jsonb(me.lineup), 'equipment', me.equipment))
  returning id into rid;
  return rid;
end;
$$;

-- Saves which heroes a player brings into matches (1 to 3 different heroes) and the item equipped on each hero.
-- equipment is { "heroId": "itemId" }: every hero must exist, every item must belong to the player, and an item can only be worn once.
create or replace function public.save_loadout(p_lineup text[], p_equipment jsonb) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  n := coalesce(array_length(p_lineup, 1), 0);
  if n < 1 or n > 3 then raise exception 'bring 1 to 3 heroes'; end if;
  if (select count(distinct x) from unnest(p_lineup) x) <> n then raise exception 'each hero can only be brought once'; end if;
  if (select count(*) from public.hero_classes h where h.id = any (p_lineup)) <> n then raise exception 'unknown hero'; end if;
  if p_equipment is null or jsonb_typeof(p_equipment) <> 'object' then raise exception 'bad equipment'; end if;
  if exists (select 1 from jsonb_each_text(p_equipment) e where not exists (select 1 from public.hero_classes h where h.id = e.key)) then
    raise exception 'unknown hero';
  end if;
  if exists (select 1 from jsonb_each_text(p_equipment) e
              where not exists (select 1 from public.player_items i where i.id::text = e.value and i.user_id = auth.uid())) then
    raise exception 'you do not own that item';
  end if;
  if (select count(*) from jsonb_each_text(p_equipment)) <> (select count(distinct value) from jsonb_each_text(p_equipment)) then
    raise exception 'an item can only be equipped once';
  end if;
  update public.profiles set lineup = p_lineup, equipment = p_equipment where id = auth.uid() returning * into me;
  return me;
end;
$$;

-- Called when a run ends. Five levels: 15, 20, 25, 30 and 35 waves; a level unlocks when the one before it is cleared.
-- The run must have been started on the server, be long enough to be real, and at most 30 runs per hour are saved.
drop function if exists public.finish_run(int, int);
drop function if exists public.finish_run(int, int, int, boolean);
-- Returns { "profile": the updated profile, "drop": the item type found, or null }. A win always drops an item; a loss has a
-- chance that grows with the waves survived (up to 50%). Players can hold at most 200 items.
drop function if exists public.finish_run(uuid, int, int, boolean);
create function public.finish_run(p_run uuid, p_waves int, p_kills int, p_won boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.runs; cap int; frontier boolean; elapsed numeric; done_waves int; dropped text := null;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from public.runs where id = p_run and user_id = auth.uid() and finished_at is null for update;
  if not found then raise exception 'unknown or already finished run'; end if;
  cap := 10 + 5 * r.stage;
  if p_waves < 1 or p_waves > cap or p_kills < 0 or p_kills > p_waves * (p_waves + 6) then raise exception 'invalid run'; end if;
  if p_won and p_waves <> cap then raise exception 'invalid win'; end if;
  if r.started_at < now() - interval '24 hours' then raise exception 'run expired'; end if;
  if (select count(*) from public.runs where user_id = auth.uid() and finished_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many runs, try again later';
  end if;
  elapsed := extract(epoch from (now() - r.started_at));
  done_waves := case when p_won then p_waves else p_waves - 1 end;
  if elapsed < greatest(15, public.min_run_seconds(done_waves)) then raise exception 'run too short'; end if;

  select * into me from public.profiles where id = auth.uid() for update;
  if r.stage > me.levels_cleared + 1 then raise exception 'stage locked'; end if;
  frontier := (r.stage = me.levels_cleared + 1);
  me.xp := me.xp + p_waves * 10 + p_kills;
  me.gold := me.gold + p_waves * 5;
  while me.xp >= 50 + me.level * 50 loop
    me.xp := me.xp - (50 + me.level * 50);
    me.level := me.level + 1;
  end loop;
  update public.runs set finished_at = now() where id = r.id;
  update public.profiles
     set xp = me.xp, level = me.level, gold = me.gold, runs = runs + 1,
         best_wave = greatest(best_wave, p_waves),
         levels_cleared = case when p_won then greatest(levels_cleared, r.stage) else levels_cleared end,
         frontier_wave = case when frontier and p_won then 0 when frontier then greatest(frontier_wave, p_waves) else frontier_wave end
   where id = auth.uid()
   returning * into me;
  if random() < (case when p_won then 1 else 0.5 * p_waves::numeric / cap end)
     and (select count(*) from public.player_items where user_id = auth.uid()) < 200 then
    select id into dropped from public.item_types where droppable order by random() limit 1;
    if dropped is not null then insert into public.player_items (user_id, item_type) values (auth.uid(), dropped); end if;
  end if;
  return jsonb_build_object('profile', to_jsonb(me), 'drop', dropped);
end;
$$;
