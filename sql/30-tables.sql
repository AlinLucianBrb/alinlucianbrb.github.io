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
alter table public.runs add column if not exists loadout jsonb;   -- the lineup and equipment a run started with (for future checks)

-- ===== Heroes and items (so the server can check lineups and equipment) =====
create table if not exists public.hero_classes (
  id text primary key
);
create table if not exists public.item_types (
  id text primary key,
  slot text not null,
  droppable boolean not null default true
);
-- Every item a player owns. Items are created only by finish_run (drops) and are never edited by players directly.
create table if not exists public.player_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null references public.item_types (id),
  created_at timestamptz not null default now()
);
create index if not exists player_items_user_idx on public.player_items (user_id);
alter table public.hero_classes enable row level security;
alter table public.item_types enable row level security;
alter table public.player_items enable row level security;
drop policy if exists "read own items" on public.player_items;
create policy "read own items" on public.player_items
  for select to authenticated using (auth.uid() = user_id);
