-- ===== Achievements (js/content/achievements.js): progress from finished matches, claiming rewards, wearing a title =====
-- Counts what a finished match adds (finish_run calls it): a win on a level, the bosses killed there, and a win for every
-- hero of the lineup in that level's act. Endless counts only its best wave (profiles.endless_wave).
create or replace function public.track_run(p_user uuid, p_stage int, p_won boolean, p_bosses int, p_lineup text[]) returns void
language plpgsql security definer set search_path = public as $$
declare z int; h text;
begin
  if public.rule_is_endless(p_stage) then return; end if;
  z := public.rule_stage_zone(p_stage);
  if p_won then
    insert into public.player_progress as x (user_id, key, value) values (p_user, 'win:' || p_stage, 1)
      on conflict (user_id, key) do update set value = x.value + excluded.value;
    foreach h in array coalesce(p_lineup, '{}'::text[]) loop
      insert into public.player_progress as x (user_id, key, value) values (p_user, 'hero:' || h || ':' || z, 1)
        on conflict (user_id, key) do update set value = x.value + excluded.value;
    end loop;
  end if;
  if coalesce(p_bosses, 0) > 0 then
    insert into public.player_progress as x (user_id, key, value) values (p_user, 'boss:' || p_stage, p_bosses)
      on conflict (user_id, key) do update set value = x.value + excluded.value;
  end if;
end;
$$;

-- How far a player is with one achievement (the same as progressOf in js/content/achievements.js).
create or replace function public.achievement_progress(p_user uuid, p_def public.achievement_defs) returns int
language sql stable security definer set search_path = public as $$
  select case p_def.kind
    when 'clear' then (select count(*)::int from public.player_progress p where p.user_id = p_user and p.key like 'win:%' and p.value > 0
                         and public.rule_stage_zone(substr(p.key, 5)::int) = p_def.act)
    when 'wins' then (select coalesce(sum(p.value), 0)::int from public.player_progress p where p.user_id = p_user and p.key like 'win:%'
                         and public.rule_stage_zone(substr(p.key, 5)::int) = p_def.act)
    when 'bosses' then (select coalesce(sum(p.value), 0)::int from public.player_progress p where p.user_id = p_user and p.key like 'boss:%'
                         and public.rule_stage_zone(substr(p.key, 6)::int) = p_def.act)
    when 'heroWins' then (select coalesce(sum(p.value), 0)::int from public.player_progress p where p.user_id = p_user and p.key like 'hero:' || p_def.hero || ':%')
    when 'heroAct' then coalesce((select p.value from public.player_progress p where p.user_id = p_user and p.key = 'hero:' || p_def.hero || ':' || p_def.act), 0)
    when 'endless' then coalesce((select endless_wave from public.profiles where id = p_user), 0)
    else 0 end
$$;

-- Claims a finished achievement once: pays its gold and materials (its title can then be worn). Returns the profile.
create or replace function public.claim_achievement(p_id text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare d public.achievement_defs; me public.profiles;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into d from public.achievement_defs where id = p_id;
  if not found then raise exception 'unknown achievement'; end if;
  if exists (select 1 from public.player_achievements where user_id = auth.uid() and id = p_id) then raise exception 'already claimed'; end if;
  if public.achievement_progress(auth.uid(), d) < d.target then raise exception 'not done yet'; end if;
  insert into public.player_achievements (user_id, id) values (auth.uid(), p_id);
  update public.profiles
     set gold = gold + d.gold,
         materials = array[materials[1] + d.materials[1], materials[2] + d.materials[2], materials[3] + d.materials[3], materials[4] + d.materials[4]]
   where id = auth.uid() returning * into me;
  return me;
end;
$$;

-- Wears a title from a claimed achievement by the player's name (null: none). Returns the profile.
create or replace function public.set_title(p_title text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_title is not null and not exists (select 1 from public.player_achievements c join public.achievement_defs d on d.id = c.id
                                           where c.user_id = auth.uid() and d.title = p_title) then
    raise exception 'that title is not unlocked';
  end if;
  update public.profiles set title = p_title where id = auth.uid() returning * into me;
  return me;
end;
$$;
