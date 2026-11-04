/* Plays the levels with the bot many times and prints how hard they are.
   Usage: npm run balance -- [--form firemage|coldmage|lightningmage] [--runs 8] [--stages 1,2,3,4,5] [--strategies trio,warrior,ranger,mage] [--level 1] [--seed 1]
   --level is the player level (talent points = level - 1). Level 1 shows the raw difficulty with no talents. */
import { playRun, STRATEGIES } from './bot.mjs';
import { STAGES } from '../js/content/data.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const runs = +(args.runs || 8), level = +(args.level || 1), seed0 = +(args.seed || 1), form = args.form || 'firemage';
const stages = (args.stages || '1,2,3,4,5').split(',').map(Number);
const strategies = (args.strategies || Object.keys(STRATEGIES).join(',')).split(',');

console.log(`Bot balance report: ${runs} runs per row, player level ${level}${level > 1 ? ' (' + (level - 1) + ' talent points)' : ' (no talents)'}, Mage evolves into ${form}`);
console.log('Level | Strategy  | Win %  | Avg wave reached | Avg lives left | Avg minutes of play');
console.log('------+-----------+--------+------------------+----------------+--------------------');
const t0 = Date.now();
for (const stage of stages) for (const strategy of strategies) {
  let wins = 0, waves = 0, lives = 0, ticks = 0;
  for (let i = 0; i < runs; i++) {
    const { result } = playRun({ seed: seed0 + i, stage, strategy, level, form });
    if (result.won) wins++;
    waves += result.waves; lives += result.lives; ticks += result.ticks;
  }
  const max = STAGES[stage - 1].waves;
  console.log(`  ${stage}   | ${strategy.padEnd(9)} | ${String(Math.round(wins / runs * 100)).padStart(4)}%  | ${(waves / runs).toFixed(1).padStart(6)} of ${String(max).padEnd(2)}   | ${(lives / runs).toFixed(1).padStart(10)}     | ${(ticks / runs / 3600).toFixed(1).padStart(10)}`);
}
console.log(`(took ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
