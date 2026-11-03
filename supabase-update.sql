-- Test TBD: update for an existing database. Run once in Supabase (SQL Editor > New query > paste > Run).
-- Safe to run more than once. Adds: talents, levels, run records, talent checks, username rules, tighter permissions.
-- It does NOT delete anything. To remove the old prototype tables, see supabase-cleanup-old-prototypes.sql.

alter table public.profiles add column if not exists talents text[] not null default '{}';
alter table public.profiles add column if not exists levels_cleared int not null default 0;
alter table public.profiles add column if not exists frontier_wave int not null default 0;

-- ===== Username rules: reserved and blocked names =====
create table if not exists public.blocked_names (
  term text primary key,
  mode text not null check (mode in ('exact', 'contains'))
);
alter table public.blocked_names enable row level security;   -- no policies: players cannot read or change it
-- Starter list. Add rows to block more. Terms are matched after swapping 0/1/i look-alikes (0->o, 1->l, i->l).
insert into public.blocked_names (term, mode) values
  ('admin', 'exact'), ('administrator', 'exact'), ('moderator', 'exact'), ('mod', 'exact'), ('support', 'exact'),
  ('system', 'exact'), ('staff', 'exact'), ('owner', 'exact'), ('root', 'exact'), ('official', 'exact'),
  ('anonymous', 'exact'), ('guest', 'exact'), ('null', 'exact'), ('undefined', 'exact'), ('gamemaster', 'exact'),
  ('developer', 'exact'), ('server', 'exact'), ('testtbd', 'exact'),
  ('fuck', 'contains'), ('shit', 'contains'), ('cunt', 'contains'), ('bitch', 'contains'), ('nigger', 'contains'),
  ('nigga', 'contains'), ('faggot', 'contains'), ('whore', 'contains'), ('hitler', 'contains'), ('nazi', 'contains')
on conflict (term) do nothing;

-- ===== Talent trees (so the server can check talent saves) =====
create table if not exists public.talent_nodes (
  id text primary key,
  tree text not null,
  is_root boolean not null default false
);
create table if not exists public.talent_links (
  a text not null references public.talent_nodes (id) on delete cascade,
  b text not null references public.talent_nodes (id) on delete cascade,
  primary key (a, b)
);
alter table public.talent_nodes enable row level security;
alter table public.talent_links enable row level security;
-- Talent trees (generated from js/content/talents.js by tools/generate-talent-sql.mjs). Links are stored in both directions.
delete from public.talent_links;
insert into public.talent_nodes (id, tree, is_root) values
  ('general_root', 'general', true),
  ('general_0_0', 'general', false),
  ('general_0_1', 'general', false),
  ('general_0_2', 'general', false),
  ('general_0_3', 'general', false),
  ('general_1_0', 'general', false),
  ('general_1_1', 'general', false),
  ('general_1_2', 'general', false),
  ('general_1_3', 'general', false),
  ('general_2_0', 'general', false),
  ('general_2_1', 'general', false),
  ('general_2_2', 'general', false),
  ('general_2_3', 'general', false),
  ('general_3_0', 'general', false),
  ('general_3_1', 'general', false),
  ('general_3_2', 'general', false),
  ('general_3_3', 'general', false),
  ('general_4_0', 'general', false),
  ('general_4_1', 'general', false),
  ('general_4_2', 'general', false),
  ('general_4_3', 'general', false),
  ('warrior_root', 'warrior', true),
  ('warrior_0_0', 'warrior', false),
  ('warrior_0_1', 'warrior', false),
  ('warrior_0_2', 'warrior', false),
  ('warrior_0_3', 'warrior', false),
  ('warrior_1_0', 'warrior', false),
  ('warrior_1_1', 'warrior', false),
  ('warrior_1_2', 'warrior', false),
  ('warrior_1_3', 'warrior', false),
  ('warrior_2_0', 'warrior', false),
  ('warrior_2_1', 'warrior', false),
  ('warrior_2_2', 'warrior', false),
  ('warrior_2_3', 'warrior', false),
  ('archer_root', 'archer', true),
  ('archer_0_0', 'archer', false),
  ('archer_0_1', 'archer', false),
  ('archer_0_2', 'archer', false),
  ('archer_0_3', 'archer', false),
  ('archer_1_0', 'archer', false),
  ('archer_1_1', 'archer', false),
  ('archer_1_2', 'archer', false),
  ('archer_1_3', 'archer', false),
  ('archer_2_0', 'archer', false),
  ('archer_2_1', 'archer', false),
  ('archer_2_2', 'archer', false),
  ('archer_2_3', 'archer', false),
  ('thief_root', 'thief', true),
  ('thief_0_0', 'thief', false),
  ('thief_0_1', 'thief', false),
  ('thief_0_2', 'thief', false),
  ('thief_0_3', 'thief', false),
  ('thief_1_0', 'thief', false),
  ('thief_1_1', 'thief', false),
  ('thief_1_2', 'thief', false),
  ('thief_1_3', 'thief', false),
  ('thief_2_0', 'thief', false),
  ('thief_2_1', 'thief', false),
  ('thief_2_2', 'thief', false),
  ('thief_2_3', 'thief', false),
  ('frostmage_root', 'frostmage', true),
  ('frostmage_0_0', 'frostmage', false),
  ('frostmage_0_1', 'frostmage', false),
  ('frostmage_0_2', 'frostmage', false),
  ('frostmage_0_3', 'frostmage', false),
  ('frostmage_1_0', 'frostmage', false),
  ('frostmage_1_1', 'frostmage', false),
  ('frostmage_1_2', 'frostmage', false),
  ('frostmage_1_3', 'frostmage', false),
  ('frostmage_2_0', 'frostmage', false),
  ('frostmage_2_1', 'frostmage', false),
  ('frostmage_2_2', 'frostmage', false),
  ('frostmage_2_3', 'frostmage', false),
  ('firemage_root', 'firemage', true),
  ('firemage_0_0', 'firemage', false),
  ('firemage_0_1', 'firemage', false),
  ('firemage_0_2', 'firemage', false),
  ('firemage_0_3', 'firemage', false),
  ('firemage_1_0', 'firemage', false),
  ('firemage_1_1', 'firemage', false),
  ('firemage_1_2', 'firemage', false),
  ('firemage_1_3', 'firemage', false),
  ('firemage_2_0', 'firemage', false),
  ('firemage_2_1', 'firemage', false),
  ('firemage_2_2', 'firemage', false),
  ('firemage_2_3', 'firemage', false),
  ('lightningmage_root', 'lightningmage', true),
  ('lightningmage_0_0', 'lightningmage', false),
  ('lightningmage_0_1', 'lightningmage', false),
  ('lightningmage_0_2', 'lightningmage', false),
  ('lightningmage_0_3', 'lightningmage', false),
  ('lightningmage_1_0', 'lightningmage', false),
  ('lightningmage_1_1', 'lightningmage', false),
  ('lightningmage_1_2', 'lightningmage', false),
  ('lightningmage_1_3', 'lightningmage', false),
  ('lightningmage_2_0', 'lightningmage', false),
  ('lightningmage_2_1', 'lightningmage', false),
  ('lightningmage_2_2', 'lightningmage', false),
  ('lightningmage_2_3', 'lightningmage', false)
on conflict (id) do update set tree = excluded.tree, is_root = excluded.is_root;
delete from public.talent_nodes where id <> all (array['general_root', 'general_0_0', 'general_0_1', 'general_0_2', 'general_0_3', 'general_1_0', 'general_1_1', 'general_1_2', 'general_1_3', 'general_2_0', 'general_2_1', 'general_2_2', 'general_2_3', 'general_3_0', 'general_3_1', 'general_3_2', 'general_3_3', 'general_4_0', 'general_4_1', 'general_4_2', 'general_4_3', 'warrior_root', 'warrior_0_0', 'warrior_0_1', 'warrior_0_2', 'warrior_0_3', 'warrior_1_0', 'warrior_1_1', 'warrior_1_2', 'warrior_1_3', 'warrior_2_0', 'warrior_2_1', 'warrior_2_2', 'warrior_2_3', 'archer_root', 'archer_0_0', 'archer_0_1', 'archer_0_2', 'archer_0_3', 'archer_1_0', 'archer_1_1', 'archer_1_2', 'archer_1_3', 'archer_2_0', 'archer_2_1', 'archer_2_2', 'archer_2_3', 'thief_root', 'thief_0_0', 'thief_0_1', 'thief_0_2', 'thief_0_3', 'thief_1_0', 'thief_1_1', 'thief_1_2', 'thief_1_3', 'thief_2_0', 'thief_2_1', 'thief_2_2', 'thief_2_3', 'frostmage_root', 'frostmage_0_0', 'frostmage_0_1', 'frostmage_0_2', 'frostmage_0_3', 'frostmage_1_0', 'frostmage_1_1', 'frostmage_1_2', 'frostmage_1_3', 'frostmage_2_0', 'frostmage_2_1', 'frostmage_2_2', 'frostmage_2_3', 'firemage_root', 'firemage_0_0', 'firemage_0_1', 'firemage_0_2', 'firemage_0_3', 'firemage_1_0', 'firemage_1_1', 'firemage_1_2', 'firemage_1_3', 'firemage_2_0', 'firemage_2_1', 'firemage_2_2', 'firemage_2_3', 'lightningmage_root', 'lightningmage_0_0', 'lightningmage_0_1', 'lightningmage_0_2', 'lightningmage_0_3', 'lightningmage_1_0', 'lightningmage_1_1', 'lightningmage_1_2', 'lightningmage_1_3', 'lightningmage_2_0', 'lightningmage_2_1', 'lightningmage_2_2', 'lightningmage_2_3']);
insert into public.talent_links (a, b) values
  ('general_root', 'general_0_0'),
  ('general_0_0', 'general_root'),
  ('general_0_0', 'general_0_1'),
  ('general_0_1', 'general_0_0'),
  ('general_0_1', 'general_0_2'),
  ('general_0_2', 'general_0_1'),
  ('general_0_2', 'general_0_3'),
  ('general_0_3', 'general_0_2'),
  ('general_root', 'general_1_0'),
  ('general_1_0', 'general_root'),
  ('general_1_0', 'general_1_1'),
  ('general_1_1', 'general_1_0'),
  ('general_1_1', 'general_1_2'),
  ('general_1_2', 'general_1_1'),
  ('general_1_2', 'general_1_3'),
  ('general_1_3', 'general_1_2'),
  ('general_root', 'general_2_0'),
  ('general_2_0', 'general_root'),
  ('general_2_0', 'general_2_1'),
  ('general_2_1', 'general_2_0'),
  ('general_2_1', 'general_2_2'),
  ('general_2_2', 'general_2_1'),
  ('general_2_2', 'general_2_3'),
  ('general_2_3', 'general_2_2'),
  ('general_root', 'general_3_0'),
  ('general_3_0', 'general_root'),
  ('general_3_0', 'general_3_1'),
  ('general_3_1', 'general_3_0'),
  ('general_3_1', 'general_3_2'),
  ('general_3_2', 'general_3_1'),
  ('general_3_2', 'general_3_3'),
  ('general_3_3', 'general_3_2'),
  ('general_root', 'general_4_0'),
  ('general_4_0', 'general_root'),
  ('general_4_0', 'general_4_1'),
  ('general_4_1', 'general_4_0'),
  ('general_4_1', 'general_4_2'),
  ('general_4_2', 'general_4_1'),
  ('general_4_2', 'general_4_3'),
  ('general_4_3', 'general_4_2'),
  ('general_0_1', 'general_1_1'),
  ('general_1_1', 'general_0_1'),
  ('general_1_1', 'general_2_1'),
  ('general_2_1', 'general_1_1'),
  ('general_2_1', 'general_3_1'),
  ('general_3_1', 'general_2_1'),
  ('general_3_1', 'general_4_1'),
  ('general_4_1', 'general_3_1'),
  ('general_4_1', 'general_0_1'),
  ('general_0_1', 'general_4_1'),
  ('warrior_root', 'warrior_0_0'),
  ('warrior_0_0', 'warrior_root'),
  ('warrior_0_0', 'warrior_0_1'),
  ('warrior_0_1', 'warrior_0_0'),
  ('warrior_0_1', 'warrior_0_2'),
  ('warrior_0_2', 'warrior_0_1'),
  ('warrior_0_2', 'warrior_0_3'),
  ('warrior_0_3', 'warrior_0_2'),
  ('warrior_root', 'warrior_1_0'),
  ('warrior_1_0', 'warrior_root'),
  ('warrior_1_0', 'warrior_1_1'),
  ('warrior_1_1', 'warrior_1_0'),
  ('warrior_1_1', 'warrior_1_2'),
  ('warrior_1_2', 'warrior_1_1'),
  ('warrior_1_2', 'warrior_1_3'),
  ('warrior_1_3', 'warrior_1_2'),
  ('warrior_root', 'warrior_2_0'),
  ('warrior_2_0', 'warrior_root'),
  ('warrior_2_0', 'warrior_2_1'),
  ('warrior_2_1', 'warrior_2_0'),
  ('warrior_2_1', 'warrior_2_2'),
  ('warrior_2_2', 'warrior_2_1'),
  ('warrior_2_2', 'warrior_2_3'),
  ('warrior_2_3', 'warrior_2_2'),
  ('warrior_0_1', 'warrior_1_1'),
  ('warrior_1_1', 'warrior_0_1'),
  ('warrior_1_1', 'warrior_2_1'),
  ('warrior_2_1', 'warrior_1_1'),
  ('warrior_2_1', 'warrior_0_1'),
  ('warrior_0_1', 'warrior_2_1'),
  ('archer_root', 'archer_0_0'),
  ('archer_0_0', 'archer_root'),
  ('archer_0_0', 'archer_0_1'),
  ('archer_0_1', 'archer_0_0'),
  ('archer_0_1', 'archer_0_2'),
  ('archer_0_2', 'archer_0_1'),
  ('archer_0_2', 'archer_0_3'),
  ('archer_0_3', 'archer_0_2'),
  ('archer_root', 'archer_1_0'),
  ('archer_1_0', 'archer_root'),
  ('archer_1_0', 'archer_1_1'),
  ('archer_1_1', 'archer_1_0'),
  ('archer_1_1', 'archer_1_2'),
  ('archer_1_2', 'archer_1_1'),
  ('archer_1_2', 'archer_1_3'),
  ('archer_1_3', 'archer_1_2'),
  ('archer_root', 'archer_2_0'),
  ('archer_2_0', 'archer_root'),
  ('archer_2_0', 'archer_2_1'),
  ('archer_2_1', 'archer_2_0'),
  ('archer_2_1', 'archer_2_2'),
  ('archer_2_2', 'archer_2_1'),
  ('archer_2_2', 'archer_2_3'),
  ('archer_2_3', 'archer_2_2'),
  ('archer_0_1', 'archer_1_1'),
  ('archer_1_1', 'archer_0_1'),
  ('archer_1_1', 'archer_2_1'),
  ('archer_2_1', 'archer_1_1'),
  ('archer_2_1', 'archer_0_1'),
  ('archer_0_1', 'archer_2_1'),
  ('thief_root', 'thief_0_0'),
  ('thief_0_0', 'thief_root'),
  ('thief_0_0', 'thief_0_1'),
  ('thief_0_1', 'thief_0_0'),
  ('thief_0_1', 'thief_0_2'),
  ('thief_0_2', 'thief_0_1'),
  ('thief_0_2', 'thief_0_3'),
  ('thief_0_3', 'thief_0_2'),
  ('thief_root', 'thief_1_0'),
  ('thief_1_0', 'thief_root'),
  ('thief_1_0', 'thief_1_1'),
  ('thief_1_1', 'thief_1_0'),
  ('thief_1_1', 'thief_1_2'),
  ('thief_1_2', 'thief_1_1'),
  ('thief_1_2', 'thief_1_3'),
  ('thief_1_3', 'thief_1_2'),
  ('thief_root', 'thief_2_0'),
  ('thief_2_0', 'thief_root'),
  ('thief_2_0', 'thief_2_1'),
  ('thief_2_1', 'thief_2_0'),
  ('thief_2_1', 'thief_2_2'),
  ('thief_2_2', 'thief_2_1'),
  ('thief_2_2', 'thief_2_3'),
  ('thief_2_3', 'thief_2_2'),
  ('thief_0_1', 'thief_1_1'),
  ('thief_1_1', 'thief_0_1'),
  ('thief_1_1', 'thief_2_1'),
  ('thief_2_1', 'thief_1_1'),
  ('thief_2_1', 'thief_0_1'),
  ('thief_0_1', 'thief_2_1'),
  ('frostmage_root', 'frostmage_0_0'),
  ('frostmage_0_0', 'frostmage_root'),
  ('frostmage_0_0', 'frostmage_0_1'),
  ('frostmage_0_1', 'frostmage_0_0'),
  ('frostmage_0_1', 'frostmage_0_2'),
  ('frostmage_0_2', 'frostmage_0_1'),
  ('frostmage_0_2', 'frostmage_0_3'),
  ('frostmage_0_3', 'frostmage_0_2'),
  ('frostmage_root', 'frostmage_1_0'),
  ('frostmage_1_0', 'frostmage_root'),
  ('frostmage_1_0', 'frostmage_1_1'),
  ('frostmage_1_1', 'frostmage_1_0'),
  ('frostmage_1_1', 'frostmage_1_2'),
  ('frostmage_1_2', 'frostmage_1_1'),
  ('frostmage_1_2', 'frostmage_1_3'),
  ('frostmage_1_3', 'frostmage_1_2'),
  ('frostmage_root', 'frostmage_2_0'),
  ('frostmage_2_0', 'frostmage_root'),
  ('frostmage_2_0', 'frostmage_2_1'),
  ('frostmage_2_1', 'frostmage_2_0'),
  ('frostmage_2_1', 'frostmage_2_2'),
  ('frostmage_2_2', 'frostmage_2_1'),
  ('frostmage_2_2', 'frostmage_2_3'),
  ('frostmage_2_3', 'frostmage_2_2'),
  ('frostmage_0_1', 'frostmage_1_1'),
  ('frostmage_1_1', 'frostmage_0_1'),
  ('frostmage_1_1', 'frostmage_2_1'),
  ('frostmage_2_1', 'frostmage_1_1'),
  ('frostmage_2_1', 'frostmage_0_1'),
  ('frostmage_0_1', 'frostmage_2_1'),
  ('firemage_root', 'firemage_0_0'),
  ('firemage_0_0', 'firemage_root'),
  ('firemage_0_0', 'firemage_0_1'),
  ('firemage_0_1', 'firemage_0_0'),
  ('firemage_0_1', 'firemage_0_2'),
  ('firemage_0_2', 'firemage_0_1'),
  ('firemage_0_2', 'firemage_0_3'),
  ('firemage_0_3', 'firemage_0_2'),
  ('firemage_root', 'firemage_1_0'),
  ('firemage_1_0', 'firemage_root'),
  ('firemage_1_0', 'firemage_1_1'),
  ('firemage_1_1', 'firemage_1_0'),
  ('firemage_1_1', 'firemage_1_2'),
  ('firemage_1_2', 'firemage_1_1'),
  ('firemage_1_2', 'firemage_1_3'),
  ('firemage_1_3', 'firemage_1_2'),
  ('firemage_root', 'firemage_2_0'),
  ('firemage_2_0', 'firemage_root'),
  ('firemage_2_0', 'firemage_2_1'),
  ('firemage_2_1', 'firemage_2_0'),
  ('firemage_2_1', 'firemage_2_2'),
  ('firemage_2_2', 'firemage_2_1'),
  ('firemage_2_2', 'firemage_2_3'),
  ('firemage_2_3', 'firemage_2_2'),
  ('firemage_0_1', 'firemage_1_1'),
  ('firemage_1_1', 'firemage_0_1'),
  ('firemage_1_1', 'firemage_2_1'),
  ('firemage_2_1', 'firemage_1_1'),
  ('firemage_2_1', 'firemage_0_1'),
  ('firemage_0_1', 'firemage_2_1'),
  ('lightningmage_root', 'lightningmage_0_0'),
  ('lightningmage_0_0', 'lightningmage_root'),
  ('lightningmage_0_0', 'lightningmage_0_1'),
  ('lightningmage_0_1', 'lightningmage_0_0'),
  ('lightningmage_0_1', 'lightningmage_0_2'),
  ('lightningmage_0_2', 'lightningmage_0_1'),
  ('lightningmage_0_2', 'lightningmage_0_3'),
  ('lightningmage_0_3', 'lightningmage_0_2'),
  ('lightningmage_root', 'lightningmage_1_0'),
  ('lightningmage_1_0', 'lightningmage_root'),
  ('lightningmage_1_0', 'lightningmage_1_1'),
  ('lightningmage_1_1', 'lightningmage_1_0'),
  ('lightningmage_1_1', 'lightningmage_1_2'),
  ('lightningmage_1_2', 'lightningmage_1_1'),
  ('lightningmage_1_2', 'lightningmage_1_3'),
  ('lightningmage_1_3', 'lightningmage_1_2'),
  ('lightningmage_root', 'lightningmage_2_0'),
  ('lightningmage_2_0', 'lightningmage_root'),
  ('lightningmage_2_0', 'lightningmage_2_1'),
  ('lightningmage_2_1', 'lightningmage_2_0'),
  ('lightningmage_2_1', 'lightningmage_2_2'),
  ('lightningmage_2_2', 'lightningmage_2_1'),
  ('lightningmage_2_2', 'lightningmage_2_3'),
  ('lightningmage_2_3', 'lightningmage_2_2'),
  ('lightningmage_0_1', 'lightningmage_1_1'),
  ('lightningmage_1_1', 'lightningmage_0_1'),
  ('lightningmage_1_1', 'lightningmage_2_1'),
  ('lightningmage_2_1', 'lightningmage_1_1'),
  ('lightningmage_2_1', 'lightningmage_0_1'),
  ('lightningmage_0_1', 'lightningmage_2_1');

-- ===== Run records: every saved run must come from a run the server saw start =====
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stage int not null check (stage between 1 and 5),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists runs_user_idx on public.runs (user_id, finished_at);
alter table public.runs enable row level security;

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
  insert into public.runs (user_id, stage) values (auth.uid(), p_stage) returning id into rid;
  return rid;
end;
$$;

-- Called when a run ends. Five levels: 15, 20, 25, 30 and 35 waves; a level unlocks when the one before it is cleared.
-- The run must have been started on the server, be long enough to be real, and at most 30 runs per hour are saved.
drop function if exists public.finish_run(int, int);
drop function if exists public.finish_run(int, int, int, boolean);
drop function if exists public.finish_run(uuid, int, int, boolean);
create function public.finish_run(p_run uuid, p_waves int, p_kills int, p_won boolean) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.runs; cap int; frontier boolean; elapsed numeric; done_waves int;
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
  return me;
end;
$$;

-- ===== Permissions: only what the game needs =====
revoke all on function public.signup_check(text, text) from public, anon, authenticated;
grant execute on function public.signup_check(text, text) to anon, authenticated;
revoke all on function public.get_leaderboard(int) from public, anon, authenticated;
grant execute on function public.get_leaderboard(int) to anon, authenticated;
revoke all on function public.start_run(int) from public, anon, authenticated;
grant execute on function public.start_run(int) to authenticated;
revoke all on function public.finish_run(uuid, int, int, boolean) from public, anon, authenticated;
grant execute on function public.finish_run(uuid, int, int, boolean) to authenticated;
revoke all on function public.save_talents(text[]) from public, anon, authenticated;
grant execute on function public.save_talents(text[]) to authenticated;
-- Internal helpers: only other database functions use them.
revoke all on function public.username_problem(text) from public, anon, authenticated;
revoke all on function public.min_run_seconds(int) from public, anon, authenticated;
-- These tables are private. With row security on and no policies, players cannot read or write them directly.
revoke all on table public.runs, public.talent_nodes, public.talent_links, public.blocked_names from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
