/* Legendary relics. After wave LEGENDARY.wave each player chooses one, for free, once per match (not on a level's last wave):
   LEGENDARY.offers cards, one for each of its heroes on the map and the rest for everyone. They have no rarity, cannot be
   bought, rerolled or lost. hero: the class it is for (every form of it); none: for all the player's heroes.
   The numbers are used by js/engine/legendaries.js. */
export const LEGENDARY = { wave: 25, offers: 4, color: '#ff9a3c' };
const pc = x => +(x * 100).toFixed(2) + '%';
const L = {
  /* for everyone */
  plague:   { name: 'Plague', radius: 60, blast: 2, text: l => 'An enemy that dies passes its damage over time on to the enemies around it, and explodes for ' + l.blast + ' times what was left of it' },
  overload: { name: 'Overload', crit: 0.25, per: 2, text: l => '+' + pc(l.crit) + ' crit chance, and each 1% of it above 100% gives +' + l.per + '% crit damage' },
  motion:   { name: 'Perpetual motion', chance: 0.25, text: l => 'Ultimates have a ' + pc(l.chance) + ' chance to keep their energy' },
  gate:     { name: 'Iron gate', text: () => 'The first enemy to get through each wave costs no lives (not bosses)' },
  collector: { name: 'Collector', every: 3, text: l => 'Every ' + l.every + 'rd relic you take from now on counts twice' },
  /* for one class */
  bladestorm: { name: 'Bladestorm', hero: 'warrior', every: 5, reach: 2, text: l => 'Every ' + l.every + 'th attack is followed by a spin that hits everything around at double range' },
  ricochet: { name: 'Ricochet', hero: 'ranger', reach: 110, scale: 0.7, speed: 620, text: l => 'Projectiles bounce to one more enemy for ' + pc(l.scale) + ' of the hit' },
  echo:     { name: 'Arcane echo', hero: 'mage', delay: 1, power: 0.5, text: l => 'The ultimate fires again ' + l.delay + ' second later at half strength' },
  mark:     { name: 'Death mark', hero: 'rogue', share: 0.08, text: l => 'Crits kill enemies under ' + pc(l.share) + ' life (not bosses)' },
  overgrowth: { name: 'Overgrowth', hero: 'druid', count: 2, radius: 80, text: l => 'Roots spread to ' + l.count + ' enemies close by' },
  light:    { name: 'Lasting light', hero: 'priest', times: 2, radius: 100, seconds: 3, damage: 0.1,
    text: l => 'Buffs from the Priest last twice as long, and each attack gives the heroes close by +' + pc(l.damage) + ' damage for ' + l.seconds * l.times + ' s' },
  souls:    { name: 'Soul harvest', hero: 'warlock', per: 0.005, max: 100, hex: 0.0025,
    text: l => 'Each kill by the Warlock gives +' + pc(l.per) + ' damage for the match, up to ' + pc(l.per * l.max) + '. For the Occult: deaths of Hexed enemies count, and each makes the Hex ' + pc(l.hex) + ' stronger' },
  wrath:    { name: 'Day of wrath', hero: 'paladin', every: 10, scale: 3, text: l => 'Every ' + l.every + 'th hit smites for ' + l.scale + ' times as much, as holy damage' },
  gift:     { name: "Ancestors' gift", hero: 'shaman', energy: 20, text: l => 'The ultimate gives your other heroes ' + l.energy + ' energy' }
};
export const LEGENDARIES = Object.fromEntries(Object.entries(L).map(([id, l]) => [id, { id, ...l, desc: l.text(l) }]));
export const GENERAL = Object.keys(LEGENDARIES).filter(id => !LEGENDARIES[id].hero);
export const classLegendary = hero => Object.keys(LEGENDARIES).find(id => LEGENDARIES[id].hero === hero) || null;
