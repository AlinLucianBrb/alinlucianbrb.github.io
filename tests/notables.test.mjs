/* The unique effects at the end of the talent tracks (v0.79): the combat ones in a fight, the quality-of-life ones in a match. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RARITIES } from '../js/content/data.js';
import { PROC } from '../js/content/effect-stats.js';
import { NODES, pathTo } from '../js/content/talents.js';
import { fmtMod } from '../js/content/format.js';
import { createWorld, recalc } from '../js/engine/world.js';
import { apply } from '../js/engine/commands.js';
import { trackFocus } from '../js/engine/procs.js';
import { applyEffect } from '../js/engine/effects.js';
import { attackMult } from '../js/engine/ultimates.js';
import { richWorld, place, enemyAt } from './helpers.mjs';

/* A Warrior with one effect stat on and fixed rolls. */
function setup(stat, v, roll = 0.5) {
  const w = richWorld({ stage: 2, lineup: ['warrior', 'ranger', 'mage'] }); w.lives = 20;
  let t; for (let y = 0; y < 8 && !t; y++) for (let x = 0; x < 12; x++) if (!w.pathSet.has(x + ',' + y)) { t = [x, y]; break; }
  const h = place(w, 'warrior', ...t);
  w.mods.push({ stat, type: 'flat', value: v, scope: ['all'], source: 'test', ri: 0 });
  recalc(w); w.rng.combat.next = () => roll;
  return { w, h, at: (dx = 20, hp = 1e6) => enemyAt(w, h.x + dx, h.y, 0, hp) };
}
const hit = (w, h, e, as) => { const b = e.hp; w.attack(h, e, 1, 1, as); return b - e.hp; };
const all = key => pathTo(new Set(), 't6_' + key + '_n');

test('Relentless (Physical): more damage the longer an enemy stays in range, up to the cap; it starts again when the enemy leaves', () => {
  const { w, h, at } = setup('focus', 0.1), e = at(), a = hit(w, h, e);
  trackFocus(w, h, 3); const b = hit(w, h, e);
  assert.ok(Math.abs(b / a - 1.3) < 0.05, '3 s: +30% (' + (b / a) + ')');
  trackFocus(w, h, 60); assert.ok(hit(w, h, e) / a < 1 + 0.1 * PROC.focusMost + 0.05, 'capped');
  e.x += 1e4; trackFocus(w, h, 0.1); e.x -= 1e4; trackFocus(w, h, 0.01);
  assert.ok(Math.abs(hit(w, h, e) / a - 1) < 0.01, 'left the range: back to the start');
});

test('Hoarfrost (Cold): every 5th cold hit on a chilled enemy freezes it', () => {
  const { w, h, at } = setup('deepFreeze', 1), e = at();
  for (let k = 0; k < 4; k++) hit(w, h, e, 'cold');
  assert.ok(!(e.fx && e.fx.freeze), 'not chilled: nothing counts');
  applyEffect(e, 'chill', { t: 30, slow: 0.3 }, h);
  for (let k = 0; k < PROC.chillHits - 1; k++) hit(w, h, e, 'cold');
  assert.ok(!e.fx.freeze); hit(w, h, e, 'cold'); assert.ok(e.fx.freeze, 'the 5th freezes it');
});

test('Judgement (Holy): a killing holy hit passes its extra damage to the nearest enemy', () => {
  const { w, h, at } = setup('overkill', 1), weak = at(20, 1), next = at(40);
  hit(w, h, weak, 'holy');
  assert.ok(weak.dead); assert.ok(next.max - next.hp > 0, 'the overkill reached the next enemy');
  const p = setup('overkill', 1), a = p.at(20, 1), b = p.at(40); hit(p.w, p.h, a, 'physical');
  assert.equal(b.hp, b.max, 'only holy hits');
});

test('Bloodbond (Minion) gives energy for minion kills; Second Wind (Energy) sometimes keeps the bar', () => {
  const { w, h, at } = setup('feed', 3), e = at(20, 1), b = h.energy;
  w.attack(h, e, 1, 1, null, h.ms || (h.ms = { ...h.s }));
  assert.ok(e.dead && h.energy >= b + 3, 'a minion kill feeds the hero');
  for (const [roll, kept] of [[0.1, true], [0.5, false]]) {
    const s = setup('thrift', 0.2, roll); s.h.energy = s.h.s.energyMax;
    attackMult(s.w, s.h, s.at());
    assert.equal(s.h.energy === s.h.s.energyMax, kept, 'roll ' + roll);
  }
});

test('Economy, Merchant, Relics, Training, Bounty: their notables change the match', () => {
  /* Compounding: interest doubled on a boss wave. */
  const ec = createWorld({ seed: 2, talents: all('economy') });
  assert.equal(ec.gs.bossInterest, 1);
  /* Grand Bazaar: the weakest offer is one rarity better than without it. */
  const offers = on => { const w = createWorld({ seed: 5 }); w.gold = 1e6; if (on) { w.mods.push({ stat: 'betterOffer', type: 'flat', value: 1, scope: 'global', source: 'test' }); recalc(w); }
    apply(w, { type: 'buyRelic' }); return w.pick.offers.map(o => o.ri); };
  const was = offers(false), now = offers(true), low = was.indexOf(Math.min(...was));
  assert.equal(now[low], Math.min(RARITIES.length - 1, was[low] + 1), 'the weakest is bumped');
  assert.equal(now.reduce((a, b) => a + b), was.reduce((a, b) => a + b) + (was[low] < RARITIES.length - 1 ? 1 : 0), 'and only it');
  /* Relic Hunter: a free reroll every wave. */
  const rh = createWorld({ seed: 1, talents: all('relics') }); rh.players[0].rerolls = 0;
  apply(rh, { type: 'wave' }); assert.equal(rh.players[0].rerolls, 1);
  /* Veterans and Trophy Hunter are tested in talents.test.mjs (free evolution) and here: */
  assert.equal(createWorld({ seed: 1, talents: all('bounty') }).gs.bossXp, 1);
  assert.equal(createWorld({ seed: 1, talents: all('headstart') }).gs.bossXp, 0);
});

test('every notable says what it does', () => {
  for (const id of ['t6_economy_n', 't6_merchant_n', 't6_relics_n', 't6_training_n', 't6_rewards_n', 't6_loot_n', 't6_bounty_n', 't6_physical_n', 't6_cold_n', 't6_holy_n', 't6_minion_n', 't6_energy_n'])
    assert.ok(!/undefined|NaN/.test(NODES.get(id).mods.map(fmtMod).join(' ')) && NODES.get(id).desc.length > 20, id);
});

test('the server: Pioneer pays more on a level not cleared yet; Hoard lets one found item be rerolled, once, by its owner', () => {
  for (const f of ['supabase-setup.sql', 'supabase-update.sql']) {
    const sql = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(sql.includes("fresh := (not endless and r.stage > me.levels_cleared)"), f);
    assert.ok(sql.includes('if fresh then b_gold := b_gold + b_new; b_xp := b_xp + b_new; end if;'), f);
    assert.ok(sql.includes("alter table public.runs add column if not exists rerolls int not null default 0;"), f);
    assert.ok(sql.includes('create or replace function public.reroll_drop(p_run uuid, p_item uuid) returns jsonb'), f);
    for (const check of ["if r.rerolls < 1 then raise exception 'no reroll left'", "if not (p_item = any (r.drops))", "where id = p_run and user_id = auth.uid() for update",
      "raise exception 'take the item off before rerolling it'", 'set rerolls = rerolls - 1'])
      assert.ok(sql.includes(check), f + ': ' + check);
    assert.ok(sql.includes('revoke all on function public.reroll_drop(uuid, uuid) from public, anon, authenticated;') && sql.includes('grant execute on function public.reroll_drop(uuid, uuid) to authenticated;'), f);
  }
});
