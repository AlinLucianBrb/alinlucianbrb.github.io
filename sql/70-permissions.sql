-- ===== Permissions: only what the game needs =====
revoke all on function public.signup_check(text, text) from public, anon, authenticated;
grant execute on function public.signup_check(text, text) to anon, authenticated;
revoke all on function public.get_leaderboard(int, int) from public, anon, authenticated;
grant execute on function public.get_leaderboard(int, int) to anon, authenticated;
revoke all on function public.get_endless_board(int, int) from public, anon, authenticated;
grant execute on function public.get_endless_board(int, int) to anon, authenticated;
revoke all on function public.start_run(int, uuid) from public, anon, authenticated;
grant execute on function public.start_run(int, uuid) to authenticated;
revoke all on function public.finish_run(uuid, int, int, boolean, int) from public, anon, authenticated;
grant execute on function public.finish_run(uuid, int, int, boolean, int) to authenticated;
revoke all on function public.save_loadout(text[], jsonb) from public, anon, authenticated;
grant execute on function public.save_loadout(text[], jsonb) to authenticated;
revoke all on function public.save_paths(jsonb) from public, anon, authenticated;
grant execute on function public.save_paths(jsonb) to authenticated;
revoke all on function public.sell_item(uuid) from public, anon, authenticated;
grant execute on function public.sell_item(uuid) to authenticated;
revoke all on function public.disenchant_items(uuid[]) from public, anon, authenticated;
grant execute on function public.disenchant_items(uuid[]) to authenticated;
revoke all on function public.convert_material(int, int) from public, anon, authenticated;
grant execute on function public.convert_material(int, int) to authenticated;
revoke all on function public.craft_item(int, text, text) from public, anon, authenticated;
grant execute on function public.craft_item(int, text, text) to authenticated;
revoke all on function public.craft_gem(text) from public, anon, authenticated;
grant execute on function public.craft_gem(text) to authenticated;
revoke all on function public.combine_gems(uuid[]) from public, anon, authenticated;
grant execute on function public.combine_gems(uuid[]) to authenticated;
revoke all on function public.socket_gem(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.socket_gem(uuid, uuid, int) to authenticated;
revoke all on function public.claim_achievement(text) from public, anon, authenticated;
grant execute on function public.claim_achievement(text) to authenticated;
revoke all on function public.set_title(text) from public, anon, authenticated;
grant execute on function public.set_title(text) to authenticated;
revoke all on function public.track_run(uuid, int, boolean, int, text[]) from public, anon, authenticated;   -- only finish_run calls it
revoke all on function public.achievement_progress(uuid, public.achievement_defs) from public, anon, authenticated;
revoke all on function public.save_talents(text[]) from public, anon, authenticated;
grant execute on function public.save_talents(text[]) to authenticated;
-- Internal helpers: only other database functions use them.
revoke all on function public.username_problem(text) from public, anon, authenticated;
revoke all on function public.roll_item(uuid, text, text, int, int, numeric) from public, anon, authenticated;
revoke all on function public.require_unlock(text, int) from public, anon, authenticated;
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
revoke all on table public.gem_kinds from anon, authenticated;
revoke all on table public.achievement_defs from anon, authenticated;
-- Players can read their own items (row security) but never create, change or delete them.
revoke insert, update, delete on public.player_items from anon, authenticated;
grant select on public.player_items to authenticated;
-- The same for gems: read your own, change them only through craft_gem, combine_gems and socket_gem.
revoke insert, update, delete on public.player_gems from anon, authenticated;
grant select on public.player_gems to authenticated;
-- Achievements: read your own progress and claims; they change only through finish_run and claim_achievement.
revoke insert, update, delete on public.player_progress, public.player_achievements from anon, authenticated;
grant select on public.player_progress, public.player_achievements to authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
