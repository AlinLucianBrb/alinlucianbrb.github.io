/* The second evolution: at UPGRADE_LEVEL a form upgrades its basic attack, takes a passive that builds on other heroes'
   debuffs (the synergies, js/content/synergies.js and js/engine/synergy.js), or upgrades its ultimate. Three choices per form,
   in that order; a choice is { id, name, short } plus the numbers its effect uses. The engine asks upgradeOf(hero, id) (js/engine/
   upgrades.js) where the effect happens: the form's behavior, its ultimate, or a hook in js/engine/kits/upgrades.js.
   An upgrade gives no stats. Tiles are 40 px; scale and share are parts of a normal hit. */
export const UPGRADE_LEVEL = 30;
export const SLOT_NAME = { attack: 'Basic attack', passive: 'Passive', ultimate: 'Ultimate' };
const pair = (form, attack, ultimate) => [form, [{ id: form + '_attack', slot: 'attack', ...attack }, { id: form + '_passive', slot: 'passive', ...PASSIVES[form] }, { id: form + '_ult', slot: 'ultimate', ...ultimate }]];

/* The passives: each one feeds on a debuff that (mostly) another hero puts on enemies. See js/content/synergies.js for the
   shapes (vs/more, per/perStack, distinct, boost, extraStack, revelation, spread). */
const CURSES = ['hex', 'doom', 'mark', 'verdict'];
export const PASSIVES = {
  berserker: { name: 'Venom rage', short: 'Hits deal +30% to poisoned enemies.', vs: ['poison'], more: 0.3 },
  commander: { name: 'Storm-forged', short: 'Hits deal +40% to shocked enemies.', vs: ['shock'], more: 0.4 },
  sentinel: { name: 'Hold the line', short: 'Hits deal +40% to rooted, frozen or stunned enemies.', vs: ['root', 'freeze', 'stun'], more: 0.4 },
  marksman: { name: 'Read the wounds', short: 'Hits deal +15% for every different debuff on the enemy.', distinct: 0.15 },
  boomeranger: { name: 'Open wounds', short: 'Hits deal +40% to bleeding enemies.', vs: ['bleed'], more: 0.4 },
  hunter: { name: 'Blood in the water', short: 'Hits deal +4% for every Poison stack on the enemy (up to +60%).', per: ['poison'], perStack: 0.04, max: 0.6 },
  firemage: { name: 'Flashpoint', short: 'His burns on poisoned enemies burn twice as hard.', boost: { ailment: 'burn', vs: ['poison'], mult: 2 } },
  coldmage: { name: 'Thermal shock', short: 'His freezes on burning enemies last twice as long.', boost: { ailment: 'freeze', vs: ['burn'], mult: 2 } },
  lightningmage: { name: 'Grounded', short: 'Hits deal +40% to rooted enemies.', vs: ['root'], more: 0.4 },
  assassin: { name: 'Prey on the cursed', short: 'Hits deal +60% to Hexed, Doomed, Marked enemies or ones under Verdict.', vs: CURSES, more: 0.6 },
  toxicologist: { name: 'Septic', short: 'Her poison adds 2 stacks at once on bleeding enemies.', extraStack: { ailment: 'poison', vs: ['bleed'] } },
  alchemist: { name: 'Cracked ice', short: 'Hits deal +50% to frozen or slowed enemies.', vs: ['freeze', 'chill'], more: 0.5 },
  animalic: { name: 'Easy prey', short: 'Hits deal +40% to slowed or frozen enemies.', vs: ['chill', 'freeze'], more: 0.4 },
  naturist: { name: 'Venom thorns', short: 'Hits deal +50% to poisoned enemies.', vs: ['poison'], more: 0.5 },
  lunar: { name: 'Charged moonlight', short: 'Hits deal +50% to shocked enemies.', vs: ['shock'], more: 0.5 },
  incantation: { name: 'Purifying hymn', short: 'Hits deal +5% for every Corruption stack on the enemy (up to +50%).', per: ['corruption'], perStack: 0.05, max: 0.5 },
  archangel: { name: 'Divine wrath', short: 'Hits deal +50% to Hexed, Doomed, Marked enemies or ones under Verdict.', vs: CURSES, more: 0.5 },
  gospel: { name: 'Revelation', short: 'Each Psalm gives the heroes around her +20% damage to enemies with any debuff, for 3 seconds.', revelation: 0.2, seconds: 3 },
  occult: { name: 'Festering hex', short: 'A Hexed enemy that dies passes its burn, bleed, poison and Corruption to the nearest enemy.', spread: 60 },
  summoner: { name: 'Hellspawn', short: 'He and his minions deal +50% to burning enemies.', vs: ['burn'], more: 0.5 },
  infernalist: { name: 'Fuel', short: 'Hits deal +50% to poisoned enemies.', vs: ['poison'], more: 0.5 },
  heretic: { name: 'Kindred dark', short: 'Hits deal +30% to Corrupted enemies.', vs: ['corruption'], more: 0.3 },
  inquisitor: { name: 'Weight of sin', short: 'Hits deal +12% for every different debuff on the enemy.', distinct: 0.12 },
  crusader: { name: 'Pin the fallen', short: 'Hits deal +50% to stunned or frozen enemies.', vs: ['stun', 'freeze'], more: 0.5 },
  witchdoctor: { name: 'Plague bearer', short: 'Hits deal +5% for every Poison stack on the enemy (up to +60%).', per: ['poison'], perStack: 0.05, max: 0.6 },
  totemist: { name: 'Elemental attunement', short: 'He and his totems deal +30% to burning, frozen, slowed or shocked enemies.', vs: ['burn', 'freeze', 'chill', 'shock'], more: 0.3 },
  earthcaller: { name: 'Fault line', short: 'Hits deal +50% to rooted or frozen enemies.', vs: ['root', 'freeze'], more: 0.5 }
};

export const UPGRADES = Object.fromEntries([
  /* Warrior */
  pair('berserker', { name: 'Third swing', short: 'Every attack swings three times instead of twice.', swings: 3 },
    { name: 'Bloodlust', short: 'Each kill during Frenzy makes it last 1 second longer (up to 5 more).', per: 1, max: 5 }),
  pair('commander', { name: 'Recall', short: 'The sword flies back to him, hitting everything in its way again.' },
    { name: 'War cry', short: 'Rally also gives the heroes nearby +25% damage.', mods: [{ stat: 'damage', type: 'more', value: 0.25 }] }),
  pair('sentinel', { name: 'Heavy blows', short: 'Swings push enemies back a little.', knock: 0.3 },
    { name: 'Shattering wall', short: 'Barricade lasts 2 seconds, then bursts for 3 times a hit.', seconds: 2, scale: 3, radius: 60 }),
  /* Hunter */
  pair('marksman', { name: 'Gathering force', short: 'Each enemy an arrow goes through makes it 15% stronger for the next.', more: 0.15 },
    { name: 'Wide ring', short: 'Ricochet ring is twice as big and lasts 4 seconds.', radius: 2, seconds: 4 }),
  pair('boomeranger', { name: 'Twin throw', short: 'Throws a second boomerang at 60% damage.', scale: 0.6, spread: 0.4 },
    { name: 'Twin blades', short: 'Two blades spin around him instead of one.', blades: 2 }),
  pair('hunter', { name: 'Bursting arrows', short: 'Arrows splash, hurting and poisoning the enemies near the target.', radius: 40, scale: 0.3, poison: 0.5 },
    { name: 'Venom field', short: 'Lays 5 traps, each leaving a puddle of poison.', count: 5, max: 10, radius: 34, seconds: 4 }),
  /* Mage */
  pair('firemage', { name: 'Fireball', short: 'Bolts explode for half damage around the target.', radius: 45, scale: 0.5 },
    { name: 'Wildfire', short: 'Inferno burns twice as hard, and enemies that die from it explode.', burn: 2, seconds: 4, radius: 50, scale: 1 }),
  pair('coldmage', { name: 'Deep freeze', short: 'Hits on slowed enemies have a 20% chance to freeze them.', chance: 0.2 },
    { name: 'Frostbite', short: 'Enemies hit by Blizzard take 30% more damage for 3 seconds.', seconds: 3 }),
  pair('lightningmage', { name: 'Arc', short: 'Bolts jump to 2 more enemies for 60% damage.', jumps: 2, reach: 80, scale: 0.6 },
    { name: 'Chasing storm', short: 'The storm lasts 5 seconds and follows the leading enemy.', seconds: 5, speed: 120 }),
  /* Rogue */
  pair('assassin', { name: 'Killing spree', short: 'A kill strikes the next enemy at once (up to 3 times).', chain: 3 },
    { name: 'Finishing cut', short: 'Shadow clones kill non-bosses left under 15% life.', execute: 0.15 }),
  pair('toxicologist', { name: 'Third dagger', short: 'Throws a third dagger at another enemy.' },
    { name: 'Outbreak', short: 'Enemies that die in the puddle leave a smaller one behind.', radius: 28, seconds: 4 }),
  pair('alchemist', { name: 'Volatile mix', short: 'Concoctions splash for half damage around the target.', radius: 40, scale: 0.5 },
    { name: 'Scorched earth', short: 'Puddles that explode leave burning ground for 3 seconds.', radius: 44, seconds: 3, every: 0.5, scale: 0.3 }),
  /* Druid */
  pair('animalic', { name: 'Blood scent', short: 'The wolf bites bleeding enemies 50% harder.', more: 0.5 },
    { name: 'The pack', short: 'Two spirit wolves hunt beside the wolf during Enrage.', wolves: 2, scale: 0.5 }),
  pair('naturist', { name: 'Tangling thorns', short: 'Thorns slow the enemies in them by 30%.', seconds: 0.4 },
    { name: 'Grasping spikes', short: 'Bramble spikes also root enemies for 1 second.', seconds: 1 }),
  pair('lunar', { name: 'Waxing light', short: 'The beam grows 10% stronger every second on the same enemy (up to +100%).', perSecond: 0.1, max: 1 },
    { name: 'Falling moons', short: 'Two smaller moons follow the first, for half its damage each.', moons: 2, gap: 0.4, radius: 0.7, scale: 0.5 }),
  /* Priest */
  pair('incantation', { name: 'Hymn of precision', short: 'Heroes in the aura also have +10% crit chance.', mods: [{ stat: 'critChance', type: 'flat', value: 0.1 }] },
    { name: 'Final note', short: 'Crescendo ends in a burst of holy light: 10 times a pulse.', scale: 10 }),
  pair('archangel', { name: 'Twin lances', short: 'Throws a second lance at another enemy.', lances: 2 },
    { name: 'Last judgement', short: 'When Judgement kills, it falls again on the next enemy (up to 3 times).', again: 3 }),
  pair('gospel', { name: 'Uplifting psalm', short: 'Each Psalm also gives the heroes around her +10% damage for 3 seconds.', seconds: 3, mods: [{ stat: 'damage', type: 'more', value: 0.1 }] },
    { name: 'Great conversion', short: 'Conversion turns 2 enemies.', count: 2 }),
  /* Warlock */
  pair('occult', { name: 'Withering hex', short: 'Hex also lowers armor and resistances by 15%.', resDown: 0.15 },
    { name: 'Spreading doom', short: 'Enemies caught in a Doom explosion are Doomed too.', seconds: 2 }),
  pair('summoner', { name: 'Imp swarm', short: 'Up to 5 imps instead of 3.', max: 5 },
    { name: 'Parting fire', short: 'The Greater Demon explodes for 6 times a hit when it leaves.', scale: 6, radius: 70 }),
  pair('infernalist', { name: 'Lasting flames', short: 'Burning ground lasts twice as long.', longer: 2 },
    { name: 'Molten crater', short: 'The meteor leaves a burning crater for 5 seconds.', seconds: 5, every: 0.5, scale: 0.4 }),
  /* Paladin */
  pair('heretic', { name: 'Whirling flail', short: 'The flail hits everything around him.' },
    { name: 'Burning creed', short: "During Heresy every hero's hits have a 30% chance to burn.", chance: 0.3 }),
  pair('inquisitor', { name: 'Forked chain', short: 'The chain strikes a second enemy.' },
    { name: 'Guilty verdict', short: 'Purge also adds 5 stacks of Verdict to every enemy in range.', stacks: 5 }),
  pair('crusader', { name: 'Long spear', short: 'The lunge reaches 50% further.', reach: 1.5 },
    { name: 'Pinned', short: 'Enemies that Spear throw slams into a wall take double damage.', times: 2 }),
  /* Shaman */
  pair('witchdoctor', { name: 'Tight knots', short: 'Darts link 3 enemies to the target instead of 2, sharing 40% of the damage.', others: 3, share: 0.4 },
    { name: 'Returning swarm', short: 'The swarm flies the path back again.' }),
  pair('totemist', { name: 'Bursting totems', short: 'Totems explode for 3 times a hit when their time is up.', scale: 3, radius: 60 },
    { name: 'Overcharge', short: 'Totems act 50% faster for 6 seconds after a Totem surge.', seconds: 6, faster: 0.5 }),
  pair('earthcaller', { name: 'Aftershock', short: 'An aftershock follows every fissure for half its damage.', scale: 0.5, delay: 0.45 },
    { name: 'Broken ground', short: 'Tectonic shift also slows every enemy to half speed for 4 seconds.', seconds: 4 })
]);
