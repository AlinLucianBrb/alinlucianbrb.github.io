/* Writes the database's copy of the game rules (the rule_* functions) from js/content: rules.js (XP, rewards, waves, spawn
   timing, bosses, drops, co-op), data.js (levels, rarities, lineup size) and items.js (rolls and prices). finish_run,
   start_run, save_loadout and the lobby functions call these instead of repeating numbers, so the rules live in one place.
   Run through `npm run sql` (tools/build-sql.mjs). */
import { ACCOUNT, REWARDS, WAVES, SPAWN, BOSSES, MIN_RUN, DROPS, COOP } from '../js/content/rules.js';
import { STAGES, RARITIES, LINEUP_SIZE } from '../js/content/data.js';
import { ROLL, SELL, RANKS } from '../js/content/items.js';

const num = x => String(+x.toFixed(10));
const fn = (sig, ret, body, comment) => '-- ' + comment + '\ncreate or replace function public.' + sig + ' returns ' + ret +
  '\nlanguage sql immutable set search_path = public as $$ ' + body + ' $$;';

export function rulesSql() {
  const waves = STAGES.map(s => s.waves);
  const rankCum = k => ROLL.rankWeights.map(row => row.slice(0, k).reduce((a, b) => a + b, 0));
  const rarityRows = RARITIES.map((r, i) => '(' + i + ', ' + num(r.weight) + ' * power(1 + greatest(p_luck, 0), ' + i + '))').join(', ');
  const parts = [
    '-- ===== Game rules (generated from js/content by tools/rules-sql.mjs; do not edit by hand) =====',
    fn('rule_stage_count()', 'int', 'select ' + STAGES.length, 'How many levels there are.'),
    fn('rule_stage_waves(p_stage int)', 'int', 'select (array[' + waves.join(', ') + '])[p_stage]', 'Waves in a level.'),
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
      'select (case when p_waves >= public.rule_stage_waves(p_stage) then 1 else 0 end) + (case when p_stage >= ' + BOSSES.middleFromStage +
      ' and p_waves >= round(public.rule_stage_waves(p_stage) / 2.0) then 1 else 0 end)', 'Boss waves a run that reached p_waves has seen.'),
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
    fn('item_price(p_rarity int, p_bonuses text[], p_ranks int[])', 'int',
      'select (array[' + SELL.base.join(', ') + '])[least(greatest(p_rarity, 0), 3) + 1] + ' + SELL.perRank +
      ' * coalesce((select sum(coalesce(p_ranks[k], least(greatest(p_rarity, 0), 3) + 1)) from generate_subscripts(coalesce(p_bonuses, \'{}\'), 1) k), 0)::int',
      'What an item sells for: a base by rarity plus gold per bonus rank (a bonus from before ranks counts at the rarity).')
  ];
  return parts.join('\n') + '\n';
}
/* The rule functions, so permissions can lock them (only other database functions call them). */
export const RULE_FUNCTIONS = ['rule_stage_count()', 'rule_stage_waves(int)', 'rule_lineup_max()', 'rule_max_players()', 'rule_max_items()',
  'rule_xp_need(int)', 'rule_run_xp(int, int, numeric)', 'rule_run_gold(int, numeric)', 'rule_kill_cap(int)', 'rule_boss_cap(int, int)',
  'min_run_seconds(int)', 'rule_min_run(int)', 'rule_drop_chance(boolean, int, int)', 'rule_rarity(numeric, numeric)', 'rule_bonus_guaranteed(int)',
  'rule_max_bonuses()', 'rule_extra_bonus_chance()', 'rule_affinity_chance()', 'rule_rank(int, numeric)', 'item_price(int, text[], int[])'];
export const rulesPermissionsSql = () => RULE_FUNCTIONS.map(f => 'revoke all on function public.' + f + ' from public, anon, authenticated;').join('\n') + '\n';
