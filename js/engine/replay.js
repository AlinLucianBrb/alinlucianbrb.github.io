/* Command logs. A log is { seed, stage, talents, lineup, items, commands: [{ type, ..., t }], ticks }: everything needed to play a run again.
   exportLog() builds one from a live world; replay() plays one back and returns the finished world. */
import { createWorld, step, summary, ENGINE_VERSION } from './world.js';
import { apply } from './commands.js';

export const exportLog = w => ({ ...w.log, commands: w.log.commands.map(c => ({ ...c })), ticks: w.tick, result: summary(w) });

export function replay(log, { maxTicks = 10000000 } = {}) {
  if (log.ver !== ENGINE_VERSION) throw new Error('Log was recorded with engine version ' + log.ver + ' but this is version ' + ENGINE_VERSION);
  const w = createWorld({ seed: log.seed, stage: log.stage, talents: log.talents, lineup: log.lineup, items: log.items, record: false });
  const cmds = log.commands; let i = 0;
  for (;;) {
    while (i < cmds.length && cmds[i].t <= w.tick) {
      const r = apply(w, cmds[i++]);
      if (!r.ok) throw new Error('Command ' + (i - 1) + ' (' + cmds[i - 1].type + ') failed on replay: ' + r.reason);
    }
    if (w.tick >= log.ticks && i >= cmds.length) break;
    if (!step(w)) {
      if (i >= cmds.length) break;
      if (cmds[i].t > w.tick) throw new Error('Log is inconsistent: the game is waiting but the next command is later');
    }
    if (w.tick > maxTicks) throw new Error('Replay ran too long');
  }
  return w;
}

/* Replays a log and compares the outcome with what the log claims. */
export function verify(log) {
  const w = replay(log), got = summary(w), want = log.result;
  const bad = want ? Object.keys(want).filter(k => want[k] !== got[k]) : [];
  return { ok: bad.length === 0, got, mismatches: bad };
}
