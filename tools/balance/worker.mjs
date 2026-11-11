/* A worker thread for the balance runner: plays the jobs it is sent, one at a time, and sends back the measurements. */
import { parentPort } from 'node:worker_threads';
import { playRun } from '../bot.mjs';
import { applyFormTuning, FORM_TUNING, STAGES } from '../../js/content/data.js';
import { EFFECTS } from '../../js/engine/effects.js';

/* A job may carry overrides to try a balance change in memory, without editing the game files:
   { forms: { formId: damage multiplier }, hex: Hex's extra damage taken, stages: { n: { hpMult, growth } } }. */
const BASE = { hex: EFFECTS.hex.taken, stages: STAGES.map(s => ({ hpMult: s.hpMult, growth: s.growth })) };
function overrides(o = {}) {
  applyFormTuning({ ...FORM_TUNING, ...(o.forms || {}) });
  EFFECTS.hex.taken = o.hex ?? BASE.hex;
  STAGES.forEach((s, i) => Object.assign(s, BASE.stages[i], (o.stages || {})[s.n] || {}));
}

parentPort.on('message', job => {
  try {
    overrides(job.overrides);
    const r = playRun({ ...job.opts, collect: true });
    parentPort.postMessage({ id: job.id, ok: true, metrics: r.metrics });
  } catch (e) {
    parentPort.postMessage({ id: job.id, ok: false, error: String(e && e.stack || e) });
  }
});
