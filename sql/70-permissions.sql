-- ===== Permissions: only what the game needs =====
revoke all on function public.signup_check(text, text) from public, anon, authenticated;
grant execute on function public.signup_check(text, text) to anon, authenticated;
revoke all on function public.get_leaderboard(int) from public, anon, authenticated;
grant execute on function public.get_leaderboard(int) to anon, authenticated;
revoke all on function public.start_run(int) from public, anon, authenticated;
grant execute on function public.start_run(int) to authenticated;
revoke all on function public.finish_run(uuid, int, int, boolean) from public, anon, authenticated;
grant execute on function public.finish_run(uuid, int, int, boolean) to authenticated;
revoke all on function public.save_loadout(text[], jsonb) from public, anon, authenticated;
grant execute on function public.save_loadout(text[], jsonb) to authenticated;
revoke all on function public.save_talents(text[]) from public, anon, authenticated;
grant execute on function public.save_talents(text[]) to authenticated;
-- Internal helpers: only other database functions use them.
revoke all on function public.username_problem(text) from public, anon, authenticated;
revoke all on function public.min_run_seconds(int) from public, anon, authenticated;
-- These tables are private. With row security on and no policies, players cannot read or write them directly.
revoke all on table public.runs, public.talent_nodes, public.talent_links, public.blocked_names, public.hero_classes, public.item_types from anon, authenticated;
-- Players can read their own items (row security) but never create, change or delete them.
revoke insert, update, delete on public.player_items from anon, authenticated;
grant select on public.player_items to authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
