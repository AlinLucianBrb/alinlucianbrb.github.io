/* What the balance bot measures in a run. attach(w) listens to the world's events and returns a recorder; finish() gives
   the numbers, all plain data (so they can cross worker threads and go into the results file):
   - waves: per wave { lives lost, seconds it took, enemies, boss: seconds the boss lived (or 'escaped') };
   - heroes: per hero { id, form, damage, kills, ults, level, evolvedAt (wave) };
   - gold: earned, spent on evolutions and on relics, left at the end;
   - relics: the ones picked, with rarity; the result and the wave the run was lost on (failWave). */
import { RARITIES } from '../../js/content/data.js';
import { STEP, summary } from '../../js/engine/world.js';
import { waveCount } from '../../js/engine/enemies.js';

function lastWave(cur) {
  if (!cur) return 0;
  const killed = Math.min(1, cur.enemies / Math.max(1, cur.total));
  if (!cur.bossE) return killed;
  const boss = cur.bossE.dead && !cur.bossE.escaped ? 1 : Math.max(0, Math.min(1, 1 - cur.bossE.hp / cur.bossE.max));
  return Math.min(1, 0.5 * killed + 0.5 * boss);
}

export function attach(w) {
  const waves = [], rec = { relicGold: 0, evolveGold: 0, heroGold: 0 };
  let cur = null, lastGold = w.gold;
  w.ev.on('waveStart', ({ wave }) => { cur = { wave, start: w.tick, lives: w.lives, leaks: 0, boss: null, bossT: null, enemies: 0, total: waveCount(wave) }; waves.push(cur); });
  w.ev.on('escape', ({ enemy }) => { if (!cur) return; cur.leaks += enemy.def.leak; if (enemy.def.boss) cur.boss = 'escaped'; });
  w.ev.on('kill', ({ enemy }) => { if (!cur) return; cur.enemies++; if (enemy.def.boss && cur.bossT !== null) cur.boss = +((w.tick - cur.bossT) * STEP).toFixed(1); });
  w.ev.on('waveClear', () => { if (cur) cur.secs = +((w.tick - cur.start) * STEP).toFixed(1); });
  w.ev.on('evolve', ({ hero }) => { hero._evolvedAt = w.wave; });
  return {
    /* Called by the bot after every step: notes when a wave's boss appears (it spawns last). */
    tick() { if (cur && cur.bossT === null && w.enemies.length && w.enemies[w.enemies.length - 1].def.boss) { cur.bossT = w.tick; cur.bossE = w.enemies[w.enemies.length - 1]; } },
    spend(kind, gold) { rec[kind + 'Gold'] += gold; },
    finish() {
      const r = summary(w);
      for (const v of waves) if (v.secs === undefined) v.secs = +((w.tick - v.start) * STEP).toFixed(1);
      return {
        /* cleared: waves fully cleared, plus how much of the last one was done (a finer "how far"): the share of its enemies
           killed, or on a boss wave, half that and half the share of the boss's health taken off, so a boss that got
           through nearly dead counts for more than one that got through untouched */
        cleared: r.won ? w.maxWave : Math.max(0, r.waves - 1) + lastWave(cur),
        won: r.won, waves: r.waves, lives: r.lives, ticks: r.ticks, minutes: +(r.ticks * STEP / 60).toFixed(2), failWave: r.won ? null : r.waves,
        perWave: waves.map(v => ({ wave: v.wave, leaks: v.leaks, secs: v.secs, boss: v.boss })),
        heroes: w.heroes.map(h => ({ id: h.base.id, form: h.def.form || null, path: h.preview ? h.preview.form : null, damage: Math.round(h.dealt), kills: h.kills, ults: h.ults, level: h.level, evolvedAt: h._evolvedAt || null })),
        gold: { left: w.gold, heroes: rec.heroGold, relics: rec.relicGold, evolutions: rec.evolveGold },
        relics: w.relics.map(x => ({ name: x.name, rarity: RARITIES[x.r].name }))
      };
    }
  };
}
