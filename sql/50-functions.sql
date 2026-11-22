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

-- Public leaderboard for one mode (p_players: 1 solo, 2 to 4 co-op): levels cleared, then the furthest wave on the level a
-- player is working on, in that mode.
drop function if exists public.get_leaderboard(int);
drop function if exists public.get_leaderboard(int, int);
create function public.get_leaderboard(p_limit int default 20, p_players int default 1)
returns table (username text, level int, levels_cleared int, frontier_wave int)
language sql stable security definer set search_path = public as $$
  select p.username, p.level, r.levels_cleared, r.frontier_wave from public.records r join public.profiles p on p.id = r.user_id
  where r.players = p_players and r.runs > 0
  order by r.levels_cleared desc, r.frontier_wave desc, p.level desc, p.created_at
  limit least(greatest(p_limit, 1), 100);
$$;

-- The endless leaderboard of a mode: the best wave.
create or replace function public.get_endless_board(p_limit int default 20, p_players int default 1)
returns table (username text, level int, endless_wave int)
language sql stable security definer set search_path = public as $$
  select p.username, p.level, r.endless_wave from public.records r join public.profiles p on p.id = r.user_id
  where r.players = p_players and r.endless_wave > 0
  order by r.endless_wave desc, p.level desc, p.created_at
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

-- Called when a level starts. Only one unfinished run per player: starting a new one cancels the old one.
-- The run remembers the lineup and equipment it started with.
-- Co-op (p_lobby): the lobby must have been started by its host, the player must be in it, and the level is the lobby's.
-- The level only has to be unlocked for the host (create_lobby checks that), so friends can bring someone along.
drop function if exists public.start_run(int);
drop function if exists public.start_run(int, uuid);
create function public.start_run(p_stage int, p_lobby uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; rid uuid; lb public.lobbies; n int := 1;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_stage < 1 or (p_stage > public.rule_stage_count() and not public.rule_is_endless(p_stage)) then raise exception 'invalid stage'; end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'no profile'; end if;
  if p_lobby is null then
    if not public.rule_stage_open(p_stage, me.levels_cleared) then raise exception 'stage locked'; end if;
  else
    select * into lb from public.lobbies where id = p_lobby;
    if not found or lb.status <> 'playing' then raise exception 'that lobby has not started a match'; end if;
    if not exists (select 1 from public.lobby_members where lobby = p_lobby and user_id = auth.uid()) then raise exception 'not in this lobby'; end if;
    if lb.started_at < now() - interval '10 minutes' then raise exception 'that match started too long ago'; end if;
    if p_stage <> lb.stage then raise exception 'wrong level for this lobby'; end if;
    n := lb.players;
  end if;
  if exists (select 1 from public.runs where user_id = auth.uid() and finished_at is null and started_at > now() - interval '2 seconds') then
    raise exception 'slow down';
  end if;
  delete from public.runs where user_id = auth.uid() and finished_at is null;
  delete from public.runs where finished_at < now() - interval '30 days';
  insert into public.runs (user_id, stage, loadout, players, lobby)
  values (auth.uid(), p_stage, jsonb_build_object('lineup', to_jsonb(me.lineup), 'equipment', me.equipment, 'paths', me.paths), n, p_lobby)
  returning id into rid;
  return rid;
end;
$$;

-- Saves which heroes a player brings into matches (1 to 3 different heroes) and the gear each hero wears.
-- equipment is { "heroId": { "slot": "itemId" } }: every hero must exist, every item must belong to the player and fit the slot
-- it is in (its type's slot), and an item can only be worn once.
-- Evolution paths, chosen on a hero's page before a match and free to change: { heroId: formId }. Only known heroes, and
-- each value a short form id (the game ignores a form it does not know). An empty object clears them all.
create or replace function public.save_paths(p_paths jsonb) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_paths is null or jsonb_typeof(p_paths) <> 'object' then raise exception 'bad paths'; end if;
  if exists (select 1 from jsonb_each(p_paths) e where not exists (select 1 from public.hero_classes h where h.id = e.key)) then raise exception 'unknown hero'; end if;
  if exists (select 1 from jsonb_each(p_paths) e where jsonb_typeof(e.value) <> 'string' or e.value #>> '{}' !~ '^[a-z]{2,24}$') then raise exception 'bad paths'; end if;
  -- choosing a path unlocks on reaching its act; clearing them is always allowed
  if p_paths <> '{}'::jsonb and not exists (select 1 from public.profiles where id = auth.uid() and levels_cleared >= public.rule_unlock('paths')) then
    raise exception 'evolution paths are not unlocked yet';
  end if;
  update public.profiles set paths = p_paths where id = auth.uid() returning * into me;
  return me;
end $$;

create or replace function public.save_loadout(p_lineup text[], p_equipment jsonb) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  n := coalesce(array_length(p_lineup, 1), 0);
  if n < 1 or n > public.rule_lineup_max() then raise exception 'bring 1 to % heroes', public.rule_lineup_max(); end if;
  if (select count(distinct x) from unnest(p_lineup) x) <> n then raise exception 'each hero can only be brought once'; end if;
  if (select count(*) from public.hero_classes h where h.id = any (p_lineup)) <> n then raise exception 'unknown hero'; end if;
  if p_equipment is null or jsonb_typeof(p_equipment) <> 'object' then raise exception 'bad equipment'; end if;
  if exists (select 1 from jsonb_each(p_equipment) e where not exists (select 1 from public.hero_classes h where h.id = e.key)) then
    raise exception 'unknown hero';
  end if;
  if exists (select 1 from jsonb_each(p_equipment) e where jsonb_typeof(e.value) <> 'object') then raise exception 'bad equipment'; end if;
  if exists (select 1 from jsonb_each(p_equipment) h, jsonb_each(h.value) s where jsonb_typeof(s.value) <> 'string') then raise exception 'bad equipment'; end if;
  if exists (select 1 from jsonb_each(p_equipment) h, jsonb_each_text(h.value) s
              where not exists (select 1 from public.player_items i where i.id::text = s.value and i.user_id = auth.uid())) then
    raise exception 'you do not own that item';
  end if;
  if exists (select 1 from jsonb_each(p_equipment) h, jsonb_each_text(h.value) s
              join public.player_items i on i.id::text = s.value join public.item_types t on t.id = i.item_type
              where t.slot <> s.key) then
    raise exception 'that item does not go in that slot';
  end if;
  if (select count(*) from jsonb_each(p_equipment) h, jsonb_each_text(h.value) s)
     <> (select count(distinct s.value) from jsonb_each(p_equipment) h, jsonb_each_text(h.value) s) then
    raise exception 'an item can only be equipped once';
  end if;
  update public.profiles set lineup = p_lineup, equipment = p_equipment where id = auth.uid() returning * into me;
  return me;
end;
$$;

-- Called when a run ends. Each level's waves are rule_stage_waves; a level unlocks when the one before it is cleared.
-- The run must have been started on the server, be long enough to be real, and at most 30 runs per hour are saved.
drop function if exists public.finish_run(int, int);
drop function if exists public.finish_run(int, int, int, boolean);
-- Returns { "profile": the updated profile, "drop": the first item type found or null,
--           "drops": every item found, as [{ "item_type", "rarity", "bonuses", "bonus_ranks" }] }.
-- Each item gets a rarity (weights Common 55, Uncommon 28, Rare 13, Epic 4; Treasure Hunter talents multiply each rarer step's
-- weight by 1 + rarity luck, like relic luck), at least rarity + 1 bonuses, then a 30% chance (plus talents) for each further
-- one, up to 4, all different, each with its own rank 1 to 4 (rarer items roll higher ranks more often). On an archetype item
-- (melee, projectile, spell, minion) each bonus has a 60% chance to come from that archetype's bonuses. The same rules as
-- ROLL in js/content/items.js.
-- A win always drops an item; a loss has a chance that grows with the waves survived (up to 50%). Item find from talents raises
-- that: every full 100% is an item, and the rest is the chance of one more. Players can hold at most 200 items.
-- Talents can also raise the gold and XP the match gives (reward_gold, reward_xp in talent_nodes).
-- Every boss defeated (p_bosses) adds one guaranteed item. Bosses come on the last wave of a level and, from level 3 on, the
-- middle wave too, so a run cannot claim more bosses than the boss waves it reached.
-- Rolls and stores one item: rarity + 1 bonuses or more (p_extra adds to the chance of each further one), all different, each
-- with its own rank. On an archetype item (p_affinity) each bonus has a 60% chance to come from that archetype's bonuses (if
-- one is left). Used by finish_run (drops) and craft_item.
create or replace function public.roll_item(p_user uuid, p_type text, p_affinity text, p_rarity int, p_ilvl int, p_extra numeric) returns public.player_items
language plpgsql security definer set search_path = public as $$
declare nb int; bon text[] := '{}'; rks int[] := '{}'; pick text; it public.player_items;
begin
  nb := public.rule_bonus_guaranteed(p_rarity);
  while nb < public.rule_max_bonuses() and random() < public.rule_extra_bonus_chance() + p_extra loop nb := nb + 1; end loop;
  for k in 1 .. nb loop
    pick := null;
    if p_affinity is not null and random() < public.rule_affinity_chance() then
      select id into pick from public.item_bonuses where p_affinity = any (tags) and id <> all (bon) order by random() limit 1;
    end if;
    if pick is null then select id into pick from public.item_bonuses where id <> all (bon) order by random() limit 1; end if;
    exit when pick is null;
    bon := bon || pick;
  end loop;
  for k in 1 .. coalesce(array_length(bon, 1), 0) loop rks := rks || public.rule_rank(p_rarity, random()::numeric); end loop;
  insert into public.player_items (user_id, item_type, rarity, bonuses, bonus_ranks, ilvl) values (p_user, p_type, p_rarity, bon, rks, p_ilvl)
  returning * into it;
  return it;
end;
$$;

drop function if exists public.finish_run(uuid, int, int, boolean);
drop function if exists public.finish_run(uuid, int, int, boolean, int);
create function public.finish_run(p_run uuid, p_waves int, p_kills int, p_won boolean, p_bosses int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.runs; cap int; frontier boolean; endless boolean; elapsed numeric; done_waves int; dropped text := null;
        drops jsonb := '[]'; b_gold numeric; b_xp numeric; b_loot numeric; chance numeric; n int; boss_cap int;
        rar int; b_rar numeric; b_extra numeric; aff text; il int; it public.player_items;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from public.runs where id = p_run and user_id = auth.uid() and finished_at is null for update;
  if not found then raise exception 'unknown or already finished run'; end if;
  cap := public.rule_stage_waves(r.stage);
  if p_waves < 1 or p_waves > cap or p_kills < 0 or p_kills > public.rule_kill_cap(p_waves) then raise exception 'invalid run'; end if;
  endless := public.rule_is_endless(r.stage);
  if p_won and (endless or p_waves <> cap) then raise exception 'invalid win'; end if;   -- endless is never won
  boss_cap := public.rule_boss_cap(r.stage, p_waves);
  if p_bosses is null or p_bosses < 0 or p_bosses > boss_cap then raise exception 'invalid boss count'; end if;
  if p_won and p_bosses < 1 then raise exception 'a level is won by beating its final boss'; end if;
  if r.started_at < now() - interval '24 hours' then raise exception 'run expired'; end if;
  if (select count(*) from public.runs where user_id = auth.uid() and finished_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many runs, try again later';
  end if;
  elapsed := extract(epoch from (now() - r.started_at));
  done_waves := case when p_won then p_waves else p_waves - 1 end;
  if elapsed < public.rule_min_run(done_waves) then raise exception 'run too short'; end if;

  select * into me from public.profiles where id = auth.uid() for update;
  if r.players = 1 and not public.rule_stage_open(r.stage, me.levels_cleared) then raise exception 'stage locked'; end if;   -- co-op: unlocked for the host
  frontier := (not endless and r.stage = me.levels_cleared + 1);
  select coalesce(sum(t.reward_gold), 0), coalesce(sum(t.reward_xp), 0), coalesce(sum(t.reward_loot), 0),
         coalesce(sum(t.reward_rarity), 0), coalesce(sum(t.reward_extra), 0) into b_gold, b_xp, b_loot, b_rar, b_extra
    from public.talent_nodes t where t.id = any (me.talents);
  me.xp := me.xp + public.rule_run_xp(p_waves, p_kills, b_xp);
  me.gold := me.gold + public.rule_run_gold(p_waves, b_gold);
  while me.xp >= public.rule_xp_need(me.level) loop
    me.xp := me.xp - public.rule_xp_need(me.level);
    me.level := me.level + 1;
  end loop;
  update public.runs set finished_at = now() where id = r.id;
  update public.profiles
     set xp = me.xp, level = me.level, gold = me.gold, runs = runs + 1,
         best_wave = greatest(best_wave, p_waves),
         endless_wave = case when endless then greatest(endless_wave, p_waves) else endless_wave end,
         levels_cleared = case when p_won and r.stage <= levels_cleared + 1 then greatest(levels_cleared, r.stage) else levels_cleared end,
         frontier_wave = case when frontier and p_won then 0 when frontier then greatest(frontier_wave, p_waves) else frontier_wave end
   where id = auth.uid()
   returning * into me;
  -- this mode's record (solo, or co-op with 2, 3 or 4 players); solo, a level won out of order (all open for testing) does not count
  insert into public.records as x (user_id, players, levels_cleared, frontier_wave, runs, endless_wave)
  values (auth.uid(), r.players, case when p_won and (r.players > 1 or r.stage <= me.levels_cleared) then r.stage else 0 end, case when not p_won and r.stage = 1 then p_waves else 0 end, 1, case when endless then p_waves else 0 end)
  on conflict (user_id, players) do update
    set runs = x.runs + 1,
        endless_wave = greatest(x.endless_wave, excluded.endless_wave),
        frontier_wave = case when p_won and r.stage > x.levels_cleared and (r.players > 1 or r.stage <= me.levels_cleared) then 0
                             when not endless and r.stage = x.levels_cleared + 1 then greatest(x.frontier_wave, p_waves) else x.frontier_wave end,
        levels_cleared = case when p_won and (r.players > 1 or r.stage <= me.levels_cleared) then greatest(x.levels_cleared, r.stage) else x.levels_cleared end;
  il := public.rule_item_level(case when p_won then r.stage else r.stage - 1 end);   -- item level: by the level beaten (on a loss, the one below)
  chance := public.rule_drop_chance(p_won, p_waves, r.stage) * (1 + b_loot);
  if endless then chance := p_bosses * b_loot; end if;   -- one item per boss (below), and item find adds its share of them
  n := p_bosses + floor(chance)::int + (case when random() < chance - floor(chance) then 1 else 0 end);
  for i in 1 .. n loop
    exit when (select count(*) from public.player_items where user_id = auth.uid()) >= public.rule_max_items();
    dropped := null;
    select id, affinity into dropped, aff from public.item_types where droppable order by random() limit 1;
    exit when dropped is null;
    rar := public.rule_rarity(random()::numeric, b_rar);
    if endless then il := public.rule_endless_level(p_waves, random()::numeric); end if;   -- each item somewhere in the bracket reached
    it := public.roll_item(auth.uid(), dropped, aff, rar, il, b_extra);
    drops := drops || jsonb_build_array(jsonb_build_object('item_type', it.item_type, 'rarity', it.rarity, 'bonuses', to_jsonb(it.bonuses), 'bonus_ranks', to_jsonb(it.bonus_ranks), 'ilvl', it.ilvl));
  end loop;
  return jsonb_build_object('profile', to_jsonb(me), 'drop', drops -> 0 ->> 'item_type', 'drops', drops);
end;
$$;

-- ===== Selling items for account gold (the price is item_price, in the generated rules) =====
-- Sells one of the player's items: it must not be worn (take it off first). Returns the updated profile.
create or replace function public.sell_item(p_item uuid) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles; it public.player_items; price int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into it from public.player_items where id = p_item and user_id = auth.uid() for update;
  if not found then raise exception 'unknown item'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if exists (select 1 from jsonb_each(coalesce(me.equipment, '{}'::jsonb)) h,
                  jsonb_each_text(case when jsonb_typeof(h.value) = 'object' then h.value else jsonb_build_object('trinket', h.value) end) s
              where s.value = p_item::text) then
    raise exception 'take the item off before selling it';
  end if;
  price := public.item_price(it.rarity, it.bonuses, it.bonus_ranks);
  delete from public.player_items where id = it.id;
  update public.profiles set gold = gold + price where id = auth.uid() returning * into me;
  return me;
end;
$$;
