/* Animated heroes (sprites.js HERO_ANIM): each sheet is its frames side by side, and only base heroes animate (forms keep
   their sprites for now). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HERO_ANIM, heroAnim, heroPortrait, SPRITES } from '../js/game/sprites.js';
import { HEROES, evolvedDef } from '../js/content/data.js';

const pngSize = name => { const b = readFileSync(new URL('../assets/' + name + '.png', import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('every animation sheet holds its frames side by side, square, and is in the sprite list', () => {
  for (const A of Object.values(HERO_ANIM)) {
    for (const part of [A.idle, A.attack]) {
      assert.deepEqual(pngSize(part.name), [A.frame * part.frames, A.frame], part.name);
      assert.ok(SPRITES.includes(part.name));
    }
    assert.ok(SPRITES.includes(A.portrait));
  }
});

test('the Warrior and the Hunter animate; evolved forms and heroes without art keep their sprites', () => {
  const w = HEROES.find(h => h.id === 'warrior');
  assert.equal(heroAnim(w), HERO_ANIM.warrior);
  assert.equal(heroAnim(evolvedDef(w, w.evolutions[0].choices[0])), null);
  const r = HEROES.find(h => h.id === 'ranger');
  assert.equal(heroAnim(r), HERO_ANIM.ranger);
  assert.equal(heroAnim(evolvedDef(r, r.evolutions[0].choices[0])), null);
  assert.equal(heroAnim(HEROES.find(h => h.id === 'mage')), null);
  assert.equal(heroPortrait('warrior'), 'portrait_warrior');
  assert.equal(heroPortrait('ranger'), 'portrait_ranger');
  assert.equal(heroPortrait('mage'), 'hero_mage');
});

test('one attack fits inside the hero\'s attack cooldown', () => {
  for (const [id, A] of Object.entries(HERO_ANIM)) assert.ok(A.attack.frames / A.attack.fps <= HEROES.find(h => h.id === id).stats.cooldown, id);
});
