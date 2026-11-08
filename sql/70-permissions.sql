-- ===== Permissions: only what the game needs =====
revoke all on function public.signup_check(text, text) from public, anon, authenticated;
grant execute on function public.signup_check(text, text) to anon, authenticated;
revoke all on function public.get_leaderboard(int, int) from public, anon, authenticated;
grant execute on function public.get_leaderboard(int, int) to anon, authenticated;
revoke all on function public.start_run(int, uuid) from public, anon, authenticated;
grant execute on function public.start_run(int, uuid) to authenticated;
revoke all on function public.finish_run(uuid, int, int, boolean, int) from public, anon, authenticated;
grant execute on function public.finish_run(uuid, int, int, boolean, int) to authenticated;
revoke all on function public.save_loadout(text[], jsonb) from public, anon, authenticated;
grant execute on function public.save_loadout(text[], jsonb) to authenticated;
revoke all on function public.sell_item(uuid) from public, anon, authenticated;
grant execute on function public.sell_item(uuid) to authenticated;
revoke all on function public.save_talents(text[]) from public, anon, authenticated;
grant execute on function public.save_talents(text[]) to authenticated;
-- Internal helpers: only other database functions use them.
revoke all on function public.username_problem(text) from public, anon, authenticated;
revoke all on function public.lobby_code() from public, anon, authenticated;
revoke all on function public.lobby_hash(text, text) from public, anon, authenticated;
revoke all on function public.lobby_state(uuid) from public, anon, authenticated;
revoke all on function public.lobby_drop_member(uuid, uuid) from public, anon, authenticated;
-- Co-op lobbies
revoke all on function public.create_lobby(boolean, text, int) from public, anon, authenticated;
grant execute on function public.create_lobby(boolean, text, int) to authenticated;
revoke all on function public.list_lobbies() from public, anon, authenticated;
grant execute on function public.list_lobbies() to authenticated;
revoke all on function public.join_lobby(text, text) from public, anon, authenticated;
grant execute on function public.join_lobby(text, text) to authenticated;
revoke all on function public.lobby_ping(uuid) from public, anon, authenticated;
grant execute on function public.lobby_ping(uuid) to authenticated;
revoke all on function public.set_lobby_stage(uuid, int) from public, anon, authenticated;
grant execute on function public.set_lobby_stage(uuid, int) to authenticated;
revoke all on function public.leave_lobby(uuid) from public, anon, authenticated;
grant execute on function public.leave_lobby(uuid) to authenticated;
revoke all on function public.start_lobby(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.start_lobby(uuid, jsonb) to authenticated;
-- These tables are private. With row security on and no policies, players cannot read or write them directly.
revoke all on table public.runs, public.talent_nodes, public.talent_links, public.blocked_names, public.hero_classes, public.item_types, public.item_bonuses,
  public.lobbies, public.lobby_members, public.records from anon, authenticated;
-- Players can read their own items (row security) but never create, change or delete them.
revoke insert, update, delete on public.player_items from anon, authenticated;
grant select on public.player_items to authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
