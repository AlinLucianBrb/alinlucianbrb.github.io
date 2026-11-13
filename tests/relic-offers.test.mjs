/* Relic offers: only relics that do something for the match's heroes (their chosen path, or any form with no path),
   economy and gate relics always. Bulk order (cheaper evolutions) is gone. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, relicFits } from '../js/engine/commands.js';
import { RELICS } from '../js/content/data.js';
import { richWorld, place } from './helpers.mjs';

/* Every relic offered over many picks, for a lineup and its paths. */
function offered(lineup, paths = {}) {
  const w = richWorld({ seed: 9, lineup, paths }), seen = new Set();
  let t; for (let cx = 4; !t && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) t = [cx, cy];
  place(w, lineup[0], ...t);
  for (let i = 0; i < 25; i++) { apply(w, { type: 'buyRelic' }); for (const o of w.pick.offers) seen.add(o.relic.name); apply(w, { type: 'choose', index: 0 }); }
  return seen;
}

test('Bulk order (cheaper evolutions) is no longer a relic', () => {
  assert.ok(!RELICS.some(r => r.name === 'Bulk order'));
});

test('a Berserker-path Warrior is offered no spell, projectile or minion relics, but still economy ones', () => {
  const seen = offered(['warrior'], { warrior: 'berserker' });
  for (const name of ['Arcane focus', 'Quick incantation', 'Split bolt', 'Fine arrows', 'Pack leader', 'Holy water']) assert.ok(!seen.has(name), name);
  assert.ok(seen.has('Prospector') || seen.has('Tax collector') || seen.has('Reinforced gate'), 'economy and gate relics still come');
  assert.ok([...seen].every(n => relicFits(RELICS.find(r => r.name === n), { lineup: ['warrior'], paths: { warrior: 'berserker' } })));
});

test('with no path chosen, a relic counts if it helps any of the hero\'s forms', () => {
  const r = RELICS.find(x => x.name === 'Fine arrows');   /* projectiles: the Commander throws his sword */
  assert.ok(relicFits(r, { lineup: ['warrior'], paths: {} }), 'any Warrior form');
  assert.ok(!relicFits(r, { lineup: ['warrior'], paths: { warrior: 'berserker' } }), 'not for a Berserker');
  assert.ok(relicFits(r, { lineup: ['warrior'], paths: { warrior: 'commander' } }), 'for a Commander');
});

test('a Fire Mage gets no melee relics; a caster team gets the spell ones', () => {
  const mage = { lineup: ['mage'], paths: { mage: 'firemage' } };
  for (const name of ['Quick hands', 'Whetstone']) assert.ok(!relicFits(RELICS.find(r => r.name === name), mage), name);
  assert.ok(relicFits(RELICS.find(r => r.name === 'Arcane focus'), mage));
});

test('offers follow the heroes on the map, not the whole lineup; an evolved hero counts only as its form', () => {
  const w = richWorld({ seed: 4, lineup: ['warrior', 'mage'] }), p = w.players[0];
  const fits = name => relicFits(RELICS.find(r => r.name === name), p, w);
  assert.ok(fits('Arcane focus'), 'nothing placed yet: the lineup (a Mage) counts');
  let t; for (let cx = 4; !t && cx < 12; cx++) for (let cy = 2; cy < 8; cy++) if (!w.pathSet.has(cx + ',' + cy)) t = [cx, cy];
  const h = place(w, 'warrior', ...t);
  assert.ok(!fits('Arcane focus'), 'only the Warrior on the map: no spell relics');
  assert.ok(fits('Fine arrows'), 'a basic Warrior with no path could still become a Commander (projectile)');
  h.level = 10; assert.ok(apply(w, { type: 'evolve', id: h.id, choice: 0 }).ok);   /* Berserker */
  assert.ok(!fits('Fine arrows'), 'evolved: only the Berserker counts');
  assert.ok(fits('Prospector'), 'economy relics always');
});

