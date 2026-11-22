-- ===== Disenchanting and crafting (the numbers are the rule_* functions, generated from js/content/crafting.js) =====
-- profiles.materials holds how many of each material a player has, by rarity: {Scrap, Dust, Essence, Core}.

-- Whether a feature is unlocked for a player (it unlocks on reaching its act).
create or replace function public.require_unlock(p_feature text, p_cleared int) returns void
language plpgsql set search_path = public as $$
begin
  if p_cleared < public.rule_unlock(p_feature) then raise exception '% is not unlocked yet', p_feature; end if;
end;
$$;

-- Breaks items down into materials: rule_disenchant_yield() of each item's rarity. All must be the player's and none worn.
create or replace function public.disenchant_items(p_items uuid[]) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles; n int; got int[]; y int := public.rule_disenchant_yield();
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  n := coalesce(array_length(p_items, 1), 0);
  if n < 1 or n > public.rule_max_items() then raise exception 'choose at least one item'; end if;
  if (select count(distinct x) from unnest(p_items) x) <> n then raise exception 'each item only once'; end if;
  perform 1 from public.player_items where id = any (p_items) and user_id = auth.uid() order by id for update;
  if (select count(*) from public.player_items where id = any (p_items) and user_id = auth.uid()) <> n then raise exception 'unknown item'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  perform public.require_unlock('crafting', me.levels_cleared);
  if exists (select 1 from jsonb_each(coalesce(me.equipment, '{}'::jsonb)) h,
                  jsonb_each_text(case when jsonb_typeof(h.value) = 'object' then h.value else jsonb_build_object('trinket', h.value) end) s
              where s.value in (select x::text from unnest(p_items) x)) then
    raise exception 'take the item off before disenchanting it';
  end if;
  select array[count(*) filter (where rarity = 0), count(*) filter (where rarity = 1), count(*) filter (where rarity = 2), count(*) filter (where rarity = 3)]::int[]
    into got from public.player_items where id = any (p_items) and user_id = auth.uid();
  delete from public.player_items where id = any (p_items) and user_id = auth.uid();
  update public.profiles
     set materials = array[materials[1] + y * got[1], materials[2] + y * got[2], materials[3] + y * got[3], materials[4] + y * got[4]]
   where id = auth.uid() returning * into me;
  return me;
end;
$$;

-- Turns rule_convert_cost() of a material into one of the next, p_times times. p_rarity is the one given (0 to 2).
create or replace function public.convert_material(p_rarity int, p_times int default 1) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles; need int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_rarity is null or p_rarity < 0 or p_rarity > 2 or p_times is null or p_times < 1 or p_times > 1000 then raise exception 'bad conversion'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  perform public.require_unlock('crafting', me.levels_cleared);
  need := public.rule_convert_cost() * p_times;
  if me.materials[p_rarity + 1] < need then raise exception 'not enough materials'; end if;
  me.materials[p_rarity + 1] := me.materials[p_rarity + 1] - need;
  me.materials[p_rarity + 2] := me.materials[p_rarity + 2] + p_times;
  update public.profiles set materials = me.materials where id = auth.uid() returning * into me;
  return me;
end;
$$;

-- Makes an item of a rarity, slot and kind (p_affinity: an archetype, or null for a general item). The bonuses are rolled like a
-- drop's (roll_item). Returns { "profile", "item" }.
create or replace function public.craft_item(p_rarity int, p_slot text, p_affinity text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; it public.player_items; kind text; price int; b_extra numeric;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_rarity is null or p_rarity < 0 or p_rarity > 3 then raise exception 'bad rarity'; end if;
  select id into kind from public.item_types where droppable and slot = p_slot and affinity is not distinct from p_affinity order by id limit 1;
  if kind is null then raise exception 'unknown item type'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  perform public.require_unlock('crafting', me.levels_cleared);
  if (select count(*) from public.player_items where user_id = auth.uid()) >= public.rule_max_items() then raise exception 'your inventory is full'; end if;
  if me.materials[p_rarity + 1] < public.rule_craft_cost() then raise exception 'not enough materials'; end if;
  price := public.rule_craft_gold(p_rarity);
  if me.gold < price then raise exception 'not enough gold'; end if;
  select coalesce(sum(t.reward_extra), 0) into b_extra from public.talent_nodes t where t.id = any (me.talents);
  me.materials[p_rarity + 1] := me.materials[p_rarity + 1] - public.rule_craft_cost();
  update public.profiles set materials = me.materials, gold = gold - price where id = auth.uid() returning * into me;
  it := public.roll_item(auth.uid(), kind, p_affinity, p_rarity, public.rule_item_level(me.levels_cleared), b_extra);
  return jsonb_build_object('profile', to_jsonb(me), 'item', jsonb_build_object('id', it.id, 'item_type', it.item_type, 'rarity', it.rarity,
    'bonuses', to_jsonb(it.bonuses), 'bonus_ranks', to_jsonb(it.bonus_ranks), 'ilvl', it.ilvl, 'created_at', it.created_at));
end;
$$;
