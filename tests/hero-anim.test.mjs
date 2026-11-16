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

test('the new-style heroes animate; evolved forms and heroes without art keep their sprites', () => {
  const w = HEROES.find(h => h.id === 'warrior');
  assert.equal(heroAnim(w), HERO_ANIM.warrior);
  assert.equal(heroAnim(evolvedDef(w, w.evolutions[0].choices[0])), null);
  const r = HEROES.find(h => h.id === 'ranger');
  assert.equal(heroAnim(r), HERO_ANIM.ranger);
  assert.equal(heroAnim(evolvedDef(r, r.evolutions[0].choices[0])), null);
  assert.equal(heroAnim(HEROES.find(h => h.id === 'mage')), HERO_ANIM.mage);
  assert.equal(heroAnim(HEROES.find(h => h.id === 'rogue')), HERO_ANIM.rogue);
  assert.equal(heroAnim(HEROES.find(h => h.id === 'druid')), HERO_ANIM.druid);
  assert.equal(heroAnim(HEROES.find(h => h.id === 'priest')), HERO_ANIM.priest);
  assert.equal(heroAnim(HEROES.find(h => h.id === 'warlock')), HERO_ANIM.warlock);
  assert.equal(heroAnim(HEROES.find(h => h.id === 'paladin')), HERO_ANIM.paladin);
  assert.equal(heroAnim(HEROES.find(h => h.id === 'shaman')), HERO_ANIM.shaman);
  for (const h of HEROES) assert.ok(heroAnim(h), h.id + ' animates');
  assert.equal(heroPortrait('warrior'), 'portrait_warrior');
  assert.equal(heroPortrait('ranger'), 'portrait_ranger');
  assert.equal(heroPortrait('mage'), 'portrait_mage');
  assert.equal(heroPortrait('rogue'), 'portrait_rogue');
  assert.equal(heroPortrait('druid'), 'portrait_druid');
  assert.equal(heroPortrait('priest'), 'portrait_priest');
  assert.equal(heroPortrait('warlock'), 'portrait_warlock');
  assert.equal(heroPortrait('paladin'), 'portrait_paladin');
  assert.equal(heroPortrait('shaman'), 'portrait_shaman');
  assert.equal(heroPortrait('nobody'), 'hero_nobody');
});

test('one attack fits inside the hero\'s attack cooldown', () => {
  for (const [id, A] of Object.entries(HERO_ANIM)) assert.ok(A.attack.frames / A.attack.fps <= HEROES.find(h => h.id === id).stats.cooldown, id);
});

test('every animated hero that shoots has a muzzle point (where its bolts leave it) inside its frame', () => {
  for (const h of HEROES) {
    const A = HERO_ANIM[h.id];
    if (!A || !['bolt', 'chain'].includes(h.kind)) continue;
    assert.ok(A.muzzle, h.id);
    assert.ok(A.muzzle[0] >= 0 && A.muzzle[0] < A.frame && A.muzzle[1] >= 0 && A.muzzle[1] < A.foot[1], h.id);
  }
});
