import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import admin from './admin';

test('routes and settings resolve against config.root, not the working directory', () => {
  const root = process.cwd();
  const injected: { pattern: string; entrypoint: string }[] = [];
  const cwd = fs.mkdtempSync(`${os.tmpdir()}/admin-integration-`);
  const vercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  process.chdir(cwd);
  try {
    const setup = admin().hooks['astro:config:setup'] as (options: unknown) => void;
    setup({
      command: 'build',
      config: { root: pathToFileURL(`${root}/`) },
      injectRoute: (r: { pattern: string; entrypoint: string }) => injected.push(r),
      logger: { warn: () => {} },
      updateConfig: () => {},
    });
  } finally {
    process.chdir(root);
    fs.rmSync(cwd, { recursive: true });
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
  }
  const me = injected.find((r) => r.pattern === '/api/admin/me');
  assert.ok(me, 'API routes found under config.root');
  assert.ok(fs.existsSync(me.entrypoint), me.entrypoint);
  assert.ok(injected.every((r) => fs.existsSync(r.entrypoint)));
});
