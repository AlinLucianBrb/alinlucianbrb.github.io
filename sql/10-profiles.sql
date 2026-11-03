-- New projects only: the player profile table.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  email text not null,
  level int not null default 1,
  xp int not null default 0,
  gold bigint not null default 0,
  best_wave int not null default 0,
  runs int not null default 0,
  talents text[] not null default '{}',
  levels_cleared int not null default 0,
  frontier_wave int not null default 0,
  lineup text[] not null default '{warrior,ranger,mage}',
  equipment jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- No two accounts may share a username or an email (case-insensitive).
create unique index profiles_username_key on public.profiles (lower(username));
create unique index profiles_email_key on public.profiles (lower(email));

alter table public.profiles enable row level security;
-- Players can read only their own row (their email stays private). Changes happen only through the functions below.
create policy "read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
