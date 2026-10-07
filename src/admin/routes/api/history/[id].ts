import { HttpError, json, postgresOnly, route } from '../../../../lib/admin/http';

export const prerender = false;

export const GET = route(async ({ params }, store) => {
  const rev = await postgresOnly(store).revision(String(params.id));
  if (!rev) throw new HttpError(404, 'No such revision');
  return json(rev);
});
