import test from 'node:test';
import assert from 'node:assert/strict';
import { modeFromEnv } from './mode';

test('static without VERCEL, git on Vercel, postgres on Vercel with DATABASE_URL', () => {
  assert.equal(modeFromEnv({}), 'static');
  assert.equal(modeFromEnv({ VERCEL: '1' }), 'git');
  assert.equal(modeFromEnv({ VERCEL: '1', DATABASE_URL: 'postgres://x' }), 'postgres');
});

test('DATABASE_URL without VERCEL fails with an explanation', () => {
  assert.throws(() => modeFromEnv({ DATABASE_URL: 'postgres://x' }), /Postgres mode only runs on Vercel/);
});
