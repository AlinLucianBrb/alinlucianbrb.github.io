-- Existing projects only: bring an older profiles table up to date. Safe to run more than once.
alter table public.profiles add column if not exists talents text[] not null default '{}';
alter table public.profiles add column if not exists levels_cleared int not null default 0;
alter table public.profiles add column if not exists frontier_wave int not null default 0;
alter table public.profiles add column if not exists lineup text[] not null default '{warrior,ranger,mage}';
alter table public.profiles add column if not exists equipment jsonb not null default '{}';

-- Heroes rework: the Archer tree became the Ranger tree and the Frost Mage tree became the Mage tree (same layout, so
-- allocated points carry over). Trees of heroes that are no longer playable are refunded.
update public.profiles p
   set talents = coalesce((
     select array_agg(distinct regexp_replace(regexp_replace(x, '^archer_', 'ranger_'), '^frostmage_', 'mage_'))
       from unnest(p.talents) as x
      where x !~ '^(thief|firemage|lightningmage)_'), '{}')
 where exists (select 1 from unnest(p.talents) as x where x ~ '^(archer|frostmage|thief|firemage|lightningmage)_');
