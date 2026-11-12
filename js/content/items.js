/* Items drop at the end of a match and are equipped on heroes before the next one.
   Every hero has five gear slots (SLOTS). An item has a type (ITEMS: which slot it goes in, and any fixed bonus of its own),
   a rarity (the same four as relics) and 1 to 4 bonuses. Bonuses are the relics that work on heroes (damage, speed, crits,
   energy, minions...; no gold, XP or lives: ITEM_BONUSES), and each bonus has its own RANK, 1 to 4, rolled separately: a
   rank 3 "Sharpened rounds" gives what a Rare Sharpened rounds relic gives. The item's rarity does not set the ranks, but
   rarer items are more likely to roll higher ones (ROLL.rankWeights). An item never has the same bonus twice.
   Items are rolled by the server (finish_run), which stores { item_type, rarity, bonuses: [relic names], bonus_ranks: [1-4] };
   this file only turns them into modifiers, names and descriptions. ROLL describes the same rules for the client (and the
   tests). Items from before ranks existed count each bonus at the item's rarity (rank = rarity + 1).
   To add an item type: add an entry here, then run `npm run sql` so the database knows it can drop. */
import { RELICS, RARITIES } from './data.js';

export const SLOTS = ['helm', 'body', 'legs', 'boots', 'trinket'];
export const SLOT_LABEL = { helm: 'Helm', body: 'Body armour', legs: 'Legs', boots: 'Boots', trinket: 'Trinket' };

/* Item types. mods are the type's own fixed bonus (most have none); color is the placeholder icon's colour. */
export const ITEMS = {
  helm:        { name: 'Helm',        slot: 'helm',    color: '#9fb4c7', desc: '', mods: [] },
  body_armour: { name: 'Body Armour', slot: 'body',    color: '#b9a27a', desc: '', mods: [] },
  leggings:    { name: 'Leggings',    slot: 'legs',    color: '#8fa889', desc: '', mods: [] },
  boots:       { name: 'Boots',       slot: 'boots',   color: '#a48b74', desc: '', mods: [] },
  power_charm: { name: 'Power Charm', slot: 'trinket', color: '#f2b84b', desc: '+5 damage', mods: [{ stat: 'damage', type: 'flat', value: 5 }] },
  /* Archetype items: each bonus has a 60% chance to come from its archetype's bonuses (AFFINITY), see ROLL.affinityChance. */
  great_helm:       { name: 'Great Helm',       slot: 'helm',    affinity: 'melee',      color: '#b0b8c2', desc: '', mods: [] },
  plate_armour:     { name: 'Plate Armour',     slot: 'body',    affinity: 'melee',      color: '#b0b8c2', desc: '', mods: [] },
  plate_greaves:    { name: 'Plate Greaves',    slot: 'legs',    affinity: 'melee',      color: '#b0b8c2', desc: '', mods: [] },
  sabatons:         { name: 'Sabatons',         slot: 'boots',   affinity: 'melee',      color: '#b0b8c2', desc: '', mods: [] },
  bloodstone_ring:  { name: 'Bloodstone Ring',  slot: 'trinket', affinity: 'melee',      color: '#c23a3a', desc: '', mods: [] },
  leather_hood:     { name: 'Leather Hood',     slot: 'helm',    affinity: 'projectile', color: '#4c7a3a', desc: '', mods: [] },
  leather_jerkin:   { name: 'Leather Jerkin',   slot: 'body',    affinity: 'projectile', color: '#82552f', desc: '', mods: [] },
  leather_trousers: { name: 'Leather Trousers', slot: 'legs',    affinity: 'projectile', color: '#82552f', desc: '', mods: [] },
  ranger_boots:     { name: 'Ranger Boots',     slot: 'boots',   affinity: 'projectile', color: '#82552f', desc: '', mods: [] },
  feather_charm:    { name: 'Feather Charm',    slot: 'trinket', affinity: 'projectile', color: '#4c7a3a', desc: '', mods: [] },
  circlet:          { name: 'Circlet',          slot: 'helm',    affinity: 'spell',      color: '#e8a940', desc: '', mods: [] },
  silk_robe:        { name: 'Silk Robe',        slot: 'body',    affinity: 'spell',      color: '#5a64b8', desc: '', mods: [] },
  silk_wraps:       { name: 'Silk Wraps',       slot: 'legs',    affinity: 'spell',      color: '#5a64b8', desc: '', mods: [] },
  silk_slippers:    { name: 'Silk Slippers',    slot: 'boots',   affinity: 'spell',      color: '#5a64b8', desc: '', mods: [] },
  arcane_amulet:    { name: 'Arcane Amulet',    slot: 'trinket', affinity: 'spell',      color: '#c39bf2', desc: '', mods: [] },
  beast_mask:       { name: 'Beast Mask',       slot: 'helm',    affinity: 'minion',     color: '#ece2c6', desc: '', mods: [] },
  hide_armour:      { name: 'Hide Armour',      slot: 'body',    affinity: 'minion',     color: '#8a6a4a', desc: '', mods: [] },
  fur_leggings:     { name: 'Fur Leggings',     slot: 'legs',    affinity: 'minion',     color: '#8a6a4a', desc: '', mods: [] },
  fur_boots:        { name: 'Fur Boots',        slot: 'boots',   affinity: 'minion',     color: '#8a6a4a', desc: '', mods: [] },
  fang_necklace:    { name: 'Fang Necklace',    slot: 'trinket', affinity: 'minion',     color: '#ece2c6', desc: '', mods: [] }
};
/* The bonuses each archetype's items lean toward (all of them can be item bonuses). */
export const AFFINITY = {
  melee:      ['Whetstone', 'Brawn', 'Quick hands', 'Cruelty'],
  projectile: ['Fine arrows', 'Long barrels', 'Quick hands', 'Keen edge'],
  spell:      ['Arcane focus', 'Split bolt', 'Quick incantation', 'Battle focus'],
  minion:     ['Pack leader', 'Feral haste', 'Hunting instinct', 'Savage bite']
};
export const AFFINITY_LABEL = { melee: 'Melee', projectile: 'Projectile', spell: 'Spell', minion: 'Minion' };

/* How items are rolled (the server's finish_run does the same; a test keeps them in step):
   rarity by the relic weights (Common 55, Uncommon 28, Rare 13, Epic 4; Treasure Hunter's item rarity luck multiplies each rarer
   step's weight by 1 + luck, like relic luck); a Common item has at least 1 bonus, an Uncommon 2, a Rare 3 and an Epic 4; then
   each further bonus has a 30% chance (plus Treasure Hunter's extra bonus chance), up to 4. */
export const ROLL = { maxBonuses: 4, extraChance: 0.3, guaranteed: r => r + 1,
  /* An archetype item's bonuses: each one has this chance to come from its AFFINITY list (if one is left), else from all. */
  affinityChance: 0.6,
  /* The chance of each bonus rank (1 to 4), in %, by the item's rarity (Common, Uncommon, Rare, Epic). */
  rankWeights: [[70, 22, 7, 1], [45, 35, 15, 5], [25, 35, 28, 12], [10, 25, 35, 30]] };
export const RANKS = 4;
/* Item level (Nov 12): ILVL.perLevel x the level you beat (on a loss, the level below): 3 for level 1-1, 6 for 1-2... 75
   for 5-5. Every stat on an item counts ILVL.base + ILVL.per x its item level times: item level 3 gives 65%, 10 gives 100%
   (the values before item levels), 30 gives 200%, 75 gives 425%. Items from before item levels count as level ILVL.old. */
export const ILVL = { base: 0.5, per: 0.05, old: 10, perLevel: 3 };
export const ilvlMult = ilvl => ILVL.base + ILVL.per * (ilvl || ILVL.old);
/* A rank as words and colour (the rarity colours: rank 1 white, 2 green, 3 blue, 4 purple). */
export const rankColor = r => RARITIES[Math.max(1, Math.min(RANKS, r)) - 1].color;

/* Relics that can be item bonuses: those whose modifiers all work on heroes. Gold, XP, lives and relic luck stay off gear. */
const bonusMods = (relic, m) => (relic.mods ? relic.mods(m) : null);
export const ITEM_BONUSES = RELICS.filter(r => { const ms = bonusMods(r, 1); return ms && ms.length && ms.every(m => m.scope !== 'global'); }).map(r => r.name);
const onGear = new Set(ITEM_BONUSES);
const relicByName = name => RELICS.find(r => r.name === name);

/* Older items (from before rarities) come as a plain type id: they count as Common with no bonuses. */
export function asItem(it) {
  if (typeof it === 'string') return { type: it, rarity: 0, bonuses: [], ranks: [] };
  const rarity = Math.max(0, Math.min(3, it.rarity | 0)), given = it.ranks || it.bonus_ranks || [], seen = new Set(), bonuses = [], ranks = [];
  (it.bonuses || []).forEach((b, i) => {
    if (seen.has(b) || bonuses.length >= ROLL.maxBonuses) return;
    seen.add(b); bonuses.push(b); ranks.push(Math.max(1, Math.min(RANKS, (given[i] | 0) || rarity + 1)));
  });
  const out = { type: it.type || it.item_type, rarity, bonuses, ranks };
  if (it.ilvl) out.ilvl = Math.max(1, it.ilvl | 0);   /* items from before item levels have none: they count as ILVL.old */
  return out;
}

export const itemName = it => { const i = asItem(it), t = ITEMS[i.type]; return RARITIES[i.rarity].name + ' ' + (t ? t.name : i.type); };
export const itemColor = it => RARITIES[asItem(it).rarity].color;
/* Lines describing an item: its own bonus, then each bonus at its rank (bonuses that are no longer allowed on gear are left out). */
export function itemLines(it) {
  return itemBonusLines(it).filter(l => l.works).map(l => l.desc);
}
/* The same, for tooltips: { text, color, desc, rank, works }, each bonus in its rank's colour with its rank. */
export function itemBonusLines(it) {
  const i = asItem(it), t = ITEMS[i.type], out = [], lk = ilvlMult(i.ilvl);
  out.push({ text: 'Item level ' + (i.ilvl || ILVL.old) + ' · stats ×' + (+lk.toFixed(2)), desc: '', color: '#9db3a3', rank: 0, works: false, meta: true });
  if (t && t.desc) { const d = t.desc.replace(/\+(\d+(?:\.\d+)?)/, (_, n) => '+' + +(n * lk).toFixed(1)); out.push({ text: d, desc: d, color: '#ecf1e8', rank: 0, works: true }); }   /* its own stat, scaled too */
  i.bonuses.forEach((name, k) => {
    const r = relicByName(name), rank = i.ranks[k];
    if (!r) return;
    if (!onGear.has(name)) { out.push({ text: name + ': no longer works on gear', desc: name, color: '#6f7d74', rank, works: false }); return; }
    const desc = r.desc(rank * lk);   /* the bonus at its rank, scaled by the item level */
    out.push({ text: desc + '  · rank ' + rank, desc, color: rankColor(rank), rank, works: true });
  });
  return out;
}

/* A bonus that does not fit its wearer (Pack leader on a hero with no minion, Fine arrows on a melee hero) is not wasted:
   it counts as its general version at FALLBACK of its value. Damage for one kind of hero becomes damage; a speed becomes
   the speed the hero uses (attack or cast); minion crits become crits; Split bolt becomes a little range. */
export const FALLBACK = 0.8;
const GENERAL = {
  damage: m => ({ stat: 'damage', value: m.value }),
  speed: (m, rate) => ({ stat: rate, value: m.value }), castSpeed: (m, rate) => ({ stat: rate, value: m.value }), minionSpeed: (m, rate) => ({ stat: rate, value: m.value }),
  minionCritChance: m => ({ stat: 'critChance', value: m.value }), minionCritDamage: m => ({ stat: 'critDamage', value: m.value }),
  minionDamage: m => ({ stat: 'damage', value: m.value }),
  targets: m => ({ stat: 'range', type: 'inc', value: m.value / 5 })
};
/* One item modifier for its wearer: as it is if it fits (or helps every hero), else its general version, or null. */
export function fitMod(m, wearer) {
  if (!wearer || !Array.isArray(m.scope) || m.scope.includes('all') || m.scope.some(s => wearer.tags.includes(s))) return m;
  const g = GENERAL[m.stat] && GENERAL[m.stat](m, wearer.rate || 'speed');
  return g ? { ...m, type: g.type || m.type, stat: g.stat, value: g.value * FALLBACK, scope: ['all'], source: m.source + ' (general, ' + Math.round(FALLBACK * 100) + '%)' } : null;
}

/* Modifiers for a match from the equipped items: { heroId: [item, ...] } (an item is { type, rarity, bonuses } or a type id).
   Hero bonuses apply to the wearer only, and only if it has the bonus's tags (Whetstone needs a melee hero); "need" holds the
   wearer's id. Each bonus counts at its own rank. Unknown types and bonuses are ignored.
   wearerOf(heroId): { tags, rate } of the hero as it will play (its path's tags included), to turn bonuses that do not fit
   into their general version (fitMod). Without it every bonus is kept as it is. */
export function itemMods(equipped = {}, wearerOf = null) {
  const out = [];
  for (const heroId in equipped) {
    const list = Array.isArray(equipped[heroId]) ? equipped[heroId] : [equipped[heroId]];
    for (const raw of list) {
      if (!raw) continue;
      const it = asItem(raw), type = ITEMS[it.type];
      if (!type) continue;
      const source = itemName(it), lk = ilvlMult(it.ilvl);   /* every stat on the item scales with its item level */
      for (const m of type.mods) out.push({ ...m, value: m.value * lk, scope: [heroId], source, ri: -2 });
      it.bonuses.forEach((name, k) => {
        if (!onGear.has(name)) return;   /* gold, XP and lives bonuses no longer work on gear */
        const r = relicByName(name), mods = r && bonusMods(r, it.ranks[k] * ilvlMult(it.ilvl));
        const from = source + ': ' + name;   /* each bonus is its own line in the hero panel, e.g. "Epic Helm: Whetstone" */
        if (mods) for (const m of mods) { const fit = fitMod({ ...m, need: heroId, source: from, ri: -2 }, wearerOf && wearerOf(heroId)); if (fit) out.push(fit); }
      });
    }
  }
  return out;
}

/* Selling an item for account gold (Inventory). The server's sell_item uses the same price (a test keeps them in step):
   a base by rarity plus 5 gold per bonus rank (a bonus from before ranks counts at the item's rarity). */
export const SELL = { base: [5, 15, 40, 100], perRank: 5 };
export function sellPrice(row) {
  const i = asItem(row);
  return SELL.base[i.rarity] + SELL.perRank * i.ranks.reduce((a, r) => a + r, 0);
}
