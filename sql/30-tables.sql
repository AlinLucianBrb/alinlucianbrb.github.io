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
-- Reward bonuses a node gives at the end of a match (0.1 = +10%), used by finish_run.
alter table public.talent_nodes add column if not exists reward_gold numeric not null default 0;
alter table public.talent_nodes add column if not exists reward_xp numeric not null default 0;
alter table public.talent_nodes add column if not exists reward_loot numeric not null default 0;
-- Treasure Hunter talents: item rarity luck (like relic luck) and the extra chance of each further item bonus.
alter table public.talent_nodes add column if not exists reward_rarity numeric not null default 0;
alter table public.talent_nodes add column if not exists reward_extra numeric not null default 0;
alter table public.talent_nodes enable row level security;
alter table public.talent_links enable row level security;

-- ===== Run records: every saved run must come from a run the server saw start =====
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stage int not null check (stage >= 1),   -- start_run checks the upper end against rule_stage_count()
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists runs_user_idx on public.runs (user_id, finished_at);
alter table public.runs enable row level security;
-- Zones (Nov 12): 25 levels, not 5. Older projects had "stage between 1 and 5" on this table; the upper end is now
-- checked by start_run against rule_stage_count(), so the table only needs a level of at least 1.
alter table public.runs drop constraint if exists runs_stage_check;
alter table public.runs add constraint runs_stage_check check (stage >= 1);
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
-- Rarity (0 Common, 1 Uncommon, 2 Rare, 3 Epic) and bonuses (relic names, no repeats, at most 4), rolled by finish_run.
-- Items from before this existed stay Common with no bonuses.
alter table public.player_items add column if not exists rarity int not null default 0 check (rarity between 0 and 3);
alter table public.player_items add column if not exists bonuses text[] not null default '{}';
-- Each bonus's rank (1 to 4), in the same order as bonuses. Items from before ranks have none: each bonus counts at the
-- item's rarity (rank = rarity + 1).
alter table public.player_items add column if not exists bonus_ranks int[] not null default '{}';
-- Item level (Nov 12): 3 x the level beaten when it dropped (on a loss, the level below); its stats count 0.5 + 0.05 x ilvl times.
-- Items from before item levels get 10, which keeps their values as they were.
alter table public.player_items add column if not exists ilvl int not null default 10 check (ilvl >= 1);
-- The relics an item bonus can be (generated from js/content/items.js).
create table if not exists public.item_bonuses (
  id text primary key
);
-- The archetypes whose items lean toward this bonus (melee, projectile, spell, minion), and the archetype of an item type
-- (null: no leaning). Generated from js/content/items.js (AFFINITY, ITEMS).
alter table public.item_bonuses add column if not exists tags text[] not null default '{}';
alter table public.item_types add column if not exists affinity text;
alter table public.item_bonuses enable row level security;
alter table public.hero_classes enable row level security;
alter table public.item_types enable row level security;
alter table public.player_items enable row level security;
drop policy if exists "read own items" on public.player_items;
create policy "read own items" on public.player_items
  for select to authenticated using (auth.uid() = user_id);

-- ===== Co-op: lobbies, their members, and records for each number of players =====
-- A run remembers how many played it (1 solo, 2 to 4 co-op) and the lobby it came from.
alter table public.runs add column if not exists players int not null default 1;
alter table public.runs add column if not exists lobby uuid;
-- A lobby: a 5-character name (letters and numbers), public or private (a password, stored salted and hashed), the level
-- the host picked, and once the host starts it, the match every member plays (config: seed, level, each player's heroes).
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name ~ '^[A-Z0-9]{5}$'),
  host uuid not null references auth.users (id) on delete cascade,
  is_private boolean not null default false,
  pass_salt text,
  pass_hash text,
  stage int not null default 1,
  status text not null default 'open' check (status in ('open', 'playing', 'closed')),
  config jsonb,
  players int,
  created_at timestamptz not null default now(),
  started_at timestamptz
);
-- Who is in a lobby, in which slot (0 to 3). seen_at is refreshed while their lobby screen is open; members not seen for
-- 45 seconds are dropped.
create table if not exists public.lobby_members (
  lobby uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot int not null check (slot >= 0),
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  primary key (lobby, user_id),
  unique (lobby, slot)
);
create index if not exists lobby_members_user_idx on public.lobby_members (user_id);
-- The leaderboard for each mode (players: 1 solo, 2, 3 or 4): the highest level cleared, and the best wave on the next one.
create table if not exists public.records (
  user_id uuid not null references auth.users (id) on delete cascade,
  players int not null check (players between 1 and 4),
  levels_cleared int not null default 0,
  frontier_wave int not null default 0,
  runs int not null default 0,
  primary key (user_id, players)
);
create index if not exists records_board_idx on public.records (players, levels_cleared desc, frontier_wave desc);
alter table public.lobbies enable row level security;
alter table public.lobby_members enable row level security;
alter table public.records enable row level security;
