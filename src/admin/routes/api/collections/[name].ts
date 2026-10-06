import { listEntries } from '../../../../lib/admin/content';
import { json, route } from '../../../../lib/admin/http';
import { assertCollection } from '../../../../lib/admin/paths';

export const prerender = false;

export const GET = route(async ({ params }, store) => json(await listEntries(store, assertCollection(params.name))));
