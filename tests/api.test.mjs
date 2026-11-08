/* The profile the game keeps after login must carry the account id: co-op knows who is who by it (the lobby host, who is
   connected on the live channel), and saved runs are kept per account. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the profile loaded at login includes the account id', () => {
  const src = readFileSync(new URL('../js/services/api.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function getProfile'), src.indexOf('\n}\n', src.indexOf('export async function getProfile')));
  for (const sel of fn.match(/select\('([^']*)'\)/g)) assert.match(sel, /select\('id,/, 'every profile query asks for the id: ' + sel);
  assert.ok(fn.includes('data.id = data.id || userId'), 'and it is filled in even if the query left it out');
});
