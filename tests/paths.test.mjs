/* Evolution paths chosen before the match, and the form previews they bring (js/content/previews.js, js/engine/preview.js). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { levelMods } from '../js/engine/levels.js';
import { pathPos } from '../js/engine/enemies.js';
import { nearestPathD } from '../js/engine/kits/paladin.js';
import { cleanPaths } from '../js/engine/preview.js';
import { PREVIEWS, everyAt, at } from '../js/content/previews.js';
import { HEROES, T } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { enemyAt } from './helpers.mjs';

const FORMS = HEROES.flatMap(h => h.evolutions[0].choices.map(c => [h.id, c.id]));

/* A world with one hero on a path, placed next to the path, at a level. */
function withPath(heroId, form, level = 1, seed = 5, more = []) {
  const w = createWorld({ seed, stage: 2, lineup: [heroId, ...more], paths: form ? { [heroId]: form } : {} });
  w.gold = 1e6;
  let h;
  for (const [x, y] of w.path.slice(5)) { for (const dy of [1, -1]) if (!h && apply(w, { type: 'place', hero: heroId, cx: x, cy: y + dy }).ok) h = w.heroes[0]; if (h) break; }
  h.level = level; h.lvlMods = levelMods(level); w.statsFor(h);
  w.phase = 'wave'; w.spawnLeft = 0;
  return { w, h };
}
/* A tough enemy standing on the path near the hero (along: px further along the path). */
function onPath(w, h, along = 0, hp = 1e7) {
  const { d } = nearestPathD(w, h.x, h.y), p = { x: 0, y: 0 }, at = Math.max(1, d + along);
  pathPos(w.path, at / T, p);
  return enemyAt(w, p.x, p.y, at, hp);
}
/* Runs the world for some seconds (enemyAt enemies stand still). */
function run(w, seconds) { for (let i = 0; i < 60 * seconds; i++) step(w); }

test('every form has a preview with a description, and paths are cleaned: only first-evolution forms of heroes in the lineup', () => {
  for (const [, form] of FORMS) { assert.ok(PREVIEWS[form], form); assert.ok(PREVIEWS[form].desc, form); }
  assert.deepEqual(cleanPaths({ mage: 'firemage', rogue: 'firemage', ranger: 'hunter', druid: 'nope' }, ['mage', 'rogue', 'druid']), { mage: 'firemage' });
});

test('a hero with a path keeps its own attack and ultimate, carries the form\'s tags from level 1, and evolves only into it', () => {
  const { w, h } = withPath('druid', 'animalic');
  assert.equal(h.def.kind, 'bolt'); assert.equal(h.def.ultimate, 'grasp');
  assert.ok(h.def.tags.includes('minion') && h.def.tags.includes('melee'), 'the form\'s tags');
  h.level = 10;
  assert.equal(apply(w, { type: 'evolve', id: h.id, choice: 1 }).reason, 'path', 'not another form');
  assert.ok(apply(w, { type: 'evolve', id: h.id }).ok, 'no choice needed');
  assert.equal(h.def.form, 'animalic'); assert.equal(h.preview, null); assert.equal(h.echo, null);
});

test('a form with its own attribute swaps the values: the Animalic Druid is dexterity, with the Druid\'s intellect', () => {
  const druid = HEROES.find(x => x.id === 'druid');
  const { w, h } = withPath('druid', 'animalic', 10);
  const lvl = h.s.intellect - druid.stats.intellect;   /* the points from levels */
  assert.equal(h.echo.def.attribute, 'dexterity');
  assert.ok(Math.abs(h.echo.s.dexterity - h.s.intellect) < 1e-9, 'the pup already uses the dexterity he will have');
  apply(w, { type: 'evolve', id: h.id });
  assert.equal(h.def.attribute, 'dexterity');
  assert.ok(Math.abs(h.s.dexterity - (druid.stats.intellect + lvl) * 1.25) < 1e-9, 'levels carry over (and the evolution adds 25%)');
  assert.ok(Math.abs(h.s.intellect - (druid.stats.dexterity + 9) * 1.25) < 1e-9, 'the Druid\'s dexterity, +1 a level');
});

test('"every Nth" previews: the form\'s own attack, about once in N attacks, credited to the hero, and the base attack slows to match', () => {
  for (const [heroId, form] of FORMS.filter(([, f]) => PREVIEWS[f].every)) {
    const { w, h } = withPath(heroId, form);
    const plain = withPath(heroId, null).h;
    const n = everyAt(PREVIEWS[form].every, 1);
    assert.ok(Math.abs(h.s.cooldown - plain.s.cooldown * n / (n - 1)) < 1e-9, form + ': base attack slower');
    onPath(w, h, 0); onPath(w, h, -T); onPath(w, h, -2 * T);
    let echo = 0, base = 0;
    w.ev.on('damage', ({ hero, amount }) => { if (hero === h.echo) echo += amount; else if (hero === h) base += amount; });
    const seen = new Set(); for (let i = 0; i < 60 * 12; i++) { step(w); for (const z of w.zones) if (z.owner === h.echo) seen.add(z.type); }
    /* thorns grow ahead of the enemies, so enemies that stand still never step in: check the patches instead */
    if (form === 'naturist') assert.ok(seen.has('thorns'), 'naturist: thorns'); else assert.ok(echo > 0, form + ': the form\'s attack');
    assert.ok(base > 0, form + ': the base attack');
    assert.ok(h.dealt >= echo + base - 1e-6, form + ': credited to the hero');
    assert.equal(h.echo.energy, 0); assert.ok(h.ults > 0 || h.energy > 0, form + ': energy still fills');
  }
});

test('previews grow with level: fewer attacks between form attacks, a larger converted share', () => {
  assert.equal(everyAt(PREVIEWS.commander.every, 1), 5); assert.equal(everyAt(PREVIEWS.commander.every, 9), 3); assert.equal(everyAt(PREVIEWS.commander.every, 20), 3);
  const a = withPath('mage', 'firemage', 1).h, b = withPath('mage', 'firemage', 9).h;
  assert.ok(Math.abs(a.def.convert.fire - 0.2) < 1e-9 && Math.abs(b.def.convert.fire - 0.5) < 1e-9);
  assert.ok(b.s.burnChance > a.s.burnChance);
});

test('conversion previews: part of the damage is the form\'s element, with its ailment', () => {
  const { w, h } = withPath('mage', 'firemage', 5);
  const types = {}; w.ev.on('damage', ({ type, amount }) => { types[type] = (types[type] || 0) + amount; });
  const burns = []; w.ev.on('ailment', ({ id }) => burns.push(id));
  const e = onPath(w, h, 0);
  w.attack(h, e);   /* one hit: the converted share exactly (burns come later) */
  assert.ok(Math.abs(types.fire / (types.fire + types.arcane) - h.def.convert.fire) < 1e-9, JSON.stringify(types));
  run(w, 12);
  assert.ok(h.def.tags.includes('fire'));
  assert.ok(burns.includes('burn'), 'it burns');
});

test('companion previews: a weaker, permanent minion (one imp, one totem, a wolf pup); the hero pays a little damage for it', () => {
  for (const [heroId, form, field] of [['druid', 'animalic', 'wolf'], ['warlock', 'summoner', 'imps'], ['shaman', 'totemist', null]]) {
    const { w, h } = withPath(heroId, form, 1), plain = withPath(heroId, null).h;
    assert.ok(Math.abs(h.s.damage - plain.s.damage * (1 - PREVIEWS[form].companion.cut)) < 1e-6, form);
    onPath(w, h, 0);
    let echo = 0; w.ev.on('damage', ({ hero, amount }) => { if (hero === h.echo) echo += amount; });
    run(w, 30);
    assert.ok(echo > 0, form + ' fights');
    if (field === 'wolf') assert.ok(h.echo.wolf);
    if (field === 'imps') assert.ok(h.echo.imps.length <= 1);
    if (!field) assert.ok(w.zones.filter(z => z.type === 'totem' && z.t > 0).length <= 1);
    assert.ok(Math.abs(h.echo.ms.damage / (h.echo.s.damage * (h.echo.s.minionDamage ?? 1)) - at(PREVIEWS[form].companion.power, 1)) < 1e-9, form + ' power');
  }
});

test('aura previews: the form\'s aura, smaller and weaker', () => {
  for (const [heroId, form] of [['priest', 'incantation'], ['warlock', 'occult']]) {
    const { w, h } = withPath(heroId, form, 1);
    assert.equal(h.echo.def.kind, 'aura');
    const full = h.echo.s.range / at(PREVIEWS[form].aura.radius, 1);
    assert.ok(h.echo.s.range < full);
    const e = onPath(w, h, 0);
    run(w, 3);
    assert.ok(e.hp < e.max || (e.fx && e.fx.hex), form);
  }
});

test('the Sentinel pushes, the Inquisitor stacks Verdict up to the cap, the Gospel gives energy, the Crusader rides', () => {
  { const { w, h } = withPath('warrior', 'sentinel', 1); w.wave = 2; const e = onPath(w, h, 0); const d0 = e.d; h.cd = 0; step(w); assert.ok(e.d < d0, 'pushed back'); }
  { const { w, h } = withPath('paladin', 'inquisitor', 1); const e = onPath(w, h, 0); run(w, 6); assert.equal(e.fx.verdict.n, 1, 'one stack at level 1'); }
  { const { w, h } = withPath('paladin', 'inquisitor', 9); const e = onPath(w, h, 0); run(w, 8); assert.equal(e.fx.verdict.n, 3, 'three by level 9'); }
  {
    const { w, h } = withPath('priest', 'gospel', 1, 5, ['warrior']);
    let ally;
    for (let cx = 0; cx < 12 && !ally; cx++) for (let cy = 0; cy < 8 && !ally; cy++)
      if (Math.hypot((cx + 0.5) * T - h.x, (cy + 0.5) * T - h.y) < 90 && apply(w, { type: 'place', hero: 'warrior', cx, cy }).ok) ally = w.heroes.at(-1);
    onPath(w, h, 0); const before = ally.energy; h.cd = 0; step(w); step(w);
    assert.ok(ally.energy >= before + at(PREVIEWS.gospel.energy, 1) - 1e-9, 'energy for the hero nearby');
  }
  { const { h } = withPath('paladin', 'crusader', 1); assert.equal(h.def.mounted, true); assert.equal(h.echo.def.kind, 'charge'); }
});

test('a match with a path replays exactly, and the evolution happens in the planned form', () => {
  for (const [heroId, form] of [['druid', 'animalic'], ['rogue', 'toxicologist'], ['warlock', 'occult'], ['paladin', 'crusader']]) {
    const w = createWorld({ seed: 7, stage: 2, lineup: [heroId], paths: { [heroId]: form } });
    for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'place', hero: heroId, cx: x, cy: y + 1 }).ok || apply(w, { type: 'place', hero: heroId, cx: x, cy: y - 1 }).ok) break; }
    apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
    const h = w.heroes[0];
    while (w.phase !== 'over' && (h.level < 10 || w.gold < 150)) step(w);
    if (w.phase !== 'over') assert.ok(apply(w, { type: 'evolve', id: h.id }).ok);
    for (let i = 0; i < 60 * 30 && w.phase !== 'over'; i++) step(w);
    if (h.tier) assert.equal(h.def.form, form);
    const log = exportLog(w);
    assert.deepEqual(log.paths, { [heroId]: form });
    assert.equal(hashWorld(replay(log)), hashWorld(w), form);
  }
});
