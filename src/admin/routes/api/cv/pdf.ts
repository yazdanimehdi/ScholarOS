import { GitHubStore } from '../../../../lib/admin/github-store';
import { HttpError, json, route } from '../../../../lib/admin/http';
import { CV_JSON } from '../../../../lib/admin/paths';
import { PostgresStore } from '../../../../lib/admin/postgres-store';
import { UpstreamError } from '../../../../lib/admin/store';
import { generateCvPdf, readCvMeta } from '../../../../lib/cv-pdf/generate';

export const prerender = false;

const WORKFLOW = 'render-cv.yml';

/** "Generate PDF": rendered here in Postgres mode, by the RenderCV workflow on GitHub Actions in git mode. */
export const POST = route(async (_ctx, store) => {
  if (store instanceof PostgresStore) {
    try {
      return json({ pdf: await generateCvPdf(store) });
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      throw new HttpError(502, `PDF generation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!(store instanceof GitHubStore)) throw new HttpError(501, 'PDF generation runs on GitHub Actions');
  await store.dispatchWorkflow(WORKFLOW);
  return json({ dispatched: true });
});

export const GET = route(async (_ctx, store) => {
  if (store instanceof PostgresStore) return json({ run: null, pdf: readCvMeta((await store.read(CV_JSON))?.content) });
  return json({ run: store instanceof GitHubStore ? await store.latestRun(WORKFLOW) : null });
});
