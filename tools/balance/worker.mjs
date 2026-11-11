/* A worker thread for the balance runner: plays the jobs it is sent, one at a time, and sends back the measurements. */
import { parentPort } from 'node:worker_threads';
import { playRun } from '../bot.mjs';

parentPort.on('message', job => {
  try {
    const r = playRun({ ...job.opts, collect: true });
    parentPort.postMessage({ id: job.id, ok: true, metrics: r.metrics });
  } catch (e) {
    parentPort.postMessage({ id: job.id, ok: false, error: String(e && e.stack || e) });
  }
});
