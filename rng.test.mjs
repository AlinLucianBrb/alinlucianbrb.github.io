import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed } from '../js/engine/rng.js';

test('same seed gives the same sequence, different seeds differ', () => {
  const a = createRng(123), b = createRng(123), c = createRng(124);
  const sa = Array.from({ length: 20 }, () => a.next()), sb = Array.from({ length: 20 }, () => b.next()), sc = Array.from({ length: 20 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

test('values stay in [0, 1) and look evenly spread', () => {
  const r = createRng(7); let sum = 0;
  for (let i = 0; i < 20000; i++) { const x = r.next(); assert.ok(x >= 0 && x < 1); sum += x; }
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.01, 'mean should be close to 0.5');
});

test('int(n) stays in range and reaches every value', () => {
  const r = createRng(99), seen = new Set();
  for (let i = 0; i < 2000; i++) { const x = r.int(6); assert.ok(Number.isInteger(x) && x >= 0 && x < 6); seen.add(x); }
  assert.equal(seen.size, 6);
});

test('forked streams are independent of how much the parent was used', () => {
  const p1 = createRng(5), p2 = createRng(5);
  for (let i = 0; i < 100; i++) p1.next();
  assert.equal(p1.fork('path').next(), p2.fork('path').next());
  assert.notEqual(p2.fork('path').next(), p2.fork('relic').next());
});

test('hashSeed is stable', () => { assert.equal(hashSeed('abc'), hashSeed('abc')); assert.notEqual(hashSeed('abc'), hashSeed('abd')); });
