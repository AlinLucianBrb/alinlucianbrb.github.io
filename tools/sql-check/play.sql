-- Exercise the functions as a signed-in player would (role authenticated), and print what comes back.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
insert into auth.users (id, email, raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111', 'p@x.io', '{"username":"tester1","contact_email":"p@x.io"}') on conflict do nothing;
update public.profiles set levels_cleared = 0 where id = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false) \gset
select public.start_run(1) as run \gset
reset role;
update public.runs set started_at = now() - interval '2 hours' where id = :'run';
set role authenticated;
select 'claim 2 bosses on level 1' as test; select public.finish_run(:'run', 15, 100, true, 2);
select 'win without the boss' as test; select public.finish_run(:'run', 15, 100, true, 0);
select 'win with the boss' as test; select jsonb_pretty(public.finish_run(:'run', 15, 100, true, 1) -> 'drops');
reset role;
select 'items' as test; select item_type, rarity, cardinality(bonuses) as n, bonuses from public.player_items order by created_at;
select 'bonus count within rarity rules' as test, bool_and(cardinality(bonuses) between rarity + 1 and 4) as ok, bool_and(cardinality(bonuses) = cardinality(array(select distinct unnest(bonuses)))) as distinct_ok from public.player_items where cardinality(bonuses) > 0;
select i.id as any_item, t.slot as any_slot from public.player_items i join public.item_types t on t.id = i.item_type limit 1 \gset
set role authenticated;
select 'save gear in its slot' as test; select (public.save_loadout(array['warrior','mage'], jsonb_build_object('warrior', jsonb_build_object(:'any_slot', :'any_item')))).equipment;
select 'wrong slot' as test; select public.save_loadout(array['warrior'], jsonb_build_object('warrior', jsonb_build_object('nowhere', :'any_item')));
select 'old flat format' as test; select public.save_loadout(array['warrior'], jsonb_build_object('warrior', :'any_item'));
select 'same item twice' as test; select public.save_loadout(array['warrior','mage'], jsonb_build_object('warrior', jsonb_build_object(:'any_slot', :'any_item'), 'mage', jsonb_build_object(:'any_slot', :'any_item')));
select 'players cannot read the bonus table' as test; select count(*) from public.item_bonuses;
reset role;
select 'bonus table rows' as test, count(*) from public.item_bonuses;
