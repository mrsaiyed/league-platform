// The worker that keeps the tracker on the device (step 2.38, T-115, T-127):
// features/tracker/tracker-worker-script.ts.
import { trackerWorkerAnswer } from '../../../../features/tracker/index.ts';

type WorkerRouteProps = { readonly params: Promise<{ readonly league: string }> };

export async function GET(_request: Request, { params }: WorkerRouteProps): Promise<Response> {
  const { league } = await params;
  return trackerWorkerAnswer(league);
}
