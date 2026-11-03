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
