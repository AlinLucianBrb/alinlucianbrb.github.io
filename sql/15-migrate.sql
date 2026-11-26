-- Existing projects only: bring an older profiles table up to date. Safe to run more than once.
alter table public.profiles add column if not exists talents text[] not null default '{}';
alter table public.profiles add column if not exists levels_cleared int not null default 0;
alter table public.profiles add column if not exists frontier_wave int not null default 0;
alter table public.profiles add column if not exists lineup text[] not null default '{warrior,ranger,mage}';
alter table public.profiles add column if not exists equipment jsonb not null default '{}';
alter table public.profiles add column if not exists endless_wave int not null default 0;
alter table public.profiles add column if not exists paths jsonb not null default '{}';
alter table public.profiles add column if not exists materials int[] not null default '{0,0,0,0}';   -- crafting materials by rarity: Scrap, Dust, Essence, Core
alter table public.profiles add column if not exists stones int not null default 0;   -- Rough Stone, for crafting gems
alter table public.profiles add column if not exists title text;   -- an achievement title worn by the name

-- Talent reworks: 20 tracks of 5 talents taken in order, one point per level up to level 100; 12 combat tracks by type and
-- 8 quality-of-life ones, each ending in a unique effect (ids start with t6_). Points spent in any older tree are refunded.
update public.profiles p
   set talents = coalesce((select array_agg(x) from unnest(p.talents) as x where x ~ '^t6_'), '{}')
 where exists (select 1 from unnest(p.talents) as x where x !~ '^t6_');

-- Gear slots: equipment used to be { "hero": "itemId" } (one trinket); now it is { "hero": { "slot": "itemId" } }.
update public.profiles p
   set equipment = (select coalesce(jsonb_object_agg(e.key, case when jsonb_typeof(e.value) = 'string' then jsonb_build_object('trinket', e.value) else e.value end), '{}')
                      from jsonb_each(p.equipment) e)
 where exists (select 1 from jsonb_each(p.equipment) e where jsonb_typeof(e.value) = 'string');
