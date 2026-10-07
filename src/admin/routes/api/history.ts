import { json, postgresOnly, route } from '../../../lib/admin/http';
import { assertAllowed } from '../../../lib/admin/paths';

export const prerender = false;

export const GET = route(async ({ url }, store) => {
  const path = url.searchParams.get('path') ?? '';
  assertAllowed(path);
  return json(await postgresOnly(store).history(path));
});
