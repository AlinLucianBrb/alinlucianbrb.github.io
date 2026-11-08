-- ===== Co-op lobbies =====
-- A player creates a lobby (public, or private with a password) and gets a 5-character name to share; others join it from
-- the list or by its name. Up to rule_max_players() per lobby. The host picks the level and starts the match; from then on
-- the players' games talk to each other directly (Supabase Realtime), and each saves its own run with start_run(stage, lobby)
-- and finish_run. Members keep their place by calling lobby_ping every few seconds while the lobby screen is open.

-- Solo records: runs before co-op were all solo, so each player's solo record starts from their profile.
insert into public.records (user_id, players, levels_cleared, frontier_wave, runs)
select id, 1, levels_cleared, frontier_wave, runs from public.profiles where runs > 0
on conflict (user_id, players) do nothing;

-- A random lobby name: 5 letters and numbers.
create or replace function public.lobby_code() returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 1 + floor(random() * 36)::int, 1), '') from generate_series(1, 5);
$$;

-- A salted password hash (lobby passwords keep strangers out of a match; they are not account passwords).
create or replace function public.lobby_hash(p_salt text, p_password text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_salt || ':' || p_password, 'UTF8')), 'hex');
$$;

-- What a member's lobby screen shows: the lobby and its members (never the password).
create or replace function public.lobby_state(p_lobby uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'name', l.name, 'host', l.host, 'is_private', l.is_private, 'stage', l.stage,
           'status', l.status, 'config', l.config, 'max_players', public.rule_max_players(),
           'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', p.username, 'level', p.level, 'slot', m.slot) order by m.slot)
                                  from public.lobby_members m join public.profiles p on p.id = m.user_id where m.lobby = l.id), '[]'))
    from public.lobbies l where l.id = p_lobby;
$$;

-- Takes a player out of a lobby (p_lobby), or out of every open lobby (p_lobby null). A host who leaves an open lobby hands
-- it to the next member; a lobby nobody is in any more is deleted.
create or replace function public.lobby_drop_member(p_user uuid, p_lobby uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  for l in select m.lobby from public.lobby_members m join public.lobbies b on b.id = m.lobby
            where m.user_id = p_user and (m.lobby = p_lobby or (p_lobby is null and b.status = 'open')) loop
    delete from public.lobby_members where lobby = l.lobby and user_id = p_user;
    if not exists (select 1 from public.lobby_members where lobby = l.lobby) then
      delete from public.lobbies where id = l.lobby;
    else
      update public.lobbies set host = (select user_id from public.lobby_members where lobby = l.lobby order by slot limit 1)
       where id = l.lobby and host = p_user;
    end if;
  end loop;
end;
$$;

-- Creates a lobby with the player as its host (and takes them out of any other open lobby). p_password: needed for a private
-- lobby, 1 to 32 characters. p_stage: a level the host has unlocked.
create or replace function public.create_lobby(p_private boolean, p_password text, p_stage int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; lid uuid; salt text; pw text := nullif(trim(coalesce(p_password, '')), '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'no profile'; end if;
  if p_stage < 1 or p_stage > public.rule_stage_count() then raise exception 'invalid stage'; end if;
  if p_stage > me.levels_cleared + 1 then raise exception 'stage locked'; end if;
  if p_private and pw is null then raise exception 'a private lobby needs a password'; end if;
  if length(pw) > 32 then raise exception 'the password can be at most 32 characters'; end if;
  if (select count(*) from public.lobbies where host = auth.uid() and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'slow down';
  end if;
  -- tidy up: old lobbies, and open ones everybody has left
  delete from public.lobbies where created_at < now() - interval '1 day';
  delete from public.lobbies l where l.status = 'open' and l.created_at < now() - interval '2 minutes'
     and not exists (select 1 from public.lobby_members m where m.lobby = l.id and m.seen_at > now() - interval '45 seconds');
  perform public.lobby_drop_member(auth.uid(), null);
  salt := case when p_private then md5(gen_random_uuid()::text) end;
  for attempt in 1 .. 20 loop
    begin
      insert into public.lobbies (name, host, is_private, pass_salt, pass_hash, stage)
      values (public.lobby_code(), auth.uid(), p_private, salt, case when p_private then public.lobby_hash(salt, pw) end, p_stage)
      returning id into lid;
      exit;
    exception when unique_violation then lid := null;   -- that name is taken: draw another
    end;
  end loop;
  if lid is null then raise exception 'could not find a free lobby name, try again'; end if;
  insert into public.lobby_members (lobby, user_id, slot) values (lid, auth.uid(), 0);
  return public.lobby_state(lid);
end;
$$;

-- Open lobbies with room, newest first (private ones too, marked: joining them asks for the password).
create or replace function public.list_lobbies()
returns table (name text, host_name text, players int, max_players int, is_private boolean, stage int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.name, p.username, c.n, public.rule_max_players(), l.is_private, l.stage, l.created_at
    from public.lobbies l
    join public.profiles p on p.id = l.host
    cross join lateral (select count(*)::int as n from public.lobby_members m where m.lobby = l.id and m.seen_at > now() - interval '45 seconds') c
   where l.status = 'open' and c.n between 1 and public.rule_max_players() - 1
   order by l.created_at desc
   limit 50;
$$;

-- Joins a lobby by its name (any case). A private lobby needs its password. Takes the lowest free slot.
create or replace function public.join_lobby(p_name text, p_password text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.lobbies; free int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into l from public.lobbies where name = upper(trim(coalesce(p_name, ''))) for update;
  if not found then raise exception 'no lobby with that name'; end if;
  if exists (select 1 from public.lobby_members where lobby = l.id and user_id = auth.uid()) then
    update public.lobby_members set seen_at = now() where lobby = l.id and user_id = auth.uid();
    return public.lobby_state(l.id);
  end if;
  if l.status <> 'open' then raise exception 'that lobby has already started its match'; end if;
  if l.is_private then
    if nullif(trim(coalesce(p_password, '')), '') is null then raise exception 'password needed'; end if;
    if public.lobby_hash(l.pass_salt, trim(p_password)) <> l.pass_hash then raise exception 'wrong password'; end if;
  end if;
  delete from public.lobby_members where lobby = l.id and seen_at < now() - interval '45 seconds';
  if (select count(*) from public.lobby_members where lobby = l.id) >= public.rule_max_players() then raise exception 'that lobby is full'; end if;
  perform public.lobby_drop_member(auth.uid(), null);
  -- the lobby may have been emptied by the clean-up above (its host gone for 45 seconds)
  if not exists (select 1 from public.lobbies where id = l.id) then raise exception 'no lobby with that name'; end if;
  select min(s) into free from generate_series(0, public.rule_max_players() - 1) s
   where s not in (select slot from public.lobby_members where lobby = l.id);
  insert into public.lobby_members (lobby, user_id, slot) values (l.id, auth.uid(), free);
  if not exists (select 1 from public.lobby_members m where m.lobby = l.id and m.user_id = l.host) then
    update public.lobbies set host = (select user_id from public.lobby_members where lobby = l.id order by slot limit 1) where id = l.id;
  end if;
  return public.lobby_state(l.id);
end;
$$;

-- Called every few seconds by each member's lobby screen: keeps their place, drops members who are gone (handing the lobby
-- on if the host is one of them) and returns the lobby as it is now.
create or replace function public.lobby_ping(p_lobby uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.lobbies; gone uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.lobby_members set seen_at = now() where lobby = p_lobby and user_id = auth.uid();
  if not found then raise exception 'not in this lobby'; end if;
  select * into l from public.lobbies where id = p_lobby for update;
  if l.status = 'open' then
    for gone in select user_id from public.lobby_members where lobby = p_lobby and seen_at < now() - interval '45 seconds' loop
      perform public.lobby_drop_member(gone, p_lobby);
    end loop;
  end if;
  return public.lobby_state(p_lobby);
end;
$$;

-- The host changes the level (one they have unlocked).
create or replace function public.set_lobby_stage(p_lobby uuid, p_stage int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into me from public.profiles where id = auth.uid();
  if not exists (select 1 from public.lobbies where id = p_lobby and host = auth.uid() and status = 'open') then raise exception 'only the host can change the level'; end if;
  if p_stage < 1 or p_stage > public.rule_stage_count() then raise exception 'invalid stage'; end if;
  if p_stage > me.levels_cleared + 1 then raise exception 'stage locked'; end if;
  update public.lobbies set stage = p_stage where id = p_lobby;
  return public.lobby_state(p_lobby);
end;
$$;

create or replace function public.leave_lobby(p_lobby uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.lobby_drop_member(auth.uid(), p_lobby);
end;
$$;

-- The host starts the match: at least 2 players. p_config is the match every member's game builds (seed, level and each
-- player's heroes, talents and gear), so that a member who missed the start message still gets it from lobby_ping.
create or replace function public.start_lobby(p_lobby uuid, p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.lobbies; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into l from public.lobbies where id = p_lobby for update;
  if not found or l.host <> auth.uid() then raise exception 'only the host can start the match'; end if;
  if l.status <> 'open' then raise exception 'the match has already started'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or octet_length(p_config::text) > 200000 then raise exception 'bad match'; end if;
  delete from public.lobby_members where lobby = p_lobby and seen_at < now() - interval '45 seconds' and user_id <> auth.uid();
  select count(*) into n from public.lobby_members where lobby = p_lobby;
  if n < 2 then raise exception 'a co-op match needs at least 2 players'; end if;
  update public.lobbies set status = 'playing', config = p_config, players = n, started_at = now() where id = p_lobby;
  return public.lobby_state(p_lobby);
end;
$$;
