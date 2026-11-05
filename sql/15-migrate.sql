-- Existing projects only: bring an older profiles table up to date. Safe to run more than once.
alter table public.profiles add column if not exists talents text[] not null default '{}';
alter table public.profiles add column if not exists levels_cleared int not null default 0;
alter table public.profiles add column if not exists frontier_wave int not null default 0;
alter table public.profiles add column if not exists lineup text[] not null default '{warrior,ranger,mage}';
alter table public.profiles add column if not exists equipment jsonb not null default '{}';

-- Talent rework: the General and per-hero trees became one tree (node ids start with main_). Points in the old trees are
-- refunded, so players allocate them again in the new tree.
update public.profiles p
   set talents = coalesce((select array_agg(x) from unnest(p.talents) as x where x ~ '^main_'), '{}')
 where exists (select 1 from unnest(p.talents) as x where x !~ '^main_');

-- Gear slots: equipment used to be { "hero": "itemId" } (one trinket); now it is { "hero": { "slot": "itemId" } }.
update public.profiles p
   set equipment = (select coalesce(jsonb_object_agg(e.key, case when jsonb_typeof(e.value) = 'string' then jsonb_build_object('trinket', e.value) else e.value end), '{}')
                      from jsonb_each(p.equipment) e)
 where exists (select 1 from jsonb_each(p.equipment) e where jsonb_typeof(e.value) = 'string');
