-- ===== Gems (the numbers are the rule_* functions and gem_kinds, generated from js/content/gems.js) =====
-- profiles.stones is the player's Rough Stone (from finish_run). Gems unlock with crafting.

-- A gem row as the game reads it.
create or replace function public.gem_json(g public.player_gems) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', g.id, 'gem_type', g.gem_type, 'stat', g.stat, 'rarity', g.rarity, 'ilvl', g.ilvl,
                            'item', g.item, 'socket', g.socket, 'created_at', g.created_at);
$$;

-- Makes a Common gem of a family: one of its types at random, then one of that type's stats. Costs rule_gem_stones() Rough
-- Stone and rule_gem_gold() gold; its item level is that of the highest level beaten. Returns { "profile", "gem" }.
create or replace function public.craft_gem(p_family text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; kind text; st text; g public.player_gems;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  perform public.require_unlock('crafting', me.levels_cleared);
  select gem_type into kind from (select distinct gem_type from public.gem_kinds where family = p_family) t order by random() limit 1;
  if kind is null then raise exception 'unknown gem family'; end if;
  select stat into st from public.gem_kinds where gem_type = kind order by random() limit 1;
  if (select count(*) from public.player_gems where user_id = auth.uid()) >= public.rule_max_gems() then raise exception 'your gem bag is full'; end if;
  if me.stones < public.rule_gem_stones() then raise exception 'not enough Rough Stone'; end if;
  if me.gold < public.rule_gem_gold() then raise exception 'not enough gold'; end if;
  update public.profiles set stones = stones - public.rule_gem_stones(), gold = gold - public.rule_gem_gold()
   where id = auth.uid() returning * into me;
  insert into public.player_gems (user_id, gem_type, stat, rarity, ilvl)
  values (auth.uid(), kind, st, 0, public.rule_item_level(me.levels_cleared)) returning * into g;
  return jsonb_build_object('profile', to_jsonb(me), 'gem', public.gem_json(g));
end;
$$;

-- Combines rule_gem_combine() gems of the same type and rarity (below Epic) into one of the next rarity. It keeps the stat of
-- one of them (picked at random) and the highest item level. The gems must be the player's; socketed ones are taken out.
-- Returns { "gem" } (the new one; the others are gone).
create or replace function public.combine_gems(p_gems uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; n int := coalesce(array_length(p_gems, 1), 0); kinds int; rar int; kind text; st text; il int; g public.player_gems;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if n <> public.rule_gem_combine() then raise exception 'choose % gems', public.rule_gem_combine(); end if;
  if (select count(distinct x) from unnest(p_gems) x) <> n then raise exception 'each gem only once'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  perform public.require_unlock('crafting', me.levels_cleared);
  perform 1 from public.player_gems where id = any (p_gems) and user_id = auth.uid() order by id for update;
  if (select count(*) from public.player_gems where id = any (p_gems) and user_id = auth.uid()) <> n then raise exception 'unknown gem'; end if;
  select count(distinct (gem_type, rarity)), min(rarity), min(gem_type), max(ilvl) into kinds, rar, kind, il
    from public.player_gems where id = any (p_gems);
  if kinds <> 1 then raise exception 'the gems must be of the same type and rarity'; end if;
  if rar >= 3 then raise exception 'Epic gems cannot be combined'; end if;
  select stat into st from public.player_gems where id = any (p_gems) order by random() limit 1;
  delete from public.player_gems where id = any (p_gems);
  insert into public.player_gems (user_id, gem_type, stat, rarity, ilvl)
  values (auth.uid(), kind, st, rar + 1, il) returning * into g;
  return jsonb_build_object('gem', public.gem_json(g));
end;
$$;

-- Puts a gem in a socket of one of the player's items (p_item, p_socket 0 to rule_sockets() - 1), or takes it out (p_item
-- null). A gem already in that socket goes back to the bag. Returns { "gems" }: the gems whose place changed.
create or replace function public.socket_gem(p_gem uuid, p_item uuid, p_socket int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.player_gems; res jsonb := '[]'; moved uuid[];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into g from public.player_gems where id = p_gem and user_id = auth.uid() for update;
  if not found then raise exception 'unknown gem'; end if;
  if p_item is null then
    update public.player_gems set item = null, socket = null where id = g.id returning * into g;
    return jsonb_build_object('gems', jsonb_build_array(public.gem_json(g)));
  end if;
  if p_socket is null or p_socket < 0 or p_socket >= public.rule_sockets() then raise exception 'no such socket'; end if;
  perform 1 from public.player_items where id = p_item and user_id = auth.uid() for update;
  if not found then raise exception 'unknown item'; end if;
  -- whatever sits there now goes back to the bag
  select coalesce(array_agg(id), '{}') into moved from public.player_gems where item = p_item and socket = p_socket and id <> g.id;
  update public.player_gems set item = null, socket = null where id = any (moved);
  select coalesce(jsonb_agg(public.gem_json(x)), '[]') into res from public.player_gems x where x.id = any (moved);
  update public.player_gems set item = p_item, socket = p_socket where id = g.id returning * into g;
  return jsonb_build_object('gems', res || jsonb_build_array(public.gem_json(g)));
end;
$$;
