/* Map effects: rules of the place. Each act 5 level has its own (MAP_EFFECT_OF). The engine side is js/engine/map-effects.js.
   mods: modifiers for every hero (or only those with a tag in scope); flags: for w.fxm, like a match effect's. */
export const MAP_EFFECTS = {
  mud:       { name: 'Mud',       color: '#9a7a4a', text: 'Enemies are 15% slower; heroes attack and cast 10% slower.', flags: { enemySpeed: 0.85 },
    mods: [{ stat: 'speed', type: 'more', value: -0.1, scope: ['all'] }, { stat: 'castSpeed', type: 'more', value: -0.1, scope: ['all'] }] },
  fog:       { name: 'Fog',       color: '#b8c4cc', text: 'Heroes have 20% less range; enemies are 10% slower.', flags: { enemySpeed: 0.9 }, mods: [{ stat: 'range', type: 'more', value: -0.2, scope: ['all'] }] },
  ley:       { name: 'Ley lines', color: '#5fd6e8', text: 'Heroes on one of the 4 glowing tiles deal 30% more damage; the others 5% less.', tiles: 4, on: 0.3, off: -0.05 },
  storm:     { name: 'Storm',     color: '#ffe45c', text: 'Every 8 seconds lightning takes 5% of the life of 3 enemies and stuns a hero for 1 second.', every: 8, targets: 3, share: 0.05, stun: 1 },
  overgrown: { name: 'Overgrown', color: '#5f9a4a', text: 'The tiles next to the road cannot be used; melee heroes have 50% more range.', mods: [{ stat: 'range', type: 'more', value: 0.5, scope: ['melee'] }] }
};
/* The campaign's: level number -> effect (21 to 25 are 5-1 to 5-5). */
export const MAP_EFFECT_OF = { 21: 'mud', 22: 'fog', 23: 'ley', 24: 'storm', 25: 'overgrown' };
