import { GitHubStore } from '../../../../lib/admin/github-store';
import { HttpError, json, route } from '../../../../lib/admin/http';

export const prerender = false;

const WORKFLOW = 'render-cv.yml';

export const POST = route(async (_ctx, store) => {
  if (!(store instanceof GitHubStore)) throw new HttpError(501, 'PDF generation runs on GitHub Actions');
  await store.dispatchWorkflow(WORKFLOW);
  return json({ dispatched: true });
});

export const GET = route(async (_ctx, store) =>
  json({ run: store instanceof GitHubStore ? await store.latestRun(WORKFLOW) : null }),
);
