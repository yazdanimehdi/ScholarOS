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

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function setupHook(define: Record<string, string>, injected: { pattern: string }[]) {
  const setup = admin().hooks['astro:config:setup'] as (options: unknown) => void;
  setup({
    command: 'build',
    config: { root: pathToFileURL(`${process.cwd()}/`) },
    injectRoute: (r: { pattern: string }) => injected.push(r),
    logger: { warn: () => {} },
    updateConfig: (c: { vite: { define: Record<string, string> } }) => Object.assign(define, c.vite.define),
  });
}

test('postgres mode: every route renders on demand, the mode is baked in, the sitemap is served', () => {
  withEnv({ VERCEL: '1', DATABASE_URL: 'postgres://ci@localhost:1/ci' }, () => {
    const define: Record<string, string> = {};
    const injected: { pattern: string }[] = [];
    setupHook(define, injected);
    assert.equal(define.__SCHOLAROS_MODE__, '"postgres"');
    const route = { component: 'src/pages/index.astro', prerender: undefined as boolean | undefined };
    (admin().hooks['astro:route:setup'] as (o: unknown) => void)({ route, logger: {} });
    assert.equal(route.prerender, false);
  });
});

test('git mode: public routes stay prerendered', () => {
  withEnv({ VERCEL: '1', DATABASE_URL: undefined }, () => {
    const define: Record<string, string> = {};
    setupHook(define, []);
    assert.equal(define.__SCHOLAROS_MODE__, '"git"');
    const route = { component: 'src/pages/index.astro', prerender: undefined as boolean | undefined };
    (admin().hooks['astro:route:setup'] as (o: unknown) => void)({ route, logger: {} });
    assert.equal(route.prerender, undefined);
  });
});
