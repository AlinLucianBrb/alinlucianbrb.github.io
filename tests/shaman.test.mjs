/* The Shaman and his forms: chain lightning and Ancestral call; Witch Doctor (darts, Voodoo link, locusts); Totemist (totems
   that block their tile, Totem surge); Earthcaller (Fissure with a stun, Tectonic shift's knockback). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, createWorld } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { BEHAVIORS } from '../js/engine/behaviors.js';
import { updateProjectiles } from '../js/engine/projectiles.js';
import { updateZones } from '../js/engine/zones.js';
import { tickEffects } from '../js/engine/effects.js';
import { levelMods } from '../js/engine/levels.js';
import { ULTIMATES } from '../js/engine/ultimates.js';
import { pathPos } from '../js/engine/enemies.js';
import { ANCESTRAL, LINK, LOCUSTS, TOTEM, SURGE, FISSURE, TECTONIC, voodoo } from '../js/engine/kits/shaman.js';
import { nearestPathD } from '../js/engine/kits/paladin.js';
import { HEROES, T } from '../js/content/data.js';
import { exportLog, replay } from '../js/engine/replay.js';
import { hashWorld } from '../js/engine/hash.js';
import { richWorld, place, enemyAt, dealt } from './helpers.mjs';

const FORMS = ['witchdoctor', 'totemist', 'earthcaller'];
function setup(lineup = ['shaman', 'warrior'], seed = 5) {
  const w = richWorld({ seed, lineup });
  let h;
  for (const [x, y] of w.path.slice(5)) { for (const dy of [1, -1]) { if (!h && x >= 0 && x < 16 && y + dy >= 0 && y + dy < 10 && apply(w, { type: 'place', hero: 'shaman', cx: x, cy: y + dy }).ok) h = w.heroes.at(-1); } if (h) break; }
  h.level = 10; h.lvlMods = levelMods(10); w.statsFor(h);
  return { w, h };
}
const evolveTo = (w, h, form) => assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
const tick = (w, h, n = 1) => { for (let i = 0; i < n; i++) { BEHAVIORS[h.def.kind].update(w, h, 1 / 60); updateProjectiles(w, 1 / 60); updateZones(w, 1 / 60); } };
const full = h => { h.energy = h.s.energyMax; };
function onPath(w, h, along = 0, hp = 1e6, type = 'grunt') {
  const { d } = nearestPathD(w, h.x, h.y), p = { x: 0, y: 0 }, at = Math.max(1, d + along);
  pathPos(w.path, at / T, p);
  return enemyAt(w, p.x, p.y, at, hp, type);
}

test('the Shaman: chain lightning (3 enemies), strength; Ancestral call speeds up the heroes near him; three forms', () => {
  const d = HEROES.find(h => h.id === 'shaman');
  assert.equal(d.attribute, 'strength'); assert.equal(d.kind, 'chain'); assert.equal(d.stats.jumps, 2);
  assert.deepEqual(d.evolutions[0].choices.map(c => c.id), FORMS);
  for (const c of [d, ...d.evolutions[0].choices]) assert.ok(ULTIMATES[c.ultimate], c.ultimate);
  const { w, h } = setup();
  const es = [0, 10, 20, 30].map(k => onPath(w, h, k));
  h.cd = 0; tick(w, h, 1);
  assert.equal(es.filter(e => dealt(e) > 0).length, 3, 'the first and two jumps');
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(h.buffs.some(b => b.id === 'ancestral'));
  assert.equal(ANCESTRAL.seconds, 6);
});

test('Witch Doctor: darts link the target with 2 nearby enemies; 30% of the damage one takes goes to the others; locusts poison down the path', () => {
  const { w, h } = setup(['shaman']);
  evolveTo(w, h, 'witchdoctor');
  const a = onPath(w, h, 0), b = onPath(w, h, 8), c = onPath(w, h, 16), far = onPath(w, h, 4 * T);
  const grp = voodoo(w, a);
  assert.equal(grp.members.length, 3); assert.ok(!grp.members.includes(far));
  w.hit(h, a, 100);
  assert.ok(Math.abs(dealt(b) - 100 * LINK.share) < 1e-6 && Math.abs(dealt(c) - 100 * LINK.share) < 1e-6, 'shared');
  assert.equal(dealt(far), 0);
  w.hit(h, b, 100);
  assert.ok(Math.abs(dealt(a) - (100 + 100 * LINK.share)) < 1e-6, 'any member passes it on, but passed-on damage is not passed again');
  tickEffects(w, a, LINK.seconds + 0.1); assert.ok(!a.fx.link, 'ends after 4 s');
  /* darts poison */
  w.enemies.length = 0;
  const e = onPath(w, h, 0); h.cd = 0; tick(w, h, 30);
  assert.ok(e.fx && e.fx.poison, 'always poison');
  /* locusts */
  w.enemies.length = 0; w.projs.length = 0;
  const end = (w.path.length - 1.001) * T, p = { x: 0, y: 0 }; pathPos(w.path, (end - 5 * T) / T, p);
  const x = enemyAt(w, p.x, p.y, end - 5 * T);   /* 5 tiles from the gate */
  onPath(w, h, 0);                                /* something in range, so the ultimate can fire */
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(w.projs.some(p => p.type === 'swarm'));
  for (let i = 0; i < 60 * LOCUSTS.seconds; i++) updateProjectiles(w, 1 / 60);
  assert.ok(x.fx && x.fx.poison && x.fx.poison.stacks.length > 1, 'the swarm passed over it');
});

test('Totemist: each cast plants a totem (Flame, Frost, Storm in turn, up to 3); a totem blocks its tile; Totem surge', () => {
  const { w, h } = setup(['shaman', 'warrior']);
  evolveTo(w, h, 'totemist');
  const e = onPath(w, h, 0);
  for (let i = 0; i < 4; i++) { h.cd = 0; tick(w, h, 1); }
  const mine = () => w.zones.filter(z => z.type === 'totem' && z.t > 0);
  assert.equal(mine().length, TOTEM.max, 'never more than 3');
  assert.deepEqual(new Set(mine().map(z => z.kind)).size, 3, 'all three kinds');
  const z = mine()[0];
  assert.equal(apply(w, { type: 'place', hero: 'warrior', cx: z.cx, cy: z.cy }).reason, 'blocked', 'the tile is taken');
  tick(w, h, 120);
  assert.ok(dealt(e) > 0, 'the totems fight');
  /* Totem surge refreshes them */
  for (const q of mine()) q.t = 1;
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(mine().every(q => q.t > TOTEM.life - 0.1), 'full time again');
  assert.equal(SURGE.scale, 4);
  /* and they go when their time is up */
  h.mods.push({ stat: 'castSpeed', type: 'more', value: -0.99, scope: ['all'], source: 'test', ri: -2 }); w.statsFor(h);   /* no new ones */
  for (let i = 0; i < 60 * (TOTEM.life + 1); i++) updateZones(w, 1 / 60);
  assert.equal(mine().length, 0);
  assert.ok(apply(w, { type: 'place', hero: 'warrior', cx: z.cx, cy: z.cy }).ok, 'free again');
});

test('Earthcaller: Fissure hits and stuns everyone on the stretch behind the leading enemy; Tectonic shift pushes every enemy back', () => {
  const { w, h } = setup(['shaman']);
  evolveTo(w, h, 'earthcaller');
  w.wave = 2;
  const lead = onPath(w, h, 0), mid = onPath(w, h, -T), past = onPath(w, h, -3 * T);
  h.cd = 0; tick(w, h, 1);
  assert.ok(dealt(lead) > 0 && dealt(mid) > 0, 'on the stretch'); assert.equal(dealt(past), 0, 'beyond it');
  assert.ok(lead.fx.stun && mid.fx.stun);
  assert.equal(tickEffects(w, mid, 0.1), 0, 'held for a moment');
  assert.ok(w.zones.some(z => z.type === 'fissure'));
  /* Tectonic shift */
  w.enemies.length = 0; w.wave = 3;
  const a = onPath(w, h, 0), b = onPath(w, h, 2 * T), boss = onPath(w, h, T, 1e6, 'boss');
  const before = [a.d, b.d, boss.d];
  full(h); h.cd = 0; tick(w, h, 1);
  assert.ok(Math.abs(before[0] - a.d - TECTONIC.knock) < 1e-6 || before[0] - a.d >= FISSURE.length * 0, 'pushed back');
  assert.ok(before[1] - b.d >= TECTONIC.knock - 1e-6, '1.5 tiles');
  assert.ok(Math.abs(before[2] - boss.d - TECTONIC.knock * 0.25) < 1e-6, 'a boss a quarter');
  assert.ok(dealt(a) > 0 && dealt(b) > 0);
});

test('a match with each Shaman form replays exactly, and every form uses its ultimate', () => {
  for (const form of FORMS) {
    const w = createWorld({ seed: 7, stage: 2, lineup: ['shaman'] });
    for (const [x, y] of w.path.slice(4)) { if (apply(w, { type: 'place', hero: 'shaman', cx: x, cy: y + 1 }).ok || apply(w, { type: 'place', hero: 'shaman', cx: x, cy: y - 1 }).ok) break; }
    apply(w, { type: 'auto', on: true }); apply(w, { type: 'wave' });
    const h = w.heroes[0];
    while (w.phase !== 'over' && (h.level < 10 || w.gold < 150)) step(w);
    if (w.phase !== 'over') assert.ok(apply(w, { type: 'evolve', id: h.id, choice: FORMS.indexOf(form) }).ok);
    for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) step(w);
    assert.ok(h.ults > 0 || w.phase === 'over', form + ' used its ultimate');
    assert.equal(hashWorld(replay(exportLog(w))), hashWorld(w), form);
  }
});
