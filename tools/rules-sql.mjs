/* Writes the database's copy of the game rules (the rule_* functions) from js/content: rules.js (XP, rewards, waves, spawn
   timing, bosses, drops, co-op), data.js (levels, rarities, lineup size) and items.js (rolls and prices). finish_run,
   start_run, save_loadout and the lobby functions call these instead of repeating numbers, so the rules live in one place.
   Run through `npm run sql` (tools/build-sql.mjs). */
import { UNLOCK_ALL, ACCOUNT, REWARDS, WAVES, SPAWN, BOSSES, MIN_RUN, DROPS, COOP, ENDLESS_RULES } from '../js/content/rules.js';
import { STAGES, ENDLESS, RARITIES, LINEUP_SIZE } from '../js/content/data.js';
import { ROLL, SELL, RANKS, ILVL } from '../js/content/items.js';
import { CRAFT } from '../js/content/crafting.js';
import { GEM_CRAFT, STONES, SOCKETS } from '../js/content/gems.js';
import { UNLOCKS, clearedFor } from '../js/content/unlocks.js';

const num = x => String(+x.toFixed(10));
const fn = (sig, ret, body, comment) => '-- ' + comment + '\ncreate or replace function public.' + sig + ' returns ' + ret +
  '\nlanguage sql immutable set search_path = public as $$ ' + body + ' $$;';

export function rulesSql(open = UNLOCK_ALL) {
  const waves = STAGES.map(s => s.waves);
  const rankCum = k => ROLL.rankWeights.map(row => row.slice(0, k).reduce((a, b) => a + b, 0));
  const rarityRows = RARITIES.map((r, i) => '(' + i + ', ' + num(r.weight) + ' * power(1 + greatest(p_luck, 0), ' + i + '))').join(', ');
  const parts = [
    '-- ===== Game rules (generated from js/content by tools/rules-sql.mjs; do not edit by hand) =====',
    fn('rule_stage_count()', 'int', 'select ' + STAGES.length, 'How many levels there are.'),
    fn('rule_stage_waves(p_stage int)', 'int', 'select case when p_stage > ' + STAGES.length + ' then ' + ENDLESS_RULES.maxWaves + ' else (array[' + waves.join(', ') + '])[p_stage] end', 'Waves in a level (endless: the most there can be).'),
    fn('rule_is_endless(p_stage int)', 'boolean', 'select p_stage between ' + ENDLESS[0].n + ' and ' + ENDLESS[ENDLESS.length - 1].n, 'Endless stages come after the levels, one per zone.'),
    fn('rule_stage_open(p_stage int, p_cleared int)', 'boolean', open ? 'select true' : 'select case when public.rule_is_endless(p_stage) then p_cleared >= ' + STAGES.length + ' else p_stage <= p_cleared + 1 end', 'Whether a player who cleared that many levels can play a stage.'),
    fn('rule_endless_level(p_waves int, p_roll numeric)', 'int',
      'with b(low) as (select ' + ENDLESS_RULES.bracket + ' * ((p_waves + ' + (ENDLESS_RULES.bracket - 1) + ') / ' + ENDLESS_RULES.bracket + ' - 1)), c(lo, hi) as (select greatest(' + ENDLESS_RULES.minItemLevel + ', low), greatest(' + ENDLESS_RULES.minItemLevel + ', least(p_waves, low + ' + ENDLESS_RULES.bracket + ')) from b) ' +
      'select (lo + floor(p_roll * (hi - lo + 1)))::int from c', 'The item level of an endless drop: somewhere in the bracket of waves reached, from a random number in [0, 1).'),
    fn('rule_unlock(p_feature text)', 'int', 'select case p_feature ' + Object.entries(UNLOCKS).map(([id, u]) => "when '" + id + "' then " + (open ? 0 : clearedFor(u.act))).join(' ') + ' end',
      'Levels that must be cleared before a feature is unlocked (it unlocks on reaching its act).'),
    fn('rule_lineup_max()', 'int', 'select ' + LINEUP_SIZE, 'Heroes a player can bring into a match.'),
    fn('rule_max_players()', 'int', 'select ' + COOP.maxPlayers, 'Players in a co-op lobby.'),
    fn('rule_max_items()', 'int', 'select ' + DROPS.maxItems, 'Items a player can hold.'),
    fn('rule_xp_need(p_level int)', 'int', 'select ' + ACCOUNT.xpBase + ' + p_level * ' + ACCOUNT.xpPerLevel, 'Account XP from level L to L + 1.'),
    fn('rule_run_xp(p_waves int, p_kills int, p_bonus numeric)', 'int',
      'select round((p_waves * ' + REWARDS.xpPerWave + ' + p_kills * ' + REWARDS.xpPerKill + ') * (1 + p_bonus))::int', 'Account XP a match gives.'),
    fn('rule_run_gold(p_waves int, p_bonus numeric)', 'int', 'select round(p_waves * ' + REWARDS.goldPerWave + ' * (1 + p_bonus))::int', 'Account gold a match gives.'),
    fn('rule_kill_cap(p_waves int)', 'int', 'select (' + WAVES.base + ' * p_waves + ' + WAVES.perWave + ' * p_waves * (p_waves + 1) / 2)::int',
      'The most kills a run that reached p_waves can have (every enemy of every wave).'),
    fn('rule_boss_cap(p_stage int, p_waves int)', 'int',
      'select case when public.rule_is_endless(p_stage) then p_waves / ' + ENDLESS_RULES.bossEvery + ' else (case when p_waves >= public.rule_stage_waves(p_stage) then 1 else 0 end) + (case when p_stage >= ' + BOSSES.middleFromStage +
      ' and p_waves >= round(public.rule_stage_waves(p_stage) / 2.0) then 1 else 0 end) end', 'Boss waves a run that reached p_waves has seen.'),
    fn('min_run_seconds(p_waves int)', 'numeric',
      'select coalesce(sum(' + num(MIN_RUN.share) + ' * (' + (WAVES.base - 1) + ' + ' + WAVES.perWave + ' * w) * greatest(' + num(SPAWN.min) + ', ' + num(SPAWN.start) +
      ' - ' + num(SPAWN.perWave) + ' * w)), 0) from generate_series(1, greatest(p_waves, 0)) as w',
      'Part of the time p_waves waves take to spawn (anti-cheat).'),
    fn('rule_min_run(p_waves int)', 'numeric', 'select greatest(' + MIN_RUN.floor + ', public.min_run_seconds(p_waves))', 'The shortest a finished run can be, in seconds.'),
    fn('rule_drop_chance(p_won boolean, p_waves int, p_stage int)', 'numeric',
      'select case when p_won then 1 else ' + num(DROPS.lossChance) + ' * p_waves::numeric / public.rule_stage_waves(p_stage) end', 'Items a match drops (before talents and bosses).'),
    fn('rule_rarity(p_roll numeric, p_luck numeric)', 'int',
      'with w(i, x) as (values ' + rarityRows + '), c as (select i, sum(x) over (order by i) as cum, sum(x) over () as total from w) ' +
      'select coalesce(min(i) filter (where p_roll * total < cum), ' + (RARITIES.length - 1) + ')::int from c',
      'An item rarity from a random number in [0, 1) and rarity luck (weights ' + RARITIES.map(r => r.weight).join('/') + ', each rarer step x (1 + luck)).'),
    fn('rule_bonus_guaranteed(p_rarity int)', 'int', 'select p_rarity + 1', 'Bonuses an item of this rarity always has.'),
    fn('rule_max_bonuses()', 'int', 'select ' + ROLL.maxBonuses, 'Bonuses an item can have.'),
    fn('rule_extra_bonus_chance()', 'numeric', 'select ' + num(ROLL.extraChance), 'Chance of each further bonus (talents add to it).'),
    fn('rule_affinity_chance()', 'numeric', 'select ' + num(ROLL.affinityChance), "Chance a bonus on an archetype item comes from its archetype's bonuses."),
    fn('rule_rank(p_rarity int, p_roll numeric)', 'int',
      'select case ' + [1, 2, 3].map(k => 'when p_roll * 100 < (array[' + rankCum(k).join(', ') + '])[p_rarity + 1] then ' + k).join(' ') + ' else ' + RANKS + ' end',
      'A bonus rank from a random number in [0, 1), by the item rarity (weights in %: ' + ROLL.rankWeights.map(r => r.join('/')).join(', ') + ').'),
    fn('rule_item_level(p_stage int)', 'int', 'select ' + ILVL.perLevel + ' * greatest(1, p_stage)', 'The item level of items from a level.'),
    fn('rule_stage_zone(p_stage int)', 'int', 'select (array[' + [...STAGES, ...ENDLESS].map(s => s.zone).join(', ') + '])[p_stage]', 'The act (zone) of a level or endless stage.'),
    fn('rule_stones(p_stage int, p_won boolean, p_bosses int)', 'int',
      'select ' + STONES.perBoss + ' * greatest(coalesce(p_bosses, 0), 0) + case when p_won then ' + STONES.winPerAct + ' * greatest(1, coalesce(public.rule_stage_zone(p_stage), 1)) else 0 end',
      'Rough Stone a match gives: for every boss killed, and for a win by the act.'),
    fn('rule_gem_stones()', 'int', 'select ' + GEM_CRAFT.stones, 'Rough Stone for crafting a gem.'),
    fn('rule_gem_gold()', 'int', 'select ' + GEM_CRAFT.gold, 'Account gold for crafting a gem.'),
    fn('rule_gem_combine()', 'int', 'select ' + GEM_CRAFT.combine, 'Gems that combine into one of the next rarity.'),
    fn('rule_max_gems()', 'int', 'select ' + GEM_CRAFT.max, 'Gems a player can hold.'),
    fn('rule_sockets()', 'int', 'select ' + SOCKETS, 'Sockets on every item.'),
    fn('rule_disenchant_yield()', 'int', 'select ' + CRAFT.yields, 'Materials from disenchanting one item.'),
    fn('rule_convert_cost()', 'int', 'select ' + CRAFT.convert, 'Materials that make one of the next.'),
    fn('rule_craft_cost()', 'int', 'select ' + CRAFT.cost, 'Materials for crafting an item.'),
    fn('rule_craft_gold(p_rarity int)', 'int', 'select (array[' + CRAFT.gold.join(', ') + '])[p_rarity + 1]', 'Account gold for crafting an item of a rarity.'),
    fn('item_price(p_rarity int, p_bonuses text[], p_ranks int[])', 'int',
      'select (array[' + SELL.base.join(', ') + '])[least(greatest(p_rarity, 0), 3) + 1] + ' + SELL.perRank +
      ' * coalesce((select sum(coalesce(p_ranks[k], least(greatest(p_rarity, 0), 3) + 1)) from generate_subscripts(coalesce(p_bonuses, \'{}\'), 1) k), 0)::int',
      'What an item sells for: a base by rarity plus gold per bonus rank (a bonus from before ranks counts at the rarity).')
  ];
  return parts.join('\n') + '\n';
}
/* The rule functions, so permissions can lock them (only other database functions call them). */
export const RULE_FUNCTIONS = ['rule_stage_count()', 'rule_stage_waves(int)', 'rule_is_endless(int)', 'rule_stage_open(int, int)', 'rule_endless_level(int, numeric)', 'rule_unlock(text)', 'rule_lineup_max()', 'rule_max_players()', 'rule_max_items()',
  'rule_xp_need(int)', 'rule_run_xp(int, int, numeric)', 'rule_run_gold(int, numeric)', 'rule_kill_cap(int)', 'rule_boss_cap(int, int)',
  'min_run_seconds(int)', 'rule_min_run(int)', 'rule_drop_chance(boolean, int, int)', 'rule_rarity(numeric, numeric)', 'rule_bonus_guaranteed(int)',
  'rule_max_bonuses()', 'rule_extra_bonus_chance()', 'rule_affinity_chance()', 'rule_rank(int, numeric)', 'rule_item_level(int)', 'rule_stage_zone(int)', 'rule_stones(int, boolean, int)', 'rule_gem_stones()', 'rule_gem_gold()', 'rule_gem_combine()', 'rule_max_gems()', 'rule_sockets()', 'rule_disenchant_yield()', 'rule_convert_cost()', 'rule_craft_cost()', 'rule_craft_gold(int)', 'item_price(int, text[], int[])'];
export const rulesPermissionsSql = () => RULE_FUNCTIONS.map(f => 'revoke all on function public.' + f + ' from public, anon, authenticated;').join('\n') + '\n';
