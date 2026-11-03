-- Test TBD: removes tables and functions from the earlier prototypes (Target Rush and the first tower defense).
-- WARNING: this permanently deletes their leaderboards and play counter. If you still host those old games, do NOT run this.
-- They let anyone add rows with only the public key, so once you no longer use them they should go.

drop table if exists public.td_scores cascade;
drop table if exists public.scores cascade;
drop table if exists public.stats cascade;
drop function if exists public.increment_plays();
