import { configChange, readConfig } from '../../../../lib/admin/content';
import { commitChanges, json, readBody, route } from '../../../../lib/admin/http';
import { assertConfigFile, configPath } from '../../../../lib/admin/paths';
import { ConflictError } from '../../../../lib/admin/store';

export const prerender = false;

export const GET = route(async ({ params }, store) => {
  const { data, version } = await readConfig(store, assertConfigFile(params.file));
  return json({ data, version });
});

/** Takes the whole object plus the version it was loaded at. */
export const PUT = route(async (ctx, store) => {
  const file = assertConfigFile(ctx.params.file);
  const { data, version = null } = await readBody<{ data?: unknown; version?: string | null }>(ctx);
  const current = await readConfig(store, file);
  if (current.version !== version) throw new ConflictError(configPath(file));
  const change = configChange(file, current.source, data);
  return json(await commitChanges(store, [change], `Update ${configPath(file)}`, { [change.path]: version }));
});
