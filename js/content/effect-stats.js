/* Effect stats: hero stats that do something in a fight rather than raise a number. Every hero has them, all 0 to start, so
   relics, item bonuses and talents give them like any other stat. What they do is in js/engine/procs.js.
   label: the stat's name; text(v): what `v` of it does, for talents and tooltips; pct: shown as a percentage. */
const p = x => +(x * 100).toFixed(2) + '%';
export const EFFECT_STATS = {
  /* relics */
  vsLow:      { label: 'Damage to enemies under 30% life', pct: true, text: v => '+' + p(v) + ' damage to enemies under 30% life' },
  vsFull:     { label: 'Damage to enemies over 80% life', pct: true, text: v => '+' + p(v) + ' damage to enemies over 80% life' },
  vsBoss:     { label: 'Damage to bosses', pct: true, text: v => '+' + p(v) + ' damage to bosses' },
  vsHeld:     { label: 'Damage to slowed or frozen enemies', pct: true, text: v => '+' + p(v) + ' damage to slowed or frozen enemies' },
  chainCrit:  { label: 'Crits that hit another enemy', pct: true, text: v => 'Crits have a ' + p(v) + ' chance to hit another enemy for half' },
  thunder:    { label: 'Extra lightning on shocked enemies', pct: true, text: v => 'Hits on shocked enemies have a ' + p(v) + ' chance to strike again with lightning' },
  momentum:   { label: 'Attack and cast speed per kill', pct: true, text: v => 'A kill gives +' + p(v) + ' attack and cast speed for 4 s, up to 10 times' },
  overflow:   { label: 'Energy to other heroes per ultimate', pct: false, text: v => 'Ultimates give your other heroes ' + +v.toFixed(2) + ' energy' },
  lone:       { label: 'Damage while alone', pct: true, text: v => '+' + p(v) + ' damage with no hero on the 8 tiles around' },
  brother:    { label: 'Damage per hero beside', pct: true, text: v => '+' + p(v) + ' damage for each of your heroes on the 8 tiles around' },
  lastStand:  { label: 'Damage per life below 10', pct: true, text: v => '+' + p(v) + ' damage for each life below 10' },
  trophy:     { label: 'Damage per 50 kills', pct: true, text: v => '+' + p(v) + ' damage per 50 kills in the match (up to ' + p(v * 15) + ')' },
  fever:      { label: 'Damage per 200 gold', pct: true, text: v => '+' + p(v) + ' damage per 200 gold you hold (up to ' + p(v * 10) + ')' },
  tempo:      { label: 'Damage of every 10th hit', pct: true, text: v => 'Every 10th hit deals +' + p(v) },
  /* talent notables */
  splash:     { label: 'Splash damage', pct: true, text: v => 'Hits splash ' + p(v) + ' of their damage to enemies close by' },
  stagger:    { label: 'Burn stagger (s)', pct: false, text: v => 'Setting an enemy on fire staggers it for ' + +v.toFixed(2) + ' s' },
  wither:     { label: 'Defenses lost per Corruption', pct: true, text: v => 'Each Corruption stack lowers armor and resistances by ' + p(v) },
  venom:      { label: 'Poison damage', pct: true, text: v => 'Poisoned enemies cannot heal, and poison deals ' + p(v) + ' more' },
  lucky:      { label: 'Lucky crits', pct: false, text: () => 'Crit chance is rolled twice and the better roll counts' },
  vsFrozen:   { label: 'Damage to frozen enemies', pct: true, text: v => '+' + p(v) + ' damage to frozen enemies' },
  arcing:     { label: 'Shock jumps', pct: false, text: () => 'Shock jumps to one enemy close by' },
  recast:     { label: 'Chance to cast again', pct: true, text: v => 'Spells hit again ' + p(v) + ' of the time' },
  perTile:    { label: 'Damage per tile', pct: true, text: v => 'Projectiles deal ' + p(v) + ' more per tile to their target' },
  fifth:      { label: 'Every 5th melee hit lands twice', pct: false, text: () => 'Every 5th melee hit lands twice' },
  /* the talent notables of Nov 26 (Physical, Cold, Holy, Minion, Energy) */
  focus:      { label: 'Damage per second in range', pct: true, text: v => '+' + p(v) + ' damage per second an enemy stays in range (up to ' + p(v * 10) + '); resets when it leaves' },
  deepFreeze: { label: 'Chill freezes (s)', pct: false, text: v => 'Every 5th cold hit on a chilled enemy freezes it for ' + +v.toFixed(2) + ' s' },
  overkill:   { label: 'Holy overkill passed on', pct: true, text: v => p(v) + ' of the extra damage of a killing holy hit goes to the nearest enemy' },
  feed:       { label: 'Energy per minion kill', pct: false, text: v => 'A kill by a minion gives its hero ' + +v.toFixed(2) + ' energy' },
  thrift:     { label: 'Chance to keep energy', pct: true, text: v => p(v) + ' chance to keep your energy when you cast an ultimate' }
};
/* Effects for the whole match rather than one hero (talent notables): player stats, 0 or 1. What they do: world.js,
   commands.js, and finish_run on the server (firstClear, lootReroll). */
export const GLOBAL_EFFECTS = {
  bossInterest: () => 'Interest is paid twice on boss waves',
  betterOffer: () => 'One relic of every offer is a rarity higher',
  waveReroll: () => 'Every wave gives you a free relic reroll if you have none',
  freeEvolve: () => 'Your first evolution each match is free',
  bossXp: () => 'Bosses give double hero XP',
  firstClear: v => '+' + p(v) + ' gold and XP on a level you have not cleared yet',
  lootReroll: () => 'Once per match, reroll one item you found'
};
export const EFFECT_KEYS = Object.keys(EFFECT_STATS);
export const EFFECT_BASE = Object.fromEntries(EFFECT_KEYS.map(k => [k, 0]));
/* Ceilings and distances the engine uses. */
export const PROC = { focusMost: 10, chillHits: 5, splash: 40, chain: 90, jump: 60, momentum: { seconds: 4, stacks: 10, most: 0.05 }, overflowMost: 15, trophyMost: 15, feverMost: 10, tempo: 10, fifth: 5, low: 0.3, full: 0.8 };
